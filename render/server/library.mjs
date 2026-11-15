// The asset library: generated cut-outs and film clips, each reviewed by a
// person before any reel may use it.
//
// GET  /library                     review page
// GET  /library.json                all rows
// POST /library { kind, name, description }   generate a new piece or clip
// POST /library/:id/approve | reject
// POST /library/:id/regenerate { description? }
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateImage, generateVideo, vertexConfigured } from './vertex.mjs'
import { keyGreen } from './keying.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const CAPS = { piece: Number(process.env.DAILY_IMAGE_CAP || 30), clip: Number(process.env.DAILY_CLIP_CAP || 6) }

const piecePrompt = (d) =>
  `A single hand-cut paper cut-out of ${d}, as a black-and-white halftone photograph with visible print dots, with a thick uneven white paper border around its outline. Centred on a completely flat, solid bright green background (#00FF00). No shadow, no other objects, no text.`
const clipPrompt = (d) =>
  `Black and white documentary film footage with heavy film grain. Static camera. ${d.replace(/\.?\s*$/, '.')} No text, no captions, no watermark.`

export function mountLibrary(app, { supabase, publicDir, self }) {
  const dirs = { piece: join(publicDir, 'lib', 'pieces'), clip: join(publicDir, 'lib', 'clips') }
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
  const urlOf = (row) => (row.file ? `${self}/lib/${row.kind === 'piece' ? 'pieces' : 'clips'}/${row.file}` : null)

  const set = async (id, fields) => {
    const { error } = await supabase.from('library').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('library update failed:', error.message)
  }

  async function generate(row) {
    try {
      const stamp = Date.now()
      if (row.kind === 'piece') {
        const prompt = piecePrompt(row.description)
        const raw = await generateImage(prompt)
        const keyed = await keyGreen(raw)
        const file = `${row.name}-${stamp}.png`
        writeFileSync(join(dirs.piece, file), keyed.png)
        await set(row.id, { status: 'pending', file, aspect: keyed.aspect, prompt, error: null })
      } else {
        const prompt = clipPrompt(row.description)
        const mp4 = await generateVideo(prompt)
        const file = `${row.name}-${stamp}.mp4`
        writeFileSync(join(dirs.clip, file), mp4)
        await set(row.id, { status: 'pending', file, aspect: 1.25, prompt, error: null })
      }
      console.log(`library: ${row.kind} "${row.name}" ready for review`)
    } catch (e) {
      console.error(`library: ${row.kind} "${row.name}" failed:`, e.message)
      await set(row.id, { status: 'error', error: String(e.message).slice(0, 500) })
    }
  }

  async function underCap(kind) {
    const since = new Date(Date.now() - 86400000).toISOString()
    const { count } = await supabase.from('library').select('id', { count: 'exact', head: true }).eq('kind', kind).gte('updated_at', since)
    return (count || 0) < CAPS[kind]
  }

  // Used by the renderer: where an approved asset lives, or why it can't be used.
  async function resolve(kind, name) {
    const { data } = await supabase.from('library').select('*').eq('kind', kind).eq('name', name).maybeSingle()
    if (!data) return { error: `no ${kind === 'piece' ? 'cut-out' : 'film clip'} named "${name}"` }
    if (data.status !== 'approved') return { error: `"${name}" is ${data.status}, not approved yet (see /library)` }
    if (!data.file || !existsSync(join(dirs[kind], data.file))) return { error: `the file for "${name}" is missing; regenerate it at /library` }
    return { src: urlOf(data), aspect: Number(data.aspect) || 1 }
  }

  app.get('/library.json', async (_req, res) => {
    const { data, error } = await supabase.from('library').select('*').order('updated_at', { ascending: false }).limit(200)
    if (error) return res.status(502).json({ error: error.message })
    res.json({ configured: vertexConfigured(), caps: CAPS, items: data.map((r) => ({ ...r, url: r.file ? `/lib/${r.kind === 'piece' ? 'pieces' : 'clips'}/${r.file}` : null })) })
  })

  app.post('/library', async (req, res) => {
    const kind = req.body?.kind === 'clip' ? 'clip' : 'piece'
    const name = String(req.body?.name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    const description = String(req.body?.description || '').trim().slice(0, 600)
    if (!name || description.length < 5) return res.status(400).json({ error: 'name and description are required' })
    if (!vertexConfigured()) return res.status(503).json({ error: 'GOOGLE_CREDENTIALS_B64 is not set on the stack' })
    if (!(await underCap(kind))) return res.status(429).json({ error: `Daily limit reached (${CAPS[kind]} ${kind}s in 24 hours)` })
    const { data, error } = await supabase.from('library').insert({ kind, name, description, status: 'generating' }).select().single()
    if (error) return res.status(error.code === '23505' ? 409 : 502).json({ error: error.code === '23505' ? `A ${kind} named "${name}" already exists; use Regenerate` : error.message })
    res.status(202).json(data)
    generate(data)
  })

  app.post('/library/:id/:action', async (req, res) => {
    const { id, action } = req.params
    const { data: row } = await supabase.from('library').select('*').eq('id', id).maybeSingle()
    if (!row) return res.status(404).json({ error: 'not found' })
    if (action === 'approve') {
      if (!row.file) return res.status(409).json({ error: 'nothing to approve yet' })
      await set(id, { status: 'approved' })
    } else if (action === 'reject') {
      await set(id, { status: 'rejected' })
    } else if (action === 'regenerate') {
      if (row.status === 'generating') return res.status(409).json({ error: 'already generating' })
      if (!vertexConfigured()) return res.status(503).json({ error: 'GOOGLE_CREDENTIALS_B64 is not set on the stack' })
      if (!(await underCap(row.kind))) return res.status(429).json({ error: `Daily limit reached (${CAPS[row.kind]} ${row.kind}s in 24 hours)` })
      const description = String(req.body?.description || row.description).trim().slice(0, 600)
      await set(id, { status: 'generating', description, error: null })
      generate({ ...row, description })
    } else return res.status(400).json({ error: 'unknown action' })
    res.json({ ok: true })
  })

  app.get('/library', (_req, res) => res.type('html').send(readFileSync(join(here, 'library.html'), 'utf8')))

  return { resolve }
}
