// The standing brief for "Why we do this": what a good question and a good
// script look like, the format the renderer needs, and the checks a script
// must pass before a person sees it.
import { parseSay, stripPauses } from '../shared/captions.js'

export const THEMES = {
  tomato: 'money, exchange, gifts, shopping',
  forest: 'manners, talk, greetings, messaging',
  cobalt: 'work, offices, time, status',
  mustard: 'ritual, festivals, luck, superstition',
  plum: 'body, home, food, cleanliness',
}

const SHOW = `"Why we do this" is an Instagram reels account about the anthropology of everyday life. Each reel takes one ordinary habit the viewer has never questioned and explains it with one real finding from anthropology or a neighbouring field (sociology, linguistics, social psychology), naming who found it and when. The tone is a curious friend who has read the book: plain words, short sentences, no jargon left unexplained, no hype, no moralising.`

const RESEARCH = `Research rules:
- Use web search before you write. Do not rely on memory for names, dates, titles or quotations.
- Every reel rests on one anchor: a named author, a named work and its year, all confirmed in search results. Prefer the original scholar over a pop summary.
- Quote only words you have seen attributed to that author in a search result, and keep quotes to a few words. If you cannot confirm a quote, paraphrase.
- Never invent studies, statistics or examples. If the evidence for an idea is thin or disputed, drop the idea or say so plainly in the script.
- Look for one concrete real-world example the viewer can picture, and where it exists, a cross-cultural contrast (the same habit done differently somewhere else, for instance South India compared with Canada).`

export const BANK_SYSTEM = `${SHOW}

Your job now is to stock the question bank. Propose questions that could each carry a 40-second reel.

A good question:
- starts from something the viewer did this week (tipping, queueing, saying "fine", taking shoes off, leaving a message on read),
- has a surprising but well-supported answer that fits in one sentence,
- has an anchor you have confirmed by search,
- is not a duplicate of anything in the lists you are given.

Draw on three pools: classic findings (Mauss, Douglas, Goffman, Hall, Malinowski, Turner, Bourdieu, Hochschild and others you find), everyday domains (food, money, greetings, queues, phones, home, work, time), and the calendar for the coming two months.

${RESEARCH}

Score each question from 1 to 10 for how likely a stranger is to stop scrolling for it AND how solid the evidence is. Be strict: most should land between 5 and 8.

When you are done researching, call submit_questions once.`

export const BANK_TOOL = {
  name: 'submit_questions',
  description: 'Submit the researched questions for the bank.',
  input_schema: {
    type: 'object',
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['question', 'answer', 'everyday_hook', 'author', 'work', 'year', 'source_url', 'example', 'theme', 'score'],
          properties: {
            question: { type: 'string', description: 'The everyday question, under 60 characters, e.g. "Why do we tip?"' },
            answer: { type: 'string', description: 'The one-sentence answer the reel builds to.' },
            everyday_hook: { type: 'string', description: 'The relatable moment the reel opens on, one sentence.' },
            author: { type: 'string' },
            work: { type: 'string' },
            year: { type: 'integer' },
            source_url: { type: 'string', description: 'A page from your search results that confirms the anchor.' },
            example: { type: 'string', description: 'One concrete real-world example or cross-cultural contrast.' },
            theme: { type: 'string', enum: Object.keys(THEMES) },
            score: { type: 'integer', minimum: 1, maximum: 10 },
          },
        },
      },
    },
  },
}

