// The production line: question bank → script (Claude, with web search) →
// assets (library) → render. One page, /studio, drives all of it.
//
// POST /bank/refill                 Claude researches new questions
// POST /bank { title }              add a question of your own (queued)
// POST /bank/:id/queue|unqueue|reject
// POST /reels/draft { topic_id? }   write the next queued question (or the given one)
// POST /reels/:id/revise { note }   rewrite with your note
// POST /reels/:id/edit { says[] }   change the spoken text by hand
// POST /reels/:id/approve-script    then its new assets are generated
// POST /reels/:id/render | posted | reject
// POST /pipeline/daily              for a scheduler: draft the next question if nothing is waiting
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { research, claudeConfigured } from './claude.mjs'
import { vertexConfigured } from './vertex.mjs'
import { BANK_SYSTEM, BANK_TOOL, SCRIPT_SYSTEM, SCRIPT_TOOL, EDITOR_SYSTEM, EDITOR_TOOL, checkScript, toRenderScript, captionWithQuestion } from './brief.mjs'

const here = dirname(fileURLToPath(import.meta.url))

export function mountStudio(app, { supabase, publicDir, library, enqueue }) {
  const jobs = {} // key → { state: 'running' | 'error', message }
  const run = (key, fn) => {
    if (jobs[key]?.state === 'running') return false
    jobs[key] = { state: 'running', since: Date.now() }
    fn().then(() => delete jobs[key]).catch((e) => {
      console.error(`studio ${key} failed:`, e.message)
      jobs[key] = { state: 'error', message: String(e.message).slice(0, 400) }
    })
    return true
  }
  const shipped = (kind, name) => existsSync(join(publicDir, kind === 'clip' ? 'clips' : 'pieces', `${name}.${kind === 'clip' ? 'mp4' : 'png'}`))
  const setReel = async (id, fields) => {
    const { error } = await supabase.from('reels').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('reels update failed:', error.message)
  }

  // Everything a script may already use: approved or pending library entries.
  async function knownAssets() {
    const lib = await library.statuses()
    const known = new Set(Object.entries(lib).filter(([, r]) => ['approved', 'pending', 'generating'].includes(r.status)).map(([k]) => k))
    // pieces and clips that ship with the code
    for (const [kind, dir, ext] of [['piece', 'pieces', '.png'], ['clip', 'clips', '.mp4']]) {
      try { for (const f of readdirSync(join(publicDir, dir))) if (f.endsWith(ext) && !f.startsWith('_')) known.add(`${kind}:${f.slice(0, -ext.length)}`) } catch {}
    }
    return { lib, known }
  }

  // ---- bank ---------------------------------------------------------------
  async function refill(count = 10) {
    const { data: topics } = await supabase.from('topics').select('title,status').limit(500)
    const have = (topics || []).map((t) => `- ${t.title}`).join('\n') || '(none yet)'
    const today = new Date().toISOString().slice(0, 10)
    const { result, usage } = await research({
      system: BANK_SYSTEM,
      user: `Today is ${today}. Propose ${count} new questions.\n\nAlready in the bank or already made (do not repeat or closely paraphrase):\n${have}`,
      tool: BANK_TOOL,
      maxSearches: 14,
      check: (r) => ((r.questions || []).length ? [] : ['Submit at least one question.']),
    })
    const taken = new Set((topics || []).map((t) => t.title.toLowerCase().trim()))
    const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const rows = result.questions.filter((q) => !taken.has(q.question.toLowerCase().trim())).map((q) => ({
      title: q.question.slice(0, 120),
      angle: q.answer,
      everyday_hook: q.everyday_hook,
      example: q.example,
      theme: q.theme,
      score: q.score,
      sources: [{ author: q.author, work: q.work, year: q.year, url: q.source_url, method: q.method }],
      status: 'proposed',
      batch_week: monday.toISOString().slice(0, 10),
    }))
    if (rows.length) {
      const { error } = await supabase.from('topics').insert(rows)
      if (error) throw new Error(error.message)
    }
    console.log(`bank: ${rows.length} questions added (${usage.searches} searches)`)
  }

  // ---- scripts ------------------------------------------------------------
  async function write(reelId, topic, { note, previous } = {}) {
    const { lib, known } = await knownAssets()
    // Show Claude what each asset is. With a big library, only this theme's
    // assets (and untagged ones) are listed, so the prompt stays small.
    const theme = topic.theme
    const entries = [...known].map((k) => {
      const r = lib[k]
      return { k, theme: r?.theme || null, desc: r?.description || '' }
    }).filter((e) => !theme || known.size <= 120 || !e.theme || e.theme === theme)
    entries.sort((a, b) => a.k.localeCompare(b.k))
    const names = entries.slice(0, 200).map((e) => `- ${e.k.replace(':', ': ')}${e.desc ? ' — ' + e.desc.slice(0, 90) : ''}`).join('\n') || '(empty)'
    const src = (topic.sources || [])[0]
    let user = `Question: ${topic.title}\n`
    if (topic.angle) user += `Answer it should build to (verify this, and improve it if the research says otherwise): ${topic.angle}\n`
    if (src?.author) user += `Suggested anchor (confirm by search): ${src.author}, ${src.work || ''} (${src.year || ''})\n`
    if (topic.example) user += `Possible example: ${topic.example}\n`
    user += `\nLibrary (kind: name — what it shows) you can reuse. Prefer these over inventing new assets:\n${names}`
    if (previous) user += `\n\nThis is a revision. The previous script was:\n${JSON.stringify({ beats: previous.beats.map((b) => ({ layout: b.layout, headline: b.headline, say: b.say })) })}\n\nThe reviewer's note, which you must address: ${note}`
    const check = (x) => (x.fits === false ? ((x.better_angle || '').trim().length > 10 ? [] : ['When fits is false, give a sharper question in better_angle.']) : checkScript(x, known))
    const draft = await research({ system: SCRIPT_SYSTEM, user, tool: SCRIPT_TOOL, maxSearches: 8, check })
    const usage = { ...draft.usage }
    if (draft.result.fits === false) {
      await setReel(reelId, { status: 'error', error: `Claude thinks this doesn't make a good 40-second reel. A sharper question: “${draft.result.better_angle}”`, factcheck: { model: draft.model, searches: usage.searches, tokens_in: usage.input, tokens_out: usage.output } })
      return
    }
    // The editor pass: read it as a viewer would, and rewrite what doesn't land.
    let result = draft.result
    let editorNotes = null
    try {
      const edited = await research({
        system: EDITOR_SYSTEM,
        user: `Question: ${topic.title}\n\nThe writer's draft:\n${JSON.stringify(draft.result)}`,
        tool: EDITOR_TOOL,
        maxSearches: 0,
        maxTokens: 8000,
        check: (x) => checkScript({ ...x, fits: true }, known),
      })
      result = { ...edited.result, fits: true }
      editorNotes = edited.result.editor_notes || null
      usage.input += edited.usage.input
      usage.output += edited.usage.output
    } catch (e) {
      console.warn('editor pass skipped:', e.message)
      editorNotes = 'Editor pass failed, so this is the first draft: ' + String(e.message).slice(0, 200)
    }
    const model = draft.model
    await setReel(reelId, {
      status: 'script_review',
      script: { ...toRenderScript(result), editor_notes: editorNotes },
      caption: captionWithQuestion(result.caption, result.comment_question),
      factcheck: { model, searches: usage.searches, tokens_in: usage.input, tokens_out: usage.output },
      error: null,
    })
    console.log(`script: "${topic.title}" ready for review (${usage.searches} searches)`)
  }

  async function nextTopic() {
    const queued = await supabase.from('topics').select('*').eq('status', 'approved').order('updated_at', { ascending: true }).limit(1)
    if (queued.data?.length) return queued.data[0]
    const best = await supabase.from('topics').select('*').eq('status', 'proposed').order('score', { ascending: false, nullsFirst: false }).limit(1)
    return best.data?.[0] || null
  }

  async function draft(topicId) {
    const topic = topicId ? (await supabase.from('topics').select('*').eq('id', topicId).maybeSingle()).data : await nextTopic()
    if (!topic) throw new Error('The bank has no questions to write; refill it first')
    const { data: reel, error } = await supabase.from('reels').insert({ topic_id: topic.id, status: 'drafting', review_notes: topic.title }).select().single()
    if (error) throw new Error(error.message)
    await supabase.from('topics').update({ status: 'used', updated_at: new Date().toISOString() }).eq('id', topic.id)
    run(`reel:${reel.id}`, async () => {
      try { await write(reel.id, topic) } catch (e) { await setReel(reel.id, { status: 'error', error: String(e.message).slice(0, 500) }); throw e }
    })
    return reel
  }

  // New assets for an approved script are made one after another.
  async function makeAssets(reel) {
    const failures = []
    const used = new Set((reel.script.beats || []).flatMap((b) => (b.pieces || []).map((p) => (typeof p === 'string' ? `piece:${p}` : p.clip ? `clip:${p.clip}` : `piece:${p.name}`))))
    for (const a of (reel.script.assets || []).filter((x) => used.has(`${x.kind}:${x.name}`))) {
      if (shipped(a.kind, a.name)) continue
      try { await library.ensure(a.kind, a.name, a.description) } catch (e) { failures.push(e.message) }
    }
    if (failures.length) throw new Error(failures.join('; '))
  }

  function assetsOf(script, lib) {
    const seen = new Map()
    for (const b of script?.beats || []) for (const p of b.pieces || []) {
      const spec = typeof p === 'string' ? { name: p } : p
      const kind = spec.clip ? 'clip' : 'piece'
      const name = spec.clip || spec.name
      const key = `${kind}:${name}`
      if (seen.has(key)) continue
      const dir = kind === 'clip' ? 'clips' : 'pieces'
      const row = lib[key]
      if (shipped(kind, name)) seen.set(key, { kind, name, status: 'approved', builtin: true, url: `/${dir}/${name}.${kind === 'clip' ? 'mp4' : 'png'}` })
      else seen.set(key, { kind, name, id: row?.id || null, status: row?.status || 'missing', error: row?.error || null, description: row?.description || null, url: row?.file ? `/lib/${dir}/${row.file}` : null })
    }
    return [...seen.values()]
  }

  // Once every picture of an approved script is approved, the video renders
  // without anyone having to ask.
  async function autoRender() {
    const { data: reels } = await supabase.from('reels').select('id,script,status,video_url').eq('status', 'script_approved').is('video_url', null)
    if (!reels?.length) return
    const { lib } = await knownAssets()
    for (const r of reels) {
      if (jobs[`reel:${r.id}`]?.state === 'running') continue
      const assets = assetsOf(r.script, lib)
      if (assets.length && assets.every((a) => a.status === 'approved')) {
        console.log(`studio: all pictures approved for ${r.id}; rendering`)
        enqueue(r.id)
      }
    }
  }
  library.hooks.onApproved = autoRender

  // ---- routes -------------------------------------------------------------
  app.get('/studio.json', async (_req, res) => {
    const [{ data: bank }, { data: reels }, { lib }] = await Promise.all([
      supabase.from('topics').select('*').in('status', ['proposed', 'approved']).order('score', { ascending: false, nullsFirst: false }).limit(100),
      supabase.from('reels').select('id,topic_id,status,script,caption,factcheck,review_notes,video_url,duration_s,error,revision,updated_at').order('updated_at', { ascending: false }).limit(40),
      knownAssets(),
    ])
    res.json({
      configured: { claude: claudeConfigured(), google: vertexConfigured() },
      jobs,
      bank: bank || [],
      reels: (reels || []).map((r) => ({ ...r, title: r.review_notes, assets: assetsOf(r.script, lib) })),
    })
  })

  app.post('/bank/refill', (_req, res) => {
    if (!claudeConfigured()) return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set on the stack' })
    if (!run('refill', () => refill())) return res.status(409).json({ error: 'A refill is already running' })
    res.status(202).json({ ok: true })
  })

  app.post('/bank', async (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 120)
    if (title.length < 6) return res.status(400).json({ error: 'Type a question' })
    const { error } = await supabase.from('topics').insert({ title, status: 'approved', notes: 'added by hand' })
    if (error) return res.status(502).json({ error: error.message })
    res.json({ ok: true })
  })

  app.post('/bank/:id/:action', async (req, res) => {
    const status = { queue: 'approved', unqueue: 'proposed', reject: 'rejected' }[req.params.action]
    if (!status) return res.status(400).json({ error: 'unknown action' })
    const { error } = await supabase.from('topics').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id)
    if (error) return res.status(502).json({ error: error.message })
    res.json({ ok: true })
  })

  app.post('/reels/draft', async (req, res) => {
    if (!claudeConfigured()) return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set on the stack' })
    try { res.status(202).json(await draft(req.body?.topic_id)) } catch (e) { res.status(409).json({ error: e.message }) }
  })

  app.post('/pipeline/daily', async (_req, res) => {
    if (!claudeConfigured()) return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set on the stack' })
    const { count } = await supabase.from('reels').select('id', { count: 'exact', head: true }).in('status', ['drafting', 'script_review'])
    if (count) return res.json({ skipped: 'a script is already waiting for review' })
    try { res.status(202).json(await draft()) } catch (e) { res.status(409).json({ error: e.message }) }
  })

  app.post('/reels/:id/:action', async (req, res) => {
    const { id, action } = req.params
    const { data: reel } = await supabase.from('reels').select('*').eq('id', id).maybeSingle()
    if (!reel) return res.status(404).json({ error: 'not found' })
    const key = `reel:${id}`
    if (jobs[key]?.state === 'running') return res.status(409).json({ error: 'This reel is busy; give it a moment' })

    if (action === 'revise') {
      const note = String(req.body?.note || '').trim().slice(0, 1000)
      if (note.length < 4) return res.status(400).json({ error: 'Say what should change' })
      if (!reel.script) return res.status(409).json({ error: 'There is no script to revise' })
      const topic = (reel.topic_id && (await supabase.from('topics').select('*').eq('id', reel.topic_id).maybeSingle()).data) || { title: reel.review_notes }
      await setReel(id, { status: 'drafting', revision: (reel.revision || 1) + 1 })
      run(key, async () => {
        try { await write(id, topic, { note, previous: reel.script }) } catch (e) { await setReel(id, { status: 'script_review', error: 'Revision failed: ' + String(e.message).slice(0, 400) }); throw e }
      })
      return res.status(202).json({ ok: true })
    }

    if (action === 'edit') {
      const says = req.body?.says
      if (!Array.isArray(says) || says.length !== (reel.script?.beats || []).length) return res.status(400).json({ error: 'One text per beat is required' })
      const script = { ...reel.script, beats: reel.script.beats.map((b, i) => ({ ...b, say: String(says[i]).trim() })) }
      const { known } = await knownAssets()
      const asSubmitted = { ...script, beats: script.beats.map((b) => ({ ...b, pieces: b.pieces.map((p) => (typeof p === 'string' ? { name: p, kind: 'piece' } : { name: p.clip || p.name, kind: p.clip ? 'clip' : 'piece', at: p.at })) })) }
      for (const b of asSubmitted.beats) for (const p of b.pieces) if (shipped(p.kind, p.name)) known.add(`${p.kind}:${p.name}`)
      const problems = checkScript(asSubmitted, known, { submission: false }).filter((p) => !/film clip/.test(p))
      if (problems.length) return res.status(422).json({ error: problems.join(' ') })
      if (Array.isArray(script.hooks) && script.hooks[script.hook || 0]) script.hooks = script.hooks.map((h, i) => (i === (script.hook || 0) ? { ...h, say: script.beats[0].say } : h))
      await setReel(id, { script, revision: (reel.revision || 1) + 1 })
      return res.json({ ok: true })
    }

    if (action === 'hook') {
      const i = Number(req.body?.index)
      const hooks = reel.script?.hooks
      if (!Array.isArray(hooks) || !hooks[i]) return res.status(400).json({ error: 'No such hook' })
      if (reel.status !== 'script_review') return res.status(409).json({ error: 'The hook can only be changed while the script is in review' })
      const { style, ...beat } = hooks[i]
      const beats = [beat, ...reel.script.beats.slice(1)]
      await setReel(id, { script: { ...reel.script, beats, hook: i }, revision: (reel.revision || 1) + 1 })
      return res.json({ ok: true })
    }

    if (action === 'approve-script') {
      if (reel.status !== 'script_review') return res.status(409).json({ error: `This reel is "${reel.status}", not waiting for script review` })
      await setReel(id, { status: 'script_approved', error: null })
      run(key, async () => {
        try { await makeAssets(reel) } catch (e) { await setReel(id, { error: 'Pictures: ' + String(e.message).slice(0, 400) }); throw e }
        await autoRender()
      })
      return res.status(202).json({ ok: true })
    }

    if (action === 'render') {
      if (!['script_approved', 'video_review', 'error'].includes(reel.status)) return res.status(409).json({ error: 'Approve the script first' })
      const { lib } = await knownAssets()
      const waiting = assetsOf(reel.script, lib).filter((a) => a.status !== 'approved')
      if (waiting.length) return res.status(409).json({ error: `Not approved yet: ${waiting.map((a) => a.name).join(', ')} (see the library)` })
      const out = enqueue(id, req.body?.voice)
      return res.status(out.error ? 409 : 202).json(out)
    }

    if (action === 'restore') {
      await setReel(id, { status: reel.video_url ? 'video_review' : reel.script ? 'script_review' : 'error' })
      return res.json({ ok: true })
    }

    if (action === 'posted') {
      await setReel(id, { status: 'published', published_at: new Date().toISOString() })
      return res.json({ ok: true })
    }

    if (action === 'reject') {
      await setReel(id, { status: 'rejected' })
      return res.json({ ok: true })
    }
    res.status(400).json({ error: 'unknown action' })
  })

  // Same-origin download so a phone saves the file instead of opening a player.
  app.get('/reels/:id/download', async (req, res) => {
    const { data: reel } = await supabase.from('reels').select('video_url,review_notes').eq('id', req.params.id).maybeSingle()
    if (!reel?.video_url) return res.status(404).send('No video yet')
    const upstream = await fetch(reel.video_url)
    if (!upstream.ok) return res.status(502).send('The video could not be fetched')
    const name = (reel.review_notes || 'reel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'reel'
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Disposition', `attachment; filename="${name}.mp4"`)
    res.send(Buffer.from(await upstream.arrayBuffer()))
  })

  app.get('/studio', (_req, res) => res.type('html').send(readFileSync(join(here, 'studio.html'), 'utf8')))
}
