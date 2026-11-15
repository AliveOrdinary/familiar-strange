// Text-to-speech providers. Kokoro (self-hosted, free) is the default;
// ElevenLabs stays available as a drop-in upgrade if the voice ever turns out
// to be what's holding reels back. Switch with TTS_PROVIDER.
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const PROVIDER = (process.env.TTS_PROVIDER || 'kokoro').toLowerCase()

export function ttsConfigKey(voice) {
  if (PROVIDER === 'elevenlabs') {
    return ['elevenlabs', process.env.ELEVENLABS_VOICE_ID, process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2'].join('|')
  }
  return ['kokoro', voice || process.env.KOKORO_VOICE || 'am_michael', process.env.KOKORO_SPEED || '1'].join('|')
}

// Content-addressed: same text + provider + voice = same file, so re-rendering
// an edited script only re-synthesizes the lines that changed.
export function ttsCacheKey(text, voice) {
  return createHash('sha1').update(text + '|' + ttsConfigKey(voice)).digest('hex').slice(0, 16)
}

export async function synthesize(text, outPath, voiceOverride) {
  if (PROVIDER === 'elevenlabs') return elevenlabs(text, outPath)
  return kokoro(text, outPath, voiceOverride)
}

async function kokoro(text, outPath, voiceOverride) {
  const base = process.env.KOKORO_URL || 'http://kokoro:8880'
  const res = await fetch(`${base}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice: voiceOverride || process.env.KOKORO_VOICE || 'am_michael',
      response_format: 'mp3',
      speed: Number(process.env.KOKORO_SPEED || 1),
    }),
  })
  if (!res.ok) throw new Error(`Kokoro ${res.status}: ${(await res.text()).slice(0, 300)}`)
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()))
}

async function elevenlabs(text, outPath) {
  const voice = process.env.ELEVENLABS_VOICE_ID
  if (!process.env.ELEVENLABS_API_KEY || !voice) throw new Error('TTS_PROVIDER=elevenlabs needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
      voice_settings: { stability: 0.55, similarity_boost: 0.7, style: 0.2 },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`)
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()))
}

export async function listVoices() {
  if (PROVIDER !== 'kokoro') return []
  const base = process.env.KOKORO_URL || 'http://kokoro:8880'
  const res = await fetch(`${base}/v1/audio/voices`)
  if (!res.ok) throw new Error(`Kokoro ${res.status}`)
  return (await res.json()).voices || []
}
