// Building the library ahead of need, so the Google trial credit is spent
// on assets that last. Gemini drafts a catalog of objects and actions; a
// steady trickle of them is generated each day and reviewed on the phone.
//
// GET  /review.json            what's waiting, and what has been spent
// POST /catalog/draft          ask Gemini for more catalog entries now
// POST /catalog/pause|resume
import { askGemini, probeGemini, vertexConfigured } from './vertex.mjs'
import { THEMES } from './brief.mjs'
import { COST, TOSS_REASONS } from './library.mjs'

const DAILY = { clip: Number(process.env.CATALOG_DAILY_CLIPS || 3), piece: Number(process.env.CATALOG_DAILY_PIECES || 7) }
const UNTIL = process.env.CATALOG_UNTIL || '2027-02-14'
const MAX_BACKLOG = Number(process.env.CATALOG_MAX_BACKLOG || 30) // unreviewed items before it waits for you
const TICK_MS = 15 * 60 * 1000

const DOMAINS = 'food and eating, money and paying, gifts, greetings and goodbyes, queues and waiting, phones and messages, home and cleaning, shoes and clothes, work and offices, time and clocks, festivals and rituals, luck and superstition, hospitality and guests, the body and grooming, neighbours and streets, school, weddings, death and mourning, travel'

const CATALOG_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['piece', 'clip'] },
          name: { type: 'STRING' },
          description: { type: 'STRING' },
          theme: { type: 'STRING', enum: Object.keys(THEMES) },
          tags: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['kind', 'name', 'description', 'theme', 'tags'],
      },
    },
  },
  required: ['items'],
}

const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const today = () => new Date().toISOString().slice(0, 10)

