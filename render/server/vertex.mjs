// Google Vertex AI: cut-out images (Gemini image model) and short film clips (Veo).
//
// Credentials come from GOOGLE_CREDENTIALS_B64: the base64 of a gcloud
// "application default credentials" file (type authorized_user). The project
// is read from that file's quota_project_id unless GCP_PROJECT is set.
const IMAGE_MODEL = process.env.VERTEX_IMAGE_MODEL || 'gemini-3.1-flash-image'
const VIDEO_MODEL = process.env.VERTEX_VIDEO_MODEL || 'veo-3.1-fast-generate-001'
const VIDEO_REGION = process.env.VERTEX_VIDEO_REGION || 'us-central1'
const TEXT_MODEL = process.env.VERTEX_TEXT_MODEL || 'gemini-3.1-flash-lite'

let creds = null
let token = { value: null, expires: 0 }

function credentials() {
  if (creds) return creds
  const b64 = process.env.GOOGLE_CREDENTIALS_B64
  if (!b64) throw new Error('GOOGLE_CREDENTIALS_B64 is not set on the stack')
  let parsed
  try {
    parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch {
    throw new Error('GOOGLE_CREDENTIALS_B64 is not valid base64 JSON')
  }
  if (parsed.type !== 'authorized_user' || !parsed.refresh_token) throw new Error('GOOGLE_CREDENTIALS_B64 must be a gcloud application-default credentials file')
  creds = parsed
  return creds
}

export const vertexConfigured = () => !!process.env.GOOGLE_CREDENTIALS_B64
const project = () => process.env.GCP_PROJECT || credentials().quota_project_id

async function accessToken() {
  if (token.value && Date.now() < token.expires - 60000) return token.value
  const c = credentials()
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new Error(`Google sign-in failed (${res.status}): ${body.error_description || body.error || 'no token'}`)
  token = { value: body.access_token, expires: Date.now() + (body.expires_in || 3000) * 1000 }
  return token.value
}

async function call(url, payload) {
  // Google answers 429 when a per-minute quota is used up; wait and try again.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'x-goog-user-project': project(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) return body
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 30000 * (attempt + 1)))
      continue
    }
    throw new Error(`Vertex AI ${res.status}: ${body.error?.message || 'request failed'}`.slice(0, 400))
  }
}

// Returns a PNG/JPEG buffer. `aspectRatio` (e.g. "9:16") is passed when given;
// if the model rejects the option, the request is retried without it.
export async function generateImage(prompt, { aspectRatio } = {}) {
  const url = `https://aiplatform.googleapis.com/v1/projects/${project()}/locations/global/publishers/google/models/${IMAGE_MODEL}:generateContent`
  const payload = (withAspect) => ({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], ...(withAspect && aspectRatio ? { imageConfig: { aspectRatio } } : {}) },
  })
  let body
  try {
    body = await call(url, payload(true))
  } catch (e) {
    if (!aspectRatio || !/imageConfig|aspect/i.test(e.message)) throw e
    body = await call(url, payload(false))
  }
  const part = (body.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data)
  if (!part) throw new Error('The image model returned no image (it may have declined the prompt)')
  return Buffer.from(part.inlineData.data, 'base64')
}

// Returns an mp4 buffer. Takes about a minute. With `image` (a PNG/JPEG
// buffer) the clip starts from that frame.
export async function generateVideo(prompt, { seconds = 4, image } = {}) {
  const base = `https://${VIDEO_REGION}-aiplatform.googleapis.com/v1/projects/${project()}/locations/${VIDEO_REGION}/publishers/google/models/${VIDEO_MODEL}`
  const instance = { prompt }
  if (image) instance.image = { bytesBase64Encoded: image.toString('base64'), mimeType: image[0] === 0x89 ? 'image/png' : 'image/jpeg' }
  const op = await call(`${base}:predictLongRunning`, {
    instances: [instance],
    parameters: { aspectRatio: '9:16', durationSeconds: seconds, sampleCount: 1, generateAudio: false, ...(image ? { resizeMode: 'crop' } : {}) },
  })
  if (!op.name) throw new Error('Veo did not start an operation')
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 10000))
    const s = await call(`${base}:fetchPredictOperation`, { operationName: op.name })
    if (!s.done) continue
    if (s.error) throw new Error(`Veo failed: ${s.error.message}`)
    const v = s.response?.videos?.[0]
    if (v?.bytesBase64Encoded) return Buffer.from(v.bytesBase64Encoded, 'base64')
    throw new Error(`Veo returned no video${s.response?.raiMediaFilteredReasons ? ': ' + s.response.raiMediaFilteredReasons.join('; ') : ''}`)
  }
  throw new Error('Veo did not finish within 7 minutes')
}

