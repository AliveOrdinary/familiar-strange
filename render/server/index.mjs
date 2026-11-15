// @familiar.strange render server.
//
// POST /render { reel_id, voice? }  → 202, queued. Renders one reel at a time.
// Flow: reels.script (collage beats) → TTS per beat (cached) → measure durations →
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
import { parseSay, stripPauses, captionPhrases } from '../shared/captions.js'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const PUBLIC_DIR = join(ROOT, 'public')
const FPS = 30
const BREATH_FRAMES = 12 // silence after each beat
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

// A reel's script is the collage format the template renders directly:
// { palette, sources, beats: [{ layout, say, pieces[], headline?, label?, tags? }] }
function scriptBeats(script) {
  if (!Array.isArray(script?.beats) || !script.beats.length) throw new Error('Script must have beats[]')
  for (const [i, b] of script.beats.entries()) {
    if (!b.say) throw new Error(`Beat ${i + 1} has no "say"`)
    for (const name of b.pieces || []) {
      if (!existsSync(join(PUBLIC_DIR, 'pieces', `${name}.png`))) throw new Error(`Beat ${i + 1}: no cut-out named "${name}"`)
    }
  }
  return script.beats
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

async function runJob(reelId, voice) {
  const { data: reel, error } = await supabase.from('reels').select('*').eq('id', reelId).single()
  if (error || !reel) throw new Error('Reel not found: ' + (error?.message || reelId))
  await update(reelId, { status: 'rendering', error: null })

  const raw = scriptBeats(reel.script)

  // 1. Voice. Every sentence is synthesized on its own and the pauses between
  //    them are authored in the script ("Why? [0.6]"), so pacing is ours, not
  //    the voice model's. Knowing where each sentence starts also gives exact
  //    caption timing.
  const ttsDir = join(PUBLIC_DIR, 'tts')
  mkdirSync(ttsDir, { recursive: true })
  let synthesized = 0
  let reused = 0
  const beats = []
  for (const b of raw) {
    const clips = []
    const captions = []
    let cursor = b.layout === 'hook' ? 6 : 4 // tiny lead-in so the first word isn't clipped by the cut
    for (const sentence of parseSay(b.say)) {
      const file = join(ttsDir, `${ttsCacheKey(sentence.text, voice)}.mp3`)
      if (existsSync(file)) reused++
      else {
        await synthesize(sentence.text, file, voice)
        synthesized++
      }
      const frames = Math.round(((await parseFile(file)).format.duration || 1) * FPS)
      clips.push({ src: `${SELF}/tts/${file.split('/').pop()}`, from: cursor })
      const phrases = captionPhrases(sentence.text)
      const total = phrases.reduce((n, p) => n + p.length, 0) || 1
      let done = 0
      for (const p of phrases) {
        captions.push({ text: p, from: Math.round(cursor + (frames * done) / total) })
        done += p.length
      }
      cursor += frames + Math.round(sentence.pause * FPS)
    }
    beats.push({
      ...b,
      say: stripPauses(b.say),
      clips,
      captions,
      speechFrames: cursor,
      durationInFrames: cursor + BREATH_FRAMES + (b.layout === 'hook' ? HOOK_EXTRA_FRAMES : 0),
    })
  }
  console.log(`TTS (${voice || 'default voice'}): ${synthesized} synthesized, ${reused} reused from cache`)

  // 2. Render
  const { count } = await supabase
    .from('reels')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
  const inputProps = {
    palette: reel.script.palette || 'tomato',
    number: reel.script.number || (count || 0) + 1,
    sources: reel.script.sources || '',
    beats,
  }
  const comp = await selectComposition({ serveUrl, id: 'CollageReel', inputProps })
  const outPath = join(PUBLIC_DIR, 'out', `${reelId}.mp4`)
  mkdirSync(dirname(outPath), { recursive: true })
  // crf 26 keeps a 45s reel near 10 MB, under Telegram's 20 MB send-by-link cap
  await renderMedia({ composition: comp, serveUrl, codec: 'h264', crf: 26, outputLocation: outPath, inputProps })

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
  const job = queue.shift()
  busy = job.reelId
  const reelId = job.reelId
  try {
    const out = await runJob(reelId, job.voice)
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
  if (busy === reelId || queue.some((j) => j.reelId === reelId)) return res.status(409).json({ status: 'already queued', reel_id: reelId })
  const voice = /^[a-z]{2}_[a-z0-9_]+$/i.test(req.body?.voice || '') ? req.body.voice : undefined
  queue.push({ reelId, voice })
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