export const SCRIPT_SYSTEM = `${SHOW}

Your job now is to research one question and write the reel.

${RESEARCH}

Script rules:
- Six beats. 85 to 110 spoken words in total, which with pauses is about 40 to 48 seconds. Count them; over 110 is too long.
- Beat 1 is the hook: a concrete everyday contrast or moment, ending in the question. The rest of the script MUST answer exactly that question; the last beat states the answer in a line the viewer could repeat to a friend.
- One idea per beat. Name the anchor author and year aloud in the beat where the finding appears.
- Write for the ear: short sentences, contractions, no brackets, no semicolons, no lists of three abstractions.
- Pauses: put a mark like [0.4] after a sentence to hold that many seconds before the next one. Use them after the hook question and before a reveal. Never put a mark at the very start of a beat.

Picture rules (the reel is a paper collage: black-and-white cut-out photos on coloured paper, with a few short film clips in taped paper frames):
- Each beat has a layout and one to three pieces. A piece is a cut-out (a single object, described so an image model can draw it alone on a plain ground) or a film clip.
- Exactly three film clips in the whole reel: one in the hook (as its first piece), and two more on "film" beats spread through the rest, on the lines that describe an action. Clips show hands and objects doing one simple action; never faces, never text, never brands. Each clip is a different action.
- "at" is the number of the sentence in that beat (counting from 0) on which the piece or label appears, so pictures land on the words they illustrate.
- The stage must never be empty: in every beat at least one piece appears on sentence 0. Later pieces and labels can then arrive on later sentences.
- Reuse names from the library list you are given whenever they fit; only invent a new piece when nothing there works. New names are lowercase with hyphens.
- Layouts:
  hook: headline of 1 or 2 lines (each at most 9 characters, it is set very large), plus up to 3 pieces.
  top: one piece and up to 3 short labels that arrive one by one (good for a list of three words).
  solo: one cut-out and at most one label.
  duo: two cut-outs and at most one label.
  film: the first piece must be a film clip; an optional second piece is a small cut-out; at most one label.
  payoff: headline of up to 3 lines (each at most 10 characters) and up to 2 pieces. Use it for the last beat only.
- Labels are keywords, at most 18 characters, never sentences. A cite is "Author, Work (Year)", at most 40 characters, on the beat that names the author.
- Palette by theme: ${Object.entries(THEMES).map(([k, v]) => `${k} = ${v}`).join('; ')}.

Also write the Instagram caption: two or three plain sentences that add one detail the reel did not have room for, then a line "Sources:" listing author, work and year. No hashtags beyond three at the very end.

When you are done researching, call submit_script once.`

export const SCRIPT_TOOL = {
  name: 'submit_script',
  description: 'Submit the finished reel.',
  input_schema: {
    type: 'object',
    required: ['palette', 'beats', 'assets', 'sources', 'caption'],
    properties: {
      palette: { type: 'string', enum: Object.keys(THEMES) },
      beats: {
        type: 'array',
        items: {
          type: 'object',
          required: ['layout', 'say', 'pieces'],
          properties: {
            layout: { type: 'string', enum: ['hook', 'top', 'solo', 'duo', 'film', 'payoff'] },
            say: { type: 'string', description: 'Spoken text with optional pause marks like [0.4].' },
            headline: { type: 'array', items: { type: 'string' } },
            pieces: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'kind'],
                properties: { name: { type: 'string' }, kind: { type: 'string', enum: ['piece', 'clip'] }, at: { type: 'integer', minimum: 0 } },
              },
            },
            labels: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, at: { type: 'integer', minimum: 0 } } } },
            cite: { type: 'string' },
            citeAt: { type: 'integer', minimum: 0 },
          },
        },
      },
      assets: {
        type: 'array',
        description: 'One entry for every piece name used that is NOT in the library list.',
        items: {
          type: 'object',
          required: ['name', 'kind', 'description'],
          properties: {
            name: { type: 'string' },
            kind: { type: 'string', enum: ['piece', 'clip'] },
            description: { type: 'string', description: 'For a cut-out: the single object, e.g. "a worn coir doormat seen from above". For a clip: one simple action with hands and objects, two sentences at most.' },
          },
        },
      },
      sources: {
        type: 'array',
        items: { type: 'object', required: ['claim', 'title', 'url'], properties: { claim: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' } } },
      },
      caption: { type: 'string' },
    },
  },
}

const LIMITS = { hook: { pieces: 3, labels: 0 }, top: { pieces: 1, labels: 3 }, solo: { pieces: 1, labels: 1 }, duo: { pieces: 2, labels: 1 }, film: { pieces: 2, labels: 1 }, payoff: { pieces: 2, labels: 0 } }
const words = (s) => stripPauses(s).split(/\s+/).filter(Boolean).length
const slug = (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s || '')

