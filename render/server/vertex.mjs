// Google Vertex AI: cut-out images (Gemini image model) and short film clips (Veo).
//
// Credentials come from GOOGLE_CREDENTIALS_B64: the base64 of a gcloud
// "application default credentials" file (type authorized_user). The project
// is read from that file's quota_project_id unless GCP_PROJECT is set.
const IMAGE_MODEL = process.env.VERTEX_IMAGE_MODEL || 'gemini-3.1-flash-image'
const VIDEO_MODEL = process.env.VERTEX_VIDEO_MODEL || 'veo-3.1-fast-generate-001'
const VIDEO_REGION = process.env.VERTEX_VIDEO_REGION || 'us-central1'

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
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'x-goog-user-project': project(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Vertex AI ${res.status}: ${body.error?.message || 'request failed'}`.slice(0, 400))
  return body
}

// Returns a PNG/JPEG buffer.
export async function generateImage(prompt) {
  const url = `https://aiplatform.googleapis.com/v1/projects/${project()}/locations/global/publishers/google/models/${IMAGE_MODEL}:generateContent`
  const body = await call(url, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  })
  const part = (body.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data)
  if (!part) throw new Error('The image model returned no image (it may have declined the prompt)')
  return Buffer.from(part.inlineData.data, 'base64')
}

// Returns an mp4 buffer. Takes about a minute.
export async function generateVideo(prompt, { seconds = 4 } = {}) {
  const base = `https://${VIDEO_REGION}-aiplatform.googleapis.com/v1/projects/${project()}/locations/${VIDEO_REGION}/publishers/google/models/${VIDEO_MODEL}`
  const op = await call(`${base}:predictLongRunning`, {
    instances: [{ prompt }],
    parameters: { aspectRatio: '9:16', durationSeconds: seconds, sampleCount: 1, generateAudio: false },
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
