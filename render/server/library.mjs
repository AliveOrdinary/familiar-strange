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
import { generateImage, generateVideo, askGemini, vertexConfigured } from './vertex.mjs'
import { keyGreen } from './keying.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const CAPS = { piece: Number(process.env.DAILY_IMAGE_CAP || 40), clip: Number(process.env.DAILY_CLIP_CAP || 12) }
// Estimated cost in dollars of each call, from the billing report: a 4-second
// Veo Fast clip is about $0.45, an image about $0.09; checks are negligible.
export const COST = { image: 0.09, clip: 0.45 }

// What a tap on "Toss" means, and what the next prompts say because of it.
export const TOSS_REASONS = {
  ai_look: { label: 'AI look', hint: 'It must look like a real, slightly imperfect photograph from an old newspaper or 16mm documentary: ordinary light, worn real objects, nothing glossy, smooth, symmetrical or too perfect.' },
  wrong: { label: 'Wrong thing', hint: 'Show exactly the object or action described, literally and simply, and nothing else.' },
  hands: { label: 'Weird hands', hint: 'Keep hands simple and natural with five relaxed fingers each, partly out of frame if possible.' },
  faces_text: { label: 'Face or text', hint: 'Absolutely no faces or heads, no lettering, labels, logos or numbers anywhere.' },
  boring: { label: 'Boring', hint: 'Pick a characterful, specific example with interesting texture, filling the frame from a close, slightly unusual angle.' },
}

const piecePrompt = (d, hints) =>
  `A single hand-cut paper cut-out of ${d}, as a black-and-white halftone photograph with visible print dots, with a thick uneven white paper border around its outline. Centred on a completely flat, solid bright green background (#00FF00). No shadow, no other objects, no text.${hints}`
const keyframePrompt = (d, hints) =>
  `A single still frame from black-and-white 16mm documentary film with heavy film grain, vertical 9:16, static camera, close shot: ${d.replace(/\.?\s*$/, '.')} This is the first moment of the action. Only hands, never faces or heads. No text, no logos.${hints}`
const clipPrompt = (d, hints) =>
  `Black and white documentary film footage with heavy film grain. Static camera. ${d.replace(/\.?\s*$/, '.')} Only hands and objects, never faces. Natural, unhurried movement. No text, no captions, no watermark.${hints}`

