// One-take narration with Google's Gemini voices.
//
// Kokoro reads one sentence at a time, so the delivery never builds. Here the
// whole voiceover is read in one take, directed like a narrator, and then
// aligned back to the script so beats, cut-outs and captions still land on
// the right words.
//
// 1. speak()  → one WAV of the whole script (Gemini TTS through Vertex AI,
//               falling back to the Cloud Text-to-Speech API).
// 2. align()  → when each script word is spoken: Google Speech-to-Text word
//               times if that API answers, otherwise the pauses in the audio.
import { createHash } from 'node:crypto'
import { googleCall, googleProject } from './vertex.mjs'
import { captionPhrases, stripPauses } from '../shared/captions.js'

export const GEMINI_VOICES = [
  ['Charon', 'informative'],
  ['Sadaltager', 'knowledgeable'],
  ['Iapetus', 'clear'],
  ['Achird', 'friendly'],
  ['Algieba', 'smooth'],
  ['Sulafat', 'warm'],
  ['Aoede', 'breezy'],
  ['Gacrux', 'mature'],
]

export const DEFAULT_DIRECTION = `# AUDIO PROFILE: The narrator
A curious, warm storyteller who loves explaining why people do the everyday things they do.

## THE SCENE
Telling a friend something surprising they just learned, across a kitchen table. Relaxed and close to the microphone. Not a radio announcer, not a documentary voice.

### DIRECTOR'S NOTES
Style: conversational and intrigued, with a slight smile in the voice. Never salesy, never dramatic.
Pace: natural and a little brisk, with a short beat after each question.
Arc: the opening question sounds genuinely puzzled. Slow down a touch and lower the voice slightly on the key insight. Say the last line simply, like an aside to a friend.`

const TTS_CANDIDATES = (process.env.GEMINI_TTS_MODELS || 'gemini-2.5-pro-tts,gemini-2.5-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-pro-preview-tts,gemini-2.5-flash-preview-tts')
  .split(',').map((s) => s.trim()).filter(Boolean)
let ttsRoute = null // what worked last: { via: 'vertex' | 'cloud', model }

export const oneTakeKey = (text, voice, direction = DEFAULT_DIRECTION) =>
  createHash('sha1').update(['gemini', voice, direction, text].join('|')).digest('hex').slice(0, 16)

// --- WAV helpers (mono 16-bit PCM) ---
function wav(pcm, rate) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}
export function readWav(buf) {
  // find the "data" chunk; assumes 16-bit mono PCM
  let rate = buf.readUInt32LE(24)
  let i = 12
  while (i < buf.length - 8) {
    const id = buf.toString('ascii', i, i + 4)
    const size = buf.readUInt32LE(i + 4)
    if (id === 'fmt ') rate = buf.readUInt32LE(i + 12)
    if (id === 'data') return { pcm: buf.subarray(i + 8, i + 8 + size), rate }
    i += 8 + size + (size % 2)
  }
  throw new Error('No audio data in WAV')
}

