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
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { research, claudeConfigured } from './claude.mjs'
import { vertexConfigured } from './vertex.mjs'
import { BANK_SYSTEM, BANK_TOOL, SCRIPT_SYSTEM, SCRIPT_TOOL, checkScript, toRenderScript } from './brief.mjs'

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
    const known = new Set(Object.entries(lib).filter(([, r]) => r.status !== 'rejected' && r.status !== 'error').map(([k]) => k))
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
      sources: [{ author: q.author, work: q.work, year: q.year, url: q.source_url }],
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
    const { known } = await knownAssets()
    const names = [...known].sort().map((k) => `- ${k.replace(':', ': ')}`).join('\n') || '(empty)'
    const src = (topic.sources || [])[0]
    let user = `Question: ${topic.title}\n`
    if (topic.angle) user += `Answer it should build to (verify this, and improve it if the research says otherwise): ${topic.angle}\n`
    if (src?.author) user += `Suggested anchor (confirm by search): ${src.author}, ${src.work || ''} (${src.year || ''})\n`
    if (topic.example) user += `Possible example: ${topic.example}\n`
    user += `\nLibrary (kind: name) you can reuse:\n${names}`
    if (previous) user += `\n\nThis is a revision. The previous script was:\n${JSON.stringify({ beats: previous.beats.map((b) => ({ layout: b.layout, headline: b.headline, say: b.say })) })}\n\nThe reviewer's note, which you must address: ${note}`
    const { result, usage, model } = await research({ system: SCRIPT_SYSTEM, user, tool: SCRIPT_TOOL, maxSearches: 8, check: (s) => checkScript(s, known) })
    await setReel(reelId, {
      status: 'script_review',
      script: toRenderScript(result),
      caption: result.caption,
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
    for (const a of reel.script.assets || []) {
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
      seen.set(key, { kind, name, status: shipped(kind, name) ? 'approved' : lib[key]?.status || 'missing', error: lib[key]?.error || null })
    }
    return [...seen.values()]
  }

  // ---- routes -------------------------------------------------------------
  app.get('/studio.json', async (_req, res) => {
    const [{ data: bank }, { data: reels }, { lib }] = await Promise.all([
      supabase.from('topics').select('*').in('status', ['proposed', 'approved']).order('score', { ascending: false, nullsFirst: false }).limit(100),
      supabase.from('reels').select('id,topic_id,status,script,caption,factcheck,review_notes,video_url,duration_s,error,revision,updated_at').order('updated_at', { ascending: false }).limit(15),
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
      const problems = checkScript(asSubmitted, known).filter((p) => !/film clip/.test(p))
      if (problems.length) return res.status(422).json({ error: problems.join(' ') })
      await setReel(id, { script, revision: (reel.revision || 1) + 1 })
      return res.json({ ok: true })
    }

    if (action === 'approve-script') {
      if (reel.status !== 'script_review') return res.status(409).json({ error: `This reel is "${reel.status}", not waiting for script review` })
      await setReel(id, { status: 'script_approved', error: null })
      run(key, async () => {
        try { await makeAssets(reel) } catch (e) { await setReel(id, { error: 'Assets: ' + String(e.message).slice(0, 400) }); throw e }
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

  app.get('/studio', (_req, res) => res.type('html').send(readFileSync(join(here, 'studio.html'), 'utf8')))
}