const CHECK_SCHEMA = { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' }, problems: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['ok', 'problems'] }
const CHECK_RULES = {
  piece: 'a single cut-out object on a plain background, shown as a black-and-white halftone photograph with a white paper border',
  keyframe: 'a black-and-white documentary film still, the first frame of a short clip',
  clip: 'a 4-second black-and-white documentary film clip',
}

export function mountLibrary(app, { supabase, publicDir, self }) {
  const dirs = { piece: join(publicDir, 'lib', 'pieces'), clip: join(publicDir, 'lib', 'clips'), keyframe: join(publicDir, 'lib', 'keyframes') }
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
  const hooks = {} // set by the studio: what to do when an asset is approved
  const urlOf = (row) => (row.file ? `${self}/lib/${row.kind === 'piece' ? 'pieces' : 'clips'}/${row.file}` : null)

  const set = async (id, fields) => {
    const { error } = await supabase.from('library').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('library update failed:', error.message)
  }

  // Toss reasons that keep coming up become extra instructions in the prompt.
  async function hintsFor(kind) {
    const { data } = await supabase.from('library').select('toss_reason').eq('kind', kind).not('toss_reason', 'is', null).order('updated_at', { ascending: false }).limit(40)
    const counts = {}
    for (const r of data || []) counts[r.toss_reason] = (counts[r.toss_reason] || 0) + 1
    const hints = Object.entries(counts).filter(([k, n]) => n >= 2 && TOSS_REASONS[k]).map(([k]) => TOSS_REASONS[k].hint)
    return hints.length ? ' ' + hints.join(' ') : ''
  }

  // Gemini looks at the result and lists clear problems. A failed check never
  // blocks anything by itself: after one retry the result goes to review with
  // the problems shown, so a picky check can't waste money.
  async function inspect(what, buf, mimeType, description) {
    try {
      return await askGemini([
        { inlineData: { mimeType, data: buf.toString('base64') } },
        `This is ${CHECK_RULES[what]} for an Instagram reel made as a paper collage. It is supposed to show: ${description}

Fail it only for clear problems a viewer would notice:
- a human face or head is visible, even partly
- readable text, letters, numbers, logos or a watermark appear
- it is in colour rather than black and white${what === 'piece' ? '' : `
- hands or fingers are malformed (extra, missing or fused fingers)`}${what === 'clip' ? `
- objects melt, morph, appear or vanish unnaturally
- the described action does not happen` : `
- it does not show what is described`}
Answer with ok and a short list of the problems you found (empty if none).`,
      ], CHECK_SCHEMA, { temperature: 0 })
    } catch (e) {
      console.warn('library: check skipped:', e.message)
      return { ok: true, problems: [] }
    }
  }

  async function generate(row) {
    let cost = Number(row.cost) || 0
    const notes = []
    try {
      const stamp = Date.now()
      const hints = await hintsFor(row.kind)
      if (row.kind === 'piece') {
        let keyed, check, prompt = piecePrompt(row.description, hints)
        for (let attempt = 0; attempt < 2; attempt++) {
          const raw = await generateImage(attempt ? `${prompt} Avoid: ${(check.problems || []).join('; ')}.` : prompt)
          cost += COST.image
          keyed = await keyGreen(raw)
          check = await inspect('piece', keyed.png, 'image/png', row.description)
          if (check.ok) break
        }
        if (!check.ok) notes.push(...check.problems)
        const file = `${row.name}-${stamp}.png`
        writeFileSync(join(dirs.piece, file), keyed.png)
        await set(row.id, { status: 'pending', file, aspect: keyed.aspect, prompt, error: null, check: notes.join('; ') || null, cost: +cost.toFixed(2), generated_at: new Date().toISOString() })
      } else {
        // 1. A still of the first moment: cheap to redo if it's wrong.
        let still, check
        const kPrompt = keyframePrompt(row.description, hints)
        for (let attempt = 0; attempt < 3; attempt++) {
          still = await generateImage(attempt ? `${kPrompt} Avoid: ${(check.problems || []).join('; ')}.` : kPrompt, { aspectRatio: '9:16' })
          cost += COST.image
          check = await inspect('keyframe', still, still[0] === 0x89 ? 'image/png' : 'image/jpeg', row.description)
          if (check.ok) break
        }
        if (!check.ok) throw new Error('The still frame kept failing the check: ' + (check.problems || []).join('; '))
        const keyframe = `${row.name}-${stamp}.${still[0] === 0x89 ? 'png' : 'jpg'}`
        writeFileSync(join(dirs.keyframe, keyframe), still)
        // 2. Animate it.
        let mp4
        const prompt = clipPrompt(row.description, hints)
        for (let attempt = 0; attempt < 2; attempt++) {
          mp4 = await generateVideo(attempt ? `${prompt} Avoid: ${(check.problems || []).join('; ')}.` : prompt, { image: still })
          cost += COST.clip
          check = await inspect('clip', mp4, 'video/mp4', row.description)
          if (check.ok) break
        }
        if (!check.ok) notes.push(...check.problems)
        const file = `${row.name}-${stamp}.mp4`
        writeFileSync(join(dirs.clip, file), mp4)
        await set(row.id, { status: 'pending', file, keyframe, aspect: 1.25, prompt, error: null, check: notes.join('; ') || null, cost: +cost.toFixed(2), generated_at: new Date().toISOString() })
      }
      console.log(`library: ${row.kind} "${row.name}" ready for review ($${cost.toFixed(2)})`)
    } catch (e) {
      console.error(`library: ${row.kind} "${row.name}" failed:`, e.message)
      await set(row.id, { status: 'error', error: String(e.message).slice(0, 500), cost: +cost.toFixed(2), generated_at: new Date().toISOString() })
    }
  }

  async function underCap(kind) {
    const since = new Date(Date.now() - 86400000).toISOString()
    const { count } = await supabase.from('library').select('id', { count: 'exact', head: true }).eq('kind', kind).gte('generated_at', since)
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
    const { data, error } = await supabase.from('library').select('*').neq('status', 'queued').order('updated_at', { ascending: false }).limit(300)
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
      Promise.resolve(hooks.onApproved?.()).catch((e) => console.error('onApproved failed:', e.message))
    } else if (action === 'reject' || action === 'toss') {
      const reason = TOSS_REASONS[req.body?.reason] ? req.body.reason : null
      await set(id, { status: 'rejected', toss_reason: reason })
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

  // For the script pipeline: make sure an asset exists, generating it if it is
  // new. Runs to completion so a reel's assets are made one after another.
  async function ensure(kind, name, description) {
    const { data: existing } = await supabase.from('library').select('*').eq('kind', kind).eq('name', name).maybeSingle()
    if (existing && existing.status === 'queued') {
      if (!(await underCap(kind))) throw new Error(`Daily limit reached (${CAPS[kind]} ${kind}s in 24 hours); "${name}" was not generated`)
      await set(existing.id, { status: 'generating', description: description || existing.description, source: 'script' })
      await generate({ ...existing, description: description || existing.description })
      return 'pending'
    }
    if (existing) return existing.status
    if (!vertexConfigured()) throw new Error('GOOGLE_CREDENTIALS_B64 is not set on the stack')
    if (!(await underCap(kind))) throw new Error(`Daily limit reached (${CAPS[kind]} ${kind}s in 24 hours); "${name}" was not generated`)
    const { data, error } = await supabase.from('library').insert({ kind, name, description, status: 'generating' }).select().single()
    if (error) throw new Error(error.message)
    await generate(data)
    return 'pending'
  }

  // name → status for a list of "kind:name" keys (missing ones are absent)
  async function statuses() {
    const { data } = await supabase.from('library').select('id,kind,name,status,error,file,description,theme,check')
    return Object.fromEntries((data || []).map((r) => [`${r.kind}:${r.name}`, r]))
  }

  return { resolve, ensure, statuses, hooks, generate, underCap, set, dirs }
}
