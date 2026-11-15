// @familiar.strange render server.
//
// POST /render { reel_id }  → 202, queued. Renders one reel at a time.
// Flow: reels.script + assets → TTS per line (cached) → measure durations →
// Remotion render → upload mp4 to the public 'reels' bucket → reels row moves
// to 'video_review' (or 'error') → optional callback to n8n.
//
// GET  /health              → { ok, busy, queued }
// GET  /voices              → Kokoro voice list (for auditioning)
// POST /audition { text, voice? } → mp3 of that text, to compare voices by ear
import 'dotenv/config'
import express from 'express'
import { mkdirSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { parseFile } from 'music-metadata'
import { synthesize, ttsCacheKey, listVoices } from './tts.mjs'
import { cacheImage } from './images.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const PUBLIC_DIR = join(ROOT, 'public')
const FPS = 30
const BREATH_FRAMES = 9 // silence after each line
const HOOK_EXTRA_FRAMES = 12 // let the question land before the first beat
const PORT = Number(process.env.PORT || 3123)
const SELF = process.env.PUBLIC_HOST || `http://127.0.0.1:${PORT}`
const HANDLE = process.env.IG_HANDLE || '@familiar.strange'

for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[k]) {
    console.error(`Missing env var ${k} — copy .env.example to .env and fill it in.`)
    process.exit(1)
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const app = express()
app.use(express.json())
app.use(express.static(PUBLIC_DIR))

console.log('Bundling Remotion project…')
const serveUrl = await bundle({ entryPoint: join(ROOT, 'src', 'index.jsx') })
console.log('Bundle ready.')

// ---------------------------------------------------------------------------

function scriptLines(script) {
  if (!script?.hook || !Array.isArray(script.beats) || !script.payoff) {
    throw new Error('Script must have hook, beats[] and payoff')
  }
  const lines = [
    { kind: 'hook', ...script.hook },
    ...script.beats.map((b) => ({ kind: 'beat', ...b })),
    { kind: 'payoff', ...script.payoff },
  ]
  if (script.cta?.say) lines.push({ kind: 'cta', ...script.cta })
  for (const l of lines) {
    if (!l.say) throw new Error(`Empty "say" on a ${l.kind} line`)
    l.show = l.show || l.say
  }
  return lines
}

async function update(reelId, fields) {
  const { error } = await supabase.from('reels').update(fields).eq('id', reelId)
  if (error) console.error('reels update failed:', error.message)
}

async function callback(body) {
  if (!process.env.CALLBACK_URL) return
  try {
    await fetch(process.env.CALLBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    console.warn('Callback failed:', e.message)
  }
}

async function runJob(reelId) {
  const { data: reel, error } = await supabase.from('reels').select('*').eq('id', reelId).single()
  if (error || !reel) throw new Error('Reel not found: ' + (error?.message || reelId))
  await update(reelId, { status: 'rendering', error: null })

  const raw = scriptLines(reel.script)

  // 1. Images: one per line where available; lines without their own image
  //    hold the previous one, so the pan simply continues.
  const { data: assets } = await supabase.from('assets').select('*').eq('reel_id', reelId)
  const byIndex = new Map((assets || []).map((a) => [a.beat_index, a]))
  const imgDir = join(PUBLIC_DIR, 'img')
  let lastImage = null
  let lastCredit = null
  const images = []
  for (let i = 0; i < raw.length; i++) {
    const a = byIndex.get(i)
    if (a) {
      try {
        const file = await cacheImage(a.file_url, imgDir)
        lastImage = `${SELF}/img/${file}`
        lastCredit = a.attribution || `${a.provider}, ${a.license}`
      } catch (e) {
        console.warn(`Image for line ${i} skipped: ${e.message}`)
      }
    }
    images.push({ image: lastImage, credit: lastCredit })
  }
  // If the hook had no image but a later line did, open on the first one.
  const firstImg = images.find((x) => x.image)
  for (const x of images) {
    if (!x.image && firstImg) Object.assign(x, firstImg)
    else break
  }

  // 2. Voice, per line, measured
  const ttsDir = join(PUBLIC_DIR, 'tts')
  mkdirSync(ttsDir, { recursive: true })
  let synthesized = 0
  let reused = 0
  const lines = []
  for (let i = 0; i < raw.length; i++) {
    const file = join(ttsDir, `${ttsCacheKey(raw[i].say)}.mp3`)
    if (existsSync(file)) reused++
    else {
      await synthesize(raw[i].say, file)
      synthesized++
    }
    const seconds = (await parseFile(file)).format.duration || 2
    const speechFrames = Math.round(seconds * FPS)
    lines.push({
      kind: raw[i].kind,
      say: raw[i].say,
      show: raw[i].show,
      src: `${SELF}/tts/${file.split('/').pop()}`,
      speechFrames,
      durationInFrames: speechFrames + BREATH_FRAMES + (raw[i].kind === 'hook' ? HOOK_EXTRA_FRAMES : 0),
      ...images[i],
    })
  }
  console.log(`TTS: ${synthesized} synthesized, ${reused} reused from cache`)

  // 3. Render
  const { count } = await supabase
    .from('reels')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
  const ambientPath = join(PUBLIC_DIR, 'audio', 'ambient.mp3')
  const inputProps = {
    lines,
    number: (count || 0) + 1,
    handle: HANDLE,
    ambientSrc: existsSync(ambientPath) ? `${SELF}/audio/ambient.mp3` : null,
  }
  const comp = await selectComposition({ serveUrl, id: 'WhyReel', inputProps })
  const outPath = join(PUBLIC_DIR, 'out', `${reelId}.mp4`)
  mkdirSync(dirname(outPath), { recursive: true })
  await renderMedia({ composition: comp, serveUrl, codec: 'h264', outputLocation: outPath, inputProps })

  // 4. Upload. A per-render suffix gives a fresh URL every time, so the CDN
  //    can never serve a stale cut during review.
  const objectPath = `${reelId}/r${reel.revision}-${Date.now()}.mp4`
  const { error: upErr } = await supabase.storage
    .from('reels')
    .upload(objectPath, readFileSync(outPath), { contentType: 'video/mp4', upsert: true, cacheControl: '300' })
  if (upErr) throw new Error('Storage upload failed: ' + upErr.message)
  const { data: pub } = supabase.storage.from('reels').getPublicUrl(objectPath)

  // Drop earlier cuts of this reel so the bucket holds one file per reel.
  try {
    const { data: existing } = await supabase.storage.from('reels').list(reelId, { limit: 100 })
    const stale = (existing || []).map((f) => `${reelId}/${f.name}`).filter((p) => p !== objectPath)
    if (stale.length) await supabase.storage.from('reels').remove(stale)
  } catch (e) {
    console.warn('Could not prune old cuts:', e.message)
  }
  rmSync(outPath, { force: true })

  const duration = comp.durationInFrames / FPS
  await update(reelId, { status: 'video_review', video_url: pub.publicUrl, duration_s: duration.toFixed(1) })
  pruneCache(ttsDir, 30)
  pruneCache(imgDir, 30)
  console.log(`✔ ${reelId} → ${pub.publicUrl} (${duration.toFixed(1)}s)`)
  return { video_url: pub.publicUrl, duration_s: duration }
}

function pruneCache(dir, maxAgeDays) {
  if (!existsSync(dir)) return
  const cutoff = Date.now() - maxAgeDays * 86400000
  for (const f of readdirSync(dir)) {
    try {
      if (statSync(join(dir, f)).mtimeMs < cutoff) rmSync(join(dir, f), { force: true })
    } catch { /* ignore */ }
  }
}

// --- simple sequential queue (one Chromium render at a time) ---------------
const queue = []
let busy = null

async function drain() {
  if (busy || !queue.length) return
  busy = queue.shift()
  const reelId = busy
  try {
    const out = await runJob(reelId)
    await callback({ reel_id: reelId, status: 'video_review', ...out })
  } catch (err) {
    console.error(`✖ ${reelId} failed:`, err.message)
    await update(reelId, { status: 'error', error: String(err.message).slice(0, 500) })
    await callback({ reel_id: reelId, status: 'error', error: err.message })
  } finally {
    busy = null
    drain()
  }
}

app.post('/render', (req, res) => {
  const reelId = String(req.body?.reel_id || '')
  if (!/^[0-9a-f-]{36}$/i.test(reelId)) return res.status(400).json({ error: 'reel_id (uuid) required' })
  if (busy === reelId || queue.includes(reelId)) return res.status(409).json({ status: 'already queued', reel_id: reelId })
  queue.push(reelId)
  res.status(202).json({ status: 'queued', reel_id: reelId, position: queue.length + (busy ? 1 : 0) })
  drain()
})

app.get('/health', (_req, res) => res.json({ ok: true, busy, queued: queue.length }))

app.get('/voices', async (_req, res) => {
  try {
    res.json({ voices: await listVoices() })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

app.post('/audition', async (req, res) => {
  const text = String(req.body?.text || 'You tip the waiter. You don’t tip the nurse. Why?').slice(0, 400)
  const file = join(tmpdir(), `audition-${Date.now()}.mp3`)
  try {
    await synthesize(text, file, req.body?.voice)
    res.type('audio/mpeg').send(readFileSync(file))
  } catch (e) {
    res.status(502).json({ error: e.message })
  } finally {
    rmSync(file, { force: true })
  }
})

app.listen(PORT, () => console.log(`Render server on :${PORT}`))