// --- 1. Speak ---
async function viaVertex(model, transcript, voice, direction) {
  const url = `https://aiplatform.googleapis.com/v1/projects/${googleProject()}/locations/global/publishers/google/models/${model}:generateContent`
  const body = await googleCall(url, {
    contents: [{ role: 'user', parts: [{ text: `${direction}\n\n#### TRANSCRIPT\n${transcript}` }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  })
  const part = (body.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data)
  if (!part) throw new Error('Gemini TTS returned no audio')
  const rate = Number((part.inlineData.mimeType || '').match(/rate=(\d+)/)?.[1] || 24000)
  return wav(Buffer.from(part.inlineData.data, 'base64'), rate)
}

async function viaCloudTts(model, transcript, voice, direction) {
  const body = await googleCall('https://texttospeech.googleapis.com/v1/text:synthesize', {
    input: { prompt: direction, text: transcript },
    voice: { languageCode: 'en-US', name: voice, modelName: model },
    audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
  })
  if (!body.audioContent) throw new Error('Cloud TTS returned no audio')
  return Buffer.from(body.audioContent, 'base64') // LINEAR16 comes with a WAV header
}

export async function speak(transcript, voice, direction = DEFAULT_DIRECTION) {
  const routes = ttsRoute ? [ttsRoute] : []
  for (const model of TTS_CANDIDATES) routes.push({ via: 'vertex', model })
  for (const model of ['gemini-2.5-pro-tts', 'gemini-2.5-flash-tts']) routes.push({ via: 'cloud', model })
  const errors = []
  for (const r of routes) {
    try {
      const out = r.via === 'vertex' ? await viaVertex(r.model, transcript, voice, direction) : await viaCloudTts(r.model, transcript, voice, direction)
      if (!ttsRoute || ttsRoute.model !== r.model || ttsRoute.via !== r.via) console.log(`voice: using ${r.model} via ${r.via}`)
      ttsRoute = r
      return out
    } catch (e) {
      errors.push(`${r.model}@${r.via}: ${e.message.slice(0, 140)}`)
      if (!/ 40[034]|not found|NOT_FOUND|PERMISSION|disabled|has not been used|no audio/i.test(e.message)) break
      if (r === ttsRoute) ttsRoute = null
    }
  }
  throw new Error('No Gemini voice worked. ' + errors.join(' | '))
}

// --- 2. Align ---
const norm = (w) => w.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']/g, '')
export const scriptWords = (text) => (text.match(/\S+/g) || []).map(norm).filter(Boolean)

// Word times from Google Speech-to-Text, mapped onto the script's own words.
async function sttWords(buf) {
  const { pcm, rate } = readWav(buf)
  const body = await googleCall('https://speech.googleapis.com/v1/speech:recognize', {
    config: { encoding: 'LINEAR16', sampleRateHertz: rate, languageCode: 'en-US', enableWordTimeOffsets: true, model: 'latest_long' },
    audio: { content: pcm.toString('base64') },
  })
  const sec = (t) => Number(String(t || '0s').replace('s', ''))
  const out = []
  for (const r of body.results || []) for (const w of r.alternatives?.[0]?.words || []) {
    for (const piece of scriptWords(w.word)) out.push({ w: piece, start: sec(w.startTime), end: sec(w.endTime) })
  }
  if (out.length < 3) throw new Error('Speech-to-Text heard almost nothing')
  return out
}

// Classic edit-distance alignment between the script and what was heard;
// script words that weren't matched get times interpolated from neighbours.
function mapTimes(script, heard) {
  const n = script.length, m = heard.length
  const D = Array.from({ length: n + 1 }, (_, i) => new Int32Array(m + 1).fill(0).map((_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const same = script[i - 1] === heard[j - 1].w
    D[i][j] = Math.min(D[i - 1][j - 1] + (same ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1)
  }
  const t = new Array(n).fill(null)
  let i = n, j = m
  while (i > 0 && j > 0) {
    const same = script[i - 1] === heard[j - 1].w
    if (D[i][j] === D[i - 1][j - 1] + (same ? 0 : 1)) { if (same) t[i - 1] = heard[j - 1].start; i--; j-- }
    else if (D[i][j] === D[i - 1][j] + 1) i--
    else j--
  }
  return t
}

// Without word times: put each sentence boundary at the pause in the audio
// nearest to where it "should" be by length of text.
function silenceGaps(buf) {
  const { pcm, rate } = readWav(buf)
  const win = Math.round(rate * 0.02) // 20 ms
  const frames = []
  for (let o = 0; o + win * 2 <= pcm.length; o += win * 2) {
    let sum = 0
    for (let k = 0; k < win; k++) { const s = pcm.readInt16LE(o + k * 2); sum += s * s }
    frames.push(Math.sqrt(sum / win))
  }
  const loud = [...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.9)] || 1
  const quiet = frames.map((v) => v < loud * 0.06)
  const gaps = []
  let s = null
  quiet.forEach((q, k) => {
    if (q && s === null) s = k
    if ((!q || k === quiet.length - 1) && s !== null) {
      if (k - s >= 6) gaps.push({ start: s * 0.02, end: k * 0.02 }) // ≥ 120 ms of quiet
      s = null
    }
  })
  return { gaps, duration: frames.length * 0.02 }
}

// sentences: [{ text, words }] in order. Returns, per sentence, its start time
// and the start time of each of its words (seconds), plus how it was found.
export async function align(buf, sentences) {
  const flat = sentences.flatMap((s, si) => scriptWords(s.text).map((w) => ({ w, si })))
  try {
    const heard = await sttWords(buf)
    const times = mapTimes(flat.map((x) => x.w), heard)
    // fill gaps by interpolation
    const known = times.map((t, k) => (t == null ? null : k)).filter((k) => k != null)
    if (known.length < flat.length * 0.6) throw new Error('alignment too weak')
    for (let k = 0; k < times.length; k++) if (times[k] == null) {
      const prev = [...known].reverse().find((x) => x < k), next = known.find((x) => x > k)
      times[k] = prev == null ? times[next] : next == null ? times[prev] : times[prev] + ((times[next] - times[prev]) * (k - prev)) / (next - prev)
    }
    const out = sentences.map(() => ({ words: [] }))
    flat.forEach((x, k) => out[x.si].words.push(times[k]))
    return { method: 'speech-to-text', sentences: out.map((o) => ({ start: o.words[0], words: o.words })) }
  } catch (e) {
    console.warn('voice: word timing unavailable, using pauses in the audio:', e.message.slice(0, 160))
  }
  const { gaps, duration } = silenceGaps(buf)
  const speechStart = gaps[0]?.start === 0 ? gaps[0].end : 0
  const speechEnd = gaps.length && Math.abs(gaps[gaps.length - 1].end - duration) < 0.05 ? gaps[gaps.length - 1].start : duration
  const lens = sentences.map((s) => s.text.length + 8)
  const total = lens.reduce((a, b) => a + b, 0)
  const starts = [speechStart]
  let acc = 0
  let lastGap = -1
  for (let k = 1; k < sentences.length; k++) {
    acc += lens[k - 1]
    const guess = speechStart + ((speechEnd - speechStart) * acc) / total
    let best = null
    for (let g = lastGap + 1; g < gaps.length; g++) {
      const mid = gaps[g].end
      if (mid <= starts[k - 1] + 0.3) continue
      if (Math.abs(mid - guess) > 2) { if (mid > guess) break; else continue }
      if (best == null || Math.abs(mid - guess) < Math.abs(gaps[best].end - guess)) best = g
    }
    if (best != null) { starts.push(gaps[best].end); lastGap = best } else starts.push(guess)
  }
  const ends = [...starts.slice(1), speechEnd]
  return {
    method: 'pauses',
    sentences: sentences.map((s, k) => {
      const ws = scriptWords(s.text)
      const lensW = ws.map((w) => w.length + 1)
      const tw = lensW.reduce((a, b) => a + b, 0) || 1
      let a = 0
      return { start: starts[k], words: ws.map((_, i) => { const t = starts[k] + ((ends[k] - starts[k]) * a) / tw; a += lensW[i]; return t }) }
    }),
  }
}

// --- 3. Cut the take back into beats ---
// raw: the script's beats; flat: their sentences in order ({ text, bi });
// al: align()'s result; seconds: length of the take. Beat cuts land a few
// frames before the first word of each beat.
export function beatsFromTake(raw, flat, al, seconds, { fps = 30, lead = 6, breath = 12, tail = 0 } = {}) {
  const f = (t) => Math.round(t * fps) + lead
  const endFrame = f(seconds)
  const firstOf = raw.map((_, bi) => flat.findIndex((x) => x.bi === bi))
  const starts = raw.map((_, bi) => (bi === 0 || firstOf[bi] < 0 ? 0 : Math.max(1, f(al.sentences[firstOf[bi]].start) - 3)))
  for (let i = 1; i < starts.length; i++) if (starts[i] <= starts[i - 1]) starts[i] = starts[i - 1] + 1
  return raw.map((b, bi) => {
    const from = starts[bi]
    const to = bi < raw.length - 1 ? starts[bi + 1] : endFrame + breath + tail
    const sentenceStarts = []
    const captions = []
    flat.forEach((x, k) => {
      if (x.bi !== bi) return
      const s = al.sentences[k]
      sentenceStarts.push(Math.max(0, f(s.start) - from))
      let w = 0
      for (const p of captionPhrases(x.text)) {
        const t = s.words[Math.min(w, s.words.length - 1)] ?? s.start
        captions.push({ text: p, from: Math.max(0, f(t) - from) })
        w += scriptWords(p).length
      }
    })
    const speechEnd = bi < raw.length - 1 ? starts[bi + 1] : endFrame
    return { ...b, say: stripPauses(b.say), clips: [], captions, sentenceStarts, speechFrames: speechEnd - from, durationInFrames: to - from }
  })
}