export function mountCatalog(app, { supabase, library }) {
  const state = { paused: process.env.CATALOG_PAUSED === '1', busy: false, drafting: false, last: null, lastError: null }

  async function draft(count = 30) {
    if (state.drafting) return 0
    state.drafting = true
    try {
      const [{ data: lib }, { data: topics }] = await Promise.all([
        supabase.from('library').select('kind,name'),
        supabase.from('topics').select('title').limit(200),
      ])
      const have = new Set((lib || []).map((r) => `${r.kind}:${r.name}`))
      const clips = Math.round(count / 3)
      const result = await askGemini([
        `You are building a library of visual assets for "Why we do this", Instagram reels about the anthropology of everyday life, made as black-and-white paper collages.

Propose ${count} NEW assets: ${count - clips} cut-outs ("piece") and ${clips} film clips ("clip").
- A cut-out is ONE ordinary physical object, described so an image model can draw it alone: material, age, wear, angle. E.g. "a worn coir doormat seen from above", "a steel tiffin carrier with three tiers".
- A clip is ONE simple action done by hands with objects, in one or two sentences, never faces, never text. E.g. "Two hands pass a wrapped gift across a table and let go."
- Favour objects and gestures that many reels could use: things people exchange, eat with, wait with, clean with, greet with. Draw on everyday life from all over the world, across regions, classes and city and village, so the library can illustrate any society a reel discusses. Do not default to any one country or region.
- Names are lowercase-with-hyphens, 1 to 4 words, describing the thing, e.g. "steel-tiffin", "hands-pass-gift".
- Themes: ${Object.entries(THEMES).map(([k, v]) => `${k} = ${v}`).join('; ')}.
- Tags: 2 to 5 single words a script writer might search for.

Everyday domains to draw from: ${DOMAINS}.

Questions the reels will answer (prefer assets that fit these):
${(topics || []).map((t) => `- ${t.title}`).join('\n') || '(none yet)'}

Already in the library, do not repeat or near-duplicate:
${[...have].join(', ') || '(empty)'}`,
      ], CATALOG_SCHEMA, { temperature: 0.9 })
      const rows = []
      for (const it of result.items || []) {
        const name = slug(it.name)
        const kind = it.kind === 'clip' ? 'clip' : 'piece'
        if (!name || have.has(`${kind}:${name}`) || (it.description || '').length < 10) continue
        have.add(`${kind}:${name}`)
        rows.push({ kind, name, description: it.description.slice(0, 600), theme: THEMES[it.theme] ? it.theme : null, tags: (it.tags || []).slice(0, 6).map(slug).filter(Boolean), status: 'queued', source: 'catalog' })
      }
      if (rows.length) {
        const { error } = await supabase.from('library').insert(rows)
        if (error) throw new Error(error.message)
      }
      console.log(`catalog: ${rows.length} entries drafted`)
      return rows.length
    } finally {
      state.drafting = false
    }
  }

  async function counts() {
    const since = `${today()}T00:00:00Z`
    const q = (kind, f) => f(supabase.from('library').select('id', { count: 'exact', head: true }).eq('kind', kind).eq('source', 'catalog')).then((r) => r.count || 0)
    const [clipsToday, piecesToday, clipsQueued, piecesQueued, backlog] = await Promise.all([
      q('clip', (x) => x.gte('generated_at', since)),
      q('piece', (x) => x.gte('generated_at', since)),
      q('clip', (x) => x.eq('status', 'queued')),
      q('piece', (x) => x.eq('status', 'queued')),
      supabase.from('library').select('id', { count: 'exact', head: true }).eq('source', 'catalog').eq('status', 'pending').then((r) => r.count || 0),
    ])
    return { today: { clip: clipsToday, piece: piecesToday }, queued: { clip: clipsQueued, piece: piecesQueued }, backlog }
  }

  // One item per tick, so a day's batch spreads out and never competes with
  // a reel that is being made.
  async function tick() {
    if (state.paused || state.busy || !vertexConfigured() || today() > UNTIL) return
    state.busy = true
    try {
      const c = await counts()
      if (c.backlog >= MAX_BACKLOG) return // waiting for you to review
      if (c.queued.clip < 5 || c.queued.piece < 10) await draft()
      const kind = c.today.clip < DAILY.clip ? 'clip' : c.today.piece < DAILY.piece ? 'piece' : null
      if (!kind || !(await library.underCap(kind))) return
      const { data: next } = await supabase.from('library').select('*').eq('kind', kind).eq('status', 'queued').order('created_at', { ascending: true }).limit(1)
      if (!next?.length) return
      await library.set(next[0].id, { status: 'generating' })
      await library.generate(next[0])
      state.last = new Date().toISOString()
      state.lastError = null
    } catch (e) {
      state.lastError = String(e.message).slice(0, 300)
      console.error('catalog tick failed:', e.message)
    } finally {
      state.busy = false
    }
  }
  setTimeout(tick, 60 * 1000)
  setInterval(tick, TICK_MS)

  app.get('/review.json', async (_req, res) => {
    const [{ data: items }, { data: spentRows }, c, { data: kept }] = await Promise.all([
      supabase.from('library').select('id,kind,name,description,theme,tags,check,file,keyframe,cost').eq('source', 'catalog').eq('status', 'pending').order('generated_at', { ascending: true }).limit(25),
      supabase.from('library').select('cost,generated_at').not('cost', 'is', null),
      counts(),
      supabase.from('library').select('kind').eq('status', 'approved'),
    ])
    const spent = (spentRows || []).reduce((n, r) => n + Number(r.cost || 0), 0)
    const spentToday = (spentRows || []).filter((r) => (r.generated_at || '').startsWith(today())).reduce((n, r) => n + Number(r.cost || 0), 0)
    res.json({
      items: (items || []).map((r) => ({ ...r, url: r.file ? `/lib/${r.kind === 'clip' ? 'clips' : 'pieces'}/${r.file}` : null })),
      reasons: Object.fromEntries(Object.entries(TOSS_REASONS).map(([k, v]) => [k, v.label])),
      stats: {
        spent: +spent.toFixed(2),
        spentToday: +spentToday.toFixed(2),
        kept: { clip: (kept || []).filter((r) => r.kind === 'clip').length, piece: (kept || []).filter((r) => r.kind === 'piece').length },
        daily: DAILY,
        until: UNTIL,
        ...c,
      },
      state: { paused: state.paused, busy: state.busy, drafting: state.drafting, last: state.last, lastError: state.lastError },
      cost: COST,
    })
  })

  app.get('/debug/gemini', async (_req, res) => {
    try { res.json(await probeGemini()) } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.post('/catalog/draft', async (_req, res) => {
    if (!vertexConfigured()) return res.status(503).json({ error: 'GOOGLE_CREDENTIALS_B64 is not set on the stack' })
    try { res.json({ added: await draft() }) } catch (e) { res.status(502).json({ error: e.message }) }
  })
  app.post('/catalog/:action', (req, res) => {
    if (req.params.action === 'pause') state.paused = true
    else if (req.params.action === 'resume') { state.paused = false; setTimeout(tick, 1000) }
    else return res.status(400).json({ error: 'unknown action' })
    res.json({ paused: state.paused })
  })
}