// Problems with a submitted script, in words Claude (and a person) can act on.
// `known` is the set of names already available: "piece:shoes", "clip:spill".
export function checkScript(s, known = new Set()) {
  const out = []
  const beats = s?.beats || []
  if (beats.length !== 6) out.push(`There must be exactly 6 beats; there are ${beats.length}.`)
  const total = beats.reduce((n, b) => n + words(b.say || ''), 0)
  if (total < 80 || total > 112) out.push(`The script has ${total} spoken words; it must be between 85 and 110.`)
  const declared = new Set((s?.assets || []).map((a) => `${a.kind}:${a.name}`))
  let clips = 0
  beats.forEach((b, i) => {
    const n = i + 1
    const lim = LIMITS[b.layout]
    if (!lim) return out.push(`Beat ${n}: unknown layout "${b.layout}".`)
    if (!b.say || !stripPauses(b.say)) return out.push(`Beat ${n} has no spoken text.`)
    if (/^\s*\[/.test(b.say)) out.push(`Beat ${n} starts with a pause mark; remove it.`)
    const sentences = parseSay(b.say).length
    const pieces = b.pieces || []
    if (!pieces.length) out.push(`Beat ${n} has no pieces.`)
    if (pieces.length > lim.pieces) out.push(`Beat ${n}: layout "${b.layout}" takes at most ${lim.pieces} piece(s).`)
    if ((b.labels || []).length > lim.labels) out.push(`Beat ${n}: layout "${b.layout}" takes at most ${lim.labels} label(s).`)
    if (b.layout === 'duo' && pieces.length !== 2) out.push(`Beat ${n}: "duo" needs exactly 2 pieces.`)
    if (b.layout === 'film' && pieces[0]?.kind !== 'clip') out.push(`Beat ${n}: in "film" the first piece must be a film clip.`)
    if (b.layout !== 'film' && b.layout !== 'hook' && pieces.some((p) => p.kind === 'clip')) out.push(`Beat ${n}: a film clip needs the "film" layout (or the hook).`)
    if (b.layout === 'film' && pieces[1]?.kind === 'clip') out.push(`Beat ${n}: only the first piece of "film" can be a clip.`)
    const hl = b.headline || []
    if ((b.layout === 'hook' || b.layout === 'payoff') && !hl.length) out.push(`Beat ${n}: "${b.layout}" needs a headline.`)
    if (b.layout !== 'hook' && b.layout !== 'payoff' && hl.length) out.push(`Beat ${n}: only hook and payoff have a headline.`)
    const maxLines = b.layout === 'hook' ? 2 : 3
    const maxChars = b.layout === 'hook' ? 9 : 10
    if (hl.length > maxLines) out.push(`Beat ${n}: headline has ${hl.length} lines; the limit is ${maxLines}.`)
    hl.forEach((l) => { if (l.length > maxChars) out.push(`Beat ${n}: headline line "${l}" is ${l.length} characters; the limit is ${maxChars}.`) })
    for (const l of b.labels || []) if ((l.text || '').length > 18) out.push(`Beat ${n}: label "${l.text}" is over 18 characters.`)
    if (b.cite && b.cite.length > 40) out.push(`Beat ${n}: cite "${b.cite}" is over 40 characters; shorten the title.`)
    const ats = [...pieces.map((p) => p.at), ...(b.labels || []).map((l) => l.at), b.citeAt].filter((a) => a != null)
    if (pieces.length && !pieces.some((p) => !p.at)) out.push(`Beat ${n}: no piece appears on sentence 0, so the stage starts empty; give one piece "at": 0.`)
    if (ats.some((a) => a >= sentences)) out.push(`Beat ${n} has ${sentences} sentence(s), so "at" values must be below ${sentences}.`)
    for (const p of pieces) {
      if (!slug(p.name)) out.push(`Beat ${n}: piece name "${p.name}" must be lowercase letters, digits and hyphens.`)
      if (p.kind === 'clip') clips++
      const key = `${p.kind}:${p.name}`
      if (!known.has(key) && !declared.has(key)) out.push(`Beat ${n}: "${p.name}" is not in the library and has no entry in assets.`)
    }
  })
  if (beats[0] && beats[0].layout !== 'hook') out.push('Beat 1 must use the hook layout.')
  if (beats[5] && beats[5].layout !== 'payoff') out.push('Beat 6 must use the payoff layout.')
  if (beats[0]?.say && !/\?/.test(beats[0].say)) out.push('The hook must end by asking the question.')
  if (clips !== 3) out.push(`There are ${clips} film clips; there must be exactly 3 (one in the hook, two on "film" beats).`)
  if (beats[0]?.layout === 'hook' && beats[0].pieces?.[0]?.kind !== 'clip') out.push('The first piece of the hook must be a film clip.')
  for (const a of s?.assets || []) if ((a.description || '').length < 8) out.push(`Asset "${a.name}" needs a real description.`)
  if (!(s?.sources || []).length) out.push('List at least one source with its URL.')
  return out
}

// Claude's submission → the shape the collage template renders.
export function toRenderScript(s, number) {
  return {
    palette: s.palette,
    ...(number ? { number } : {}),
    beats: s.beats.map((b) => ({
      layout: b.layout,
      ...(b.headline?.length ? { headline: b.headline } : {}),
      ...(b.cite ? { cite: b.cite, ...(b.citeAt != null ? { citeAt: b.citeAt } : {}) } : {}),
      pieces: b.pieces.map((p) => ({ ...(p.kind === 'clip' ? { clip: p.name } : { name: p.name }), ...(p.at != null ? { at: p.at } : {}) })),
      ...(b.labels?.length ? { labels: b.labels.map((l) => ({ text: l.text, ...(l.at != null ? { at: l.at } : {}) })) } : {}),
      say: b.say,
    })),
    assets: s.assets || [],
    sources: s.sources || [],
  }
}