// Gemini text model with a JSON answer. `parts` may include images or video
// as { inlineData: { mimeType, data } }.
//
// Which text models a project can reach varies, so this tries a short list
// and remembers the first that answers. As a last resort it uses the image
// model, which also reads images and video and can answer in text.
const TEXT_CANDIDATES = [
  [TEXT_MODEL, 'global'],
  [TEXT_MODEL, 'us-central1'],
  ['gemini-3-flash-preview', 'global'],
  ['gemini-3-flash', 'us-central1'],
  ['gemini-3.1-pro', 'global'],
  [IMAGE_MODEL, 'global'],
]
let textModel = null // [model, region] that worked

const endpoint = ([model, region]) =>
  `https://${region === 'global' ? '' : region + '-'}aiplatform.googleapis.com/v1/projects/${project()}/locations/${region}/publishers/google/models/${model}:generateContent`

function parseJson(text) {
  try { return JSON.parse(text) } catch {}
  const m = String(text).match(/\{[\s\S]*\}/)
  if (m) try { return JSON.parse(m[0]) } catch {}
  throw new Error('Gemini did not return valid JSON')
}

// Vertex's schema dialect is stricter than JSON Schema (an enum needs a
// matching format, for instance), so only the plain structure is sent and the
// values are checked by the caller.
function cleanSchema(x) {
  if (Array.isArray(x)) return x.map(cleanSchema)
  if (!x || typeof x !== 'object') return x
  const out = {}
  for (const [k, v] of Object.entries(x)) if (k !== 'enum' && k !== 'description') out[k] = cleanSchema(v)
  return out
}

async function tryModel(cand, contents, schema, temperature) {
  const isImage = cand[0] === IMAGE_MODEL
  const text = async (cfg, extra) => {
    const body = await call(endpoint(cand), { contents: extra ? [{ ...contents[0], parts: [...contents[0].parts, extra] }] : contents, generationConfig: cfg })
    return (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
  }
  const tell = { text: `Answer with JSON only, no other text, matching this structure: ${JSON.stringify(cleanSchema(schema))}` }
  if (isImage) return parseJson(await text({ temperature, responseModalities: ['TEXT', 'IMAGE'] }, tell))
  try {
    return parseJson(await text({ temperature, responseMimeType: 'application/json', responseSchema: cleanSchema(schema) }))
  } catch (e) {
    if (/ 404|not found|NOT_FOUND|PERMISSION_DENIED|does not have access/i.test(e.message)) throw e
    return parseJson(await text({ temperature }, tell)) // model dislikes the schema: ask in words
  }
}

export async function askGemini(parts, schema, { temperature = 0.4 } = {}) {
  const contents = [{ role: 'user', parts: parts.map((p) => (typeof p === 'string' ? { text: p } : p)) }]
  if (textModel) {
    try { return await tryModel(textModel, contents, schema, temperature) } catch (e) {
      if (!/ 4\d\d/.test(e.message)) throw e
      textModel = null // it stopped working: search again
    }
  }
  const errors = []
  for (const cand of TEXT_CANDIDATES) {
    try {
      const out = await tryModel(cand, contents, schema, temperature)
      textModel = cand
      console.log(`gemini: using ${cand[0]} (${cand[1]})`)
      return out
    } catch (e) {
      errors.push(`${cand[0]}@${cand[1]}: ${e.message.slice(0, 120)}`)
      if (!/ 4\d\d|JSON/.test(e.message)) break // network trouble, not the model: stop
    }
  }
  throw new Error('No Gemini text model worked. ' + errors.join(' | '))
}

// For troubleshooting: which text models answer from this project.
export async function probeGemini() {
  const contents = [{ role: 'user', parts: [{ text: 'Reply with {"ok": true}' }] }]
  const schema = { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] }
  const out = []
  for (const cand of TEXT_CANDIDATES) {
    try { out.push({ model: cand[0], region: cand[1], result: await tryModel(cand, contents, schema, 0) }) } catch (e) { out.push({ model: cand[0], region: cand[1], error: e.message.slice(0, 300) }) }
  }
  return out
}

// For other Google APIs on the same account (speech, text-to-speech).
export const googleCall = (url, payload) => call(url, payload)
export const googleProject = () => project()
