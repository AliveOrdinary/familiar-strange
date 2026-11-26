// @the.familiarstrange render server.
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
import { mkdirSync, readFileSync, existsSync, rmSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { parseFile } from 'music-metadata'
import { synthesize, ttsCacheKey, listVoices } from './tts.mjs'
import { parseSay, stripPauses, captionPhrases } from '../shared/captions.js'
import { mountLibrary } from './library.mjs'
import { mountStudio, renderSig } from './studio.mjs'
import { mountCatalog } from './catalog.mjs'
import { speak, align, oneTakeKey, readWav, beatsFromTake, GEMINI_VOICES } from './voice.mjs'
import { vertexConfigured } from './vertex.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const PUBLIC_DIR = join(ROOT, 'public')
const FPS = 30
const BREATH_FRAMES = 12 // silence after each beat
const HOOK_EXTRA_FRAMES = 12 // let the question land before the first beat
const QUESTION_TAIL = 30 // extra frames after the payoff while the comment question is on screen

// The comment question: from the script, or the question line of the caption.
function commentQuestion(reel) {
  if (reel.script?.comment_question) return reel.script.comment_question
  const body = String(reel.caption || '').split(/\n\s*Sources:/i)[0]
  const q = body.split(/\n+/).map((l) => l.trim()).filter((l) => l.endsWith('?') && l.length < 140).pop()
  return q || null
}
const PORT = Number(process.env.PORT || 3123)
const SELF = process.env.PUBLIC_HOST || `http://127.0.0.1:${PORT}`
const HANDLE = process.env.IG_HANDLE || '@the.familiarstrange'

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
const library = mountLibrary(app, { supabase, publicDir: PUBLIC_DIR, self: SELF })

console.log('Bundling Remotion project…')
const serveUrl = await bundle({ entryPoint: join(ROOT, 'src', 'index.jsx') })
console.log('Bundle ready.')

// ---------------------------------------------------------------------------

// A reel's script is the collage format the template renders directly:
// { palette, sources, beats: [{ layout, say, pieces[], headline?, label?, tags? }] }
// Pieces and clips shipped in the repo are used as they are; anything else has
// to be an approved entry in the library, which is resolved to a URL here.
async function scriptBeats(script) {
  if (!Array.isArray(script?.beats) || !script.beats.length) throw new Error('Script must have beats[]')
  const beats = []
  for (const [i, b] of script.beats.entries()) {
    if (!b.say) throw new Error(`Beat ${i + 1} has no "say"`)
    const pieces = []
    for (const piece of b.pieces || []) {
      const spec = typeof piece === 'string' ? { name: piece } : { ...piece }
      const kind = spec.clip ? 'clip' : 'piece'
      const name = spec.clip || spec.name
      const shipped = kind === 'clip' ? join(PUBLIC_DIR, 'clips', `${name}.mp4`) : join(PUBLIC_DIR, 'pieces', `${name}.png`)
      if (!existsSync(shipped)) {
        const found = await library.resolve(kind, name)
        if (found.error) throw new Error(`Beat ${i + 1}: ${found.error}`)
        spec.src = found.src
        spec.aspect = found.aspect
      }
      pieces.push(spec)
    }
    beats.push({ ...b, pieces })
  }
  return beats
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

async function perSentenceBeats(raw, voice, question) {
  // Every sentence is synthesized on its own and the pauses between
  //    them are authored in the script ("Why? [0.6]"), so pacing is ours, not
  //    the voice model's. Knowing where each sentence starts also gives exact
  //    caption timing.
  const ttsDir = join(PUBLIC_DIR, 'tts')
  mkdirSync(ttsDir, { recursive: true })
  let synthesized = 0
  let reused = 0
  const beats = []
  for (const [i, b] of raw.entries()) {
    const clips = []
    const captions = []
    const sentenceStarts = []
    let cursor = b.layout === 'hook' ? 6 : 4 // tiny lead-in so the first word isn't clipped by the cut
    for (const sentence of parseSay(b.say)) {
      const file = join(ttsDir, `${ttsCacheKey(sentence.text, voice)}.mp3`)
      if (existsSync(file)) reused++
      else {
        await synthesize(sentence.text, file, voice)
        synthesized++
      }
      const frames = Math.round(((await parseFile(file)).format.duration || 1) * FPS)
      sentenceStarts.push(cursor)
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
      sentenceStarts,
      speechFrames: cursor,
      durationInFrames: cursor + BREATH_FRAMES + (b.layout === 'hook' ? HOOK_EXTRA_FRAMES : 0) + (question && i === raw.length - 1 ? QUESTION_TAIL : 0),
    })
  }
  console.log(`TTS (${voice || 'default voice'}): ${synthesized} synthesized, ${reused} reused from cache`)

  return { beats, voiceover: null }
}

// The whole voiceover in one take, then cut back into beats at the words
// where each beat starts.
const LEAD_FRAMES = 6 // tiny lead-in so the first word isn't clipped
async function oneTakeBeats(raw, voiceName, question) {
  const ttsDir = join(PUBLIC_DIR, 'tts')
  mkdirSync(ttsDir, { recursive: true })
  const byBeat = raw.map((b) => parseSay(b.say))
  const flat = byBeat.flatMap((ss, bi) => ss.map((x) => ({ ...x, bi })))
  const transcript = byBeat.map((ss) => ss.map((x) => x.text).join(' ')).join('\n\n')
  const key = oneTakeKey(transcript, voiceName)
  const file = join(ttsDir, `${key}.wav`)
  const timing = join(ttsDir, `${key}.json`)
  if (!existsSync(file)) writeFileSync(file, await speak(transcript, voiceName))
  const buf = readFileSync(file)
  let al
  if (existsSync(timing)) al = JSON.parse(readFileSync(timing, 'utf8'))
  if (!al || al.method !== 'speech-to-text') { al = await align(buf, flat); writeFileSync(timing, JSON.stringify(al)) } // retry: word timing may work now
  const { pcm, rate } = readWav(buf)
  const seconds = pcm.length / 2 / rate
  const beats = beatsFromTake(raw, flat, al, seconds, { fps: FPS, lead: LEAD_FRAMES, breath: BREATH_FRAMES, tail: question ? QUESTION_TAIL : 0 })
  console.log(`TTS: one take with ${voiceName}, ${seconds.toFixed(1)}s, timed by ${al.method}`)
  return { beats, voiceover: { src: `${SELF}/tts/${key}.wav`, from: LEAD_FRAMES } }
}

async function getVoiceSetting() {
  const { data } = await supabase.from('settings').select('value').eq('key', 'voice').maybeSingle()
  return data?.value || { provider: 'kokoro' }
}

async function runJob(reelId, voice) {
  const { data: reel, error } = await supabase.from('reels').select('*').eq('id', reelId).single()
  if (error || !reel) throw new Error('Reel not found: ' + (error?.message || reelId))
  await update(reelId, { status: 'rendering', error: null })

  const raw = await scriptBeats(reel.script)
  const question = commentQuestion(reel)

  // 1. Voice: one directed take (Gemini) when chosen in the Studio, otherwise
  //    Kokoro sentence by sentence.
  const voiceSetting = await getVoiceSetting()
  const useGemini = voiceSetting.provider === 'gemini' && vertexConfigured() && !voice
  const { beats, voiceover } = useGemini
    ? await oneTakeBeats(raw, voiceSetting.voice, question)
    : await perSentenceBeats(raw, voice, question)

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
    question,
    voiceover,
  }
  const compositionId = reel.script.format === 'type' ? 'TypeReel' : 'CollageReel'
  const comp = await selectComposition({ serveUrl, id: compositionId, inputProps })
  const outPath = join(PUBLIC_DIR, 'out', `${reelId}.mp4`)
  mkdirSync(dirname(outPath), { recursive: true })
  // crf 26 keeps a 45s reel near 10 MB, under Telegram's 20 MB send-by-link cap
  // Two browser tabs and a capped video-frame cache keep a three-clip reel
  // inside the container's memory limit; without them the kernel kills ffmpeg.
  await renderMedia({
    composition: comp,
    serveUrl,
    codec: 'h264',
    crf: 26,
    outputLocation: outPath,
    inputProps,
    concurrency: Number(process.env.RENDER_CONCURRENCY || 2),
    offthreadVideoCacheSizeInBytes: 256 * 1024 * 1024,
  })

  // 4. Upload. A per-render suffix gives a fresh URL every time, so the CDN
  //    can never serve a stale cut during review.
  const format = reel.script.format === 'type' ? 'type' : 'collage'
  const objectPath = `${reelId}/${format}-r${reel.revision}-${Date.now()}.mp4`
  const { error: upErr } = await supabase.storage
    .from('reels')
    .upload(objectPath, readFileSync(outPath), { contentType: 'video/mp4', upsert: true, cacheControl: '300' })
  if (upErr) throw new Error('Storage upload failed: ' + upErr.message)
  const { data: pub } = supabase.storage.from('reels').getPublicUrl(objectPath)

  // Drop earlier cuts of this reel, keeping the latest video of the other look.
  const { data: fresh } = await supabase.from('reels').select('videos').eq('id', reelId).maybeSingle()
  const otherUrl = Object.entries(fresh?.videos || {}).filter(([k]) => k !== format).map(([, v]) => v?.url).find(Boolean)
  try {
    const { data: existing } = await supabase.storage.from('reels').list(reelId, { limit: 100 })
    const stale = (existing || []).map((f) => `${reelId}/${f.name}`).filter((p) => p !== objectPath && !(otherUrl && otherUrl.endsWith('/' + p)))
    if (stale.length) await supabase.storage.from('reels').remove(stale)
  } catch (e) {
    console.warn('Could not prune old cuts:', e.message)
  }
  rmSync(outPath, { force: true })

  const duration = comp.durationInFrames / FPS
  const videos = { ...(fresh?.videos || {}), [format]: { url: pub.publicUrl, duration_s: duration.toFixed(1), sig: renderSig(reel.script, voice ? { provider: 'kokoro', voice } : voiceSetting) } }
  await update(reelId, { status: 'video_review', video_url: pub.publicUrl, duration_s: duration.toFixed(1), videos })
  pruneCache(join(PUBLIC_DIR, 'tts'), 30)
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

function enqueue(reelId, voiceIn) {
  if (busy === reelId || queue.some((j) => j.reelId === reelId)) return { error: 'already queued', reel_id: reelId }
  const voice = /^[a-z]{2}_[a-z0-9_]+$/i.test(voiceIn || '') ? voiceIn : undefined
  queue.push({ reelId, voice })
  const position = queue.length + (busy ? 1 : 0)
  drain()
  return { status: 'queued', reel_id: reelId, position }
}

app.post('/render', (req, res) => {
  const reelId = String(req.body?.reel_id || '')
  if (!/^[0-9a-f-]{36}$/i.test(reelId)) return res.status(400).json({ error: 'reel_id (uuid) required' })
  const out = enqueue(reelId, req.body?.voice)
  res.status(out.error ? 409 : 202).json(out)
})

mountStudio(app, { supabase, publicDir: PUBLIC_DIR, library, enqueue })
mountCatalog(app, { supabase, library })

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

// --- Narrator voice: audition in the Studio (#/voices), pick one for renders ---
async function sampleScript() {
  const { data } = await supabase.from('reels').select('review_notes, script, status, created_at').not('script', 'is', null).neq('status', 'rejected').order('created_at', { ascending: false }).limit(1)
  const r = data?.[0]
  const beats = r?.script?.beats || []
  if (!beats.length) return { title: 'Sample', text: 'You tip the waiter. You don’t tip the nurse. Why?' }
  return { title: r.review_notes || 'Latest script', text: beats.map((b) => parseSay(b.say).map((x) => x.text).join(' ')).join('\n\n') }
}

app.get('/voice', async (_req, res) => {
  try {
    res.json({ setting: await getVoiceSetting(), gemini: GEMINI_VOICES, kokoro: process.env.KOKORO_VOICE || 'am_michael', google: vertexConfigured(), sample: await sampleScript() })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/voice', async (req, res) => {
  const provider = req.body?.provider === 'gemini' ? 'gemini' : 'kokoro'
  const voice = String(req.body?.voice || '')
  if (provider === 'gemini' && !GEMINI_VOICES.some(([n]) => n === voice)) return res.status(400).json({ error: 'Unknown voice' })
  const value = provider === 'gemini' ? { provider, voice } : { provider }
  const { error } = await supabase.from('settings').upsert({ key: 'voice', value, updated_at: new Date().toISOString() })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, setting: value })
})

app.post('/voice/sample', async (req, res) => {
  try {
    const { text } = await sampleScript()
    const dir = join(PUBLIC_DIR, 'tts')
    mkdirSync(dir, { recursive: true })
    if (req.body?.provider === 'gemini') {
      const voice = String(req.body?.voice || '')
      if (!GEMINI_VOICES.some(([n]) => n === voice)) return res.status(400).json({ error: 'Unknown voice' })
      const key = oneTakeKey(text, voice)
      const file = join(dir, `${key}.wav`)
      if (!existsSync(file)) writeFileSync(file, await speak(text, voice))
      return res.json({ url: `/tts/${key}.wav` })
    }
    const key = 'kokoro-' + ttsCacheKey(text.replace(/\n+/g, ' '))
    const file = join(dir, `${key}.mp3`)
    if (!existsSync(file)) await synthesize(text.replace(/\n+/g, ' '), file)
    res.json({ url: `/tts/${key}.mp3` })
  } catch (e) {
    res.status(502).json({ error: String(e.message).slice(0, 600) })
  }
})

app.listen(PORT, () => console.log(`Render server on :${PORT}`))
