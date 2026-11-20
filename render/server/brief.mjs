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

const STANCE = `How the account thinks. It stands with what anthropology has learned as a discipline, which began in armchair speculation and corrected itself through fieldwork:
- Make the familiar strange. Start from the viewer's own habit and treat it as just as curious as anyone else's. No society is exotic, quaint or behind; Western habits get the same scrutiny as everyone else's.
- Ask how it came to be. Trace where a practice came from, how it changed and whom it served, so that what feels natural is shown to have been made.
- Meaning from the inside first. Explain a practice through what it means to the people who do it, before any outside theory. Their reasons count as evidence.
- Connect it to the whole: the economy, kinship, belief, status or power it sits in.
- Fieldwork over armchairs. Prefer ethnography, long-term observation and archival work. Early armchair theorists (Frazer, Tylor, the cultural evolutionists) are the history of the discipline, not current findings. When a classic idea has been critiqued or revised, use the revised version or say it was revised. Scholars who worked from other people's reports "argued"; they did not "find everywhere".
- Careful with "everyone". Claims about all humans only where comparative evidence supports them; otherwise "in many societies", with the variation shown.
- Explain before judging. Never mock, moralise or romanticise.

Lines never crossed:
- Nothing invented or misattributed. Every claim and quote rests on a source you found.
- No exoticising and no ladder-of-progress words: primitive, savage, civilised, backward, exotic, bizarre, or tribe and tribal used loosely (name the people instead).
- The question the hook asks is answered by the end.

The account also has to win an audience, so package boldly and claim honestly:
- Simplify freely as long as it isn't wrong. A clean, confident version beats a hedged one.
- At most one hedge in the voiceover. Debates, revisions and caveats go in the caption.
- Big names make good hooks; use accurate verbs (argued, showed, noticed).
- Provocative is good if it's true. Curious, never superior: no "you've been doing it wrong".`

const RESEARCH = `Research rules:
- Use web search before you write. Do not rely on memory for names, dates, titles or quotations.
- Every reel rests on one anchor: a named author, a named work and its year, all confirmed in search results. Prefer the original scholar over a pop summary.
- Quote only words you have seen attributed to that author in a search result, and keep quotes to a few words. If you cannot confirm a quote, paraphrase.
- Never invent studies, statistics or examples. If the evidence for an idea is thin or disputed, drop the idea or say so plainly in the script.
- Look for one concrete real-world example the viewer can picture, and where it exists, a cross-cultural contrast (the same habit done differently somewhere else). Draw examples from anywhere in the world, choosing whichever society the research shows most clearly; do not default to the same few countries.`

export const BANK_SYSTEM = `${SHOW}

${STANCE}

Your job now is to stock the question bank. Propose questions that could each carry a 40-second reel.

A good question:
- starts from something the viewer did this week (tipping, queueing, saying "fine", taking shoes off, leaving a message on read),
- has a surprising but well-supported answer that fits in one sentence,
- has an anchor you have confirmed by search,
- is not a duplicate of anything in the lists you are given.
- ideally touches something people already disagree about (tipping, shoes indoors, splitting the bill, how fast to reply), because those reels get comments.
- rests on fieldwork, archival or comparative evidence wherever possible; say which in "method".

Draw on three pools: classic findings (Mauss, Douglas, Goffman, Hall, Malinowski, Turner, Bourdieu, Hochschild and others you find), everyday domains (food, money, greetings, queues, phones, home, work, time), and the calendar for the coming two months.

${RESEARCH}

Score each question from 1 to 10 for how likely a stranger is to stop scrolling for it, how likely they are to comment, AND how solid the evidence is. Be strict: most should land between 5 and 8.

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
          required: ['question', 'answer', 'everyday_hook', 'author', 'work', 'year', 'source_url', 'example', 'theme', 'score', 'method'],
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
            method: { type: 'string', enum: ['fieldwork', 'archive', 'comparison', 'survey or experiment', 'theory'], description: 'What the anchor mainly rests on.' },
          },
        },
      },
    },
  },
}

export const SCRIPT_SYSTEM = `${SHOW}

${STANCE}

Your job now is to research one question and write the reel.

${RESEARCH}

Every reel is built around ONE turn: a single finding that makes the viewer see their own habit differently, stated in one sentence they could repeat at dinner. E.g. "A tip is a gift that can only flow down." "Dirt is just matter in the wrong place." Find the turn first. If the research doesn't give you a turn that would make a stranger say "huh, interesting", set fits to false and suggest a sharper angle in better_angle instead of forcing a script.

The turn is in everyday words a 12-year-old would understand. No technical term, not even one you then explain ("initiation", "reciprocity", "liminality", "habitus"): say what the term means instead ("a secret that sorts kids from grown-ups"). If the idea can't be said without its term, look for a plainer turn.

Plan before you write. In "chain", write the whole reel as one line: "[what the viewer does or believes], BUT [what's really going on], SO [what that means for them]". E.g. "We lie to kids about Santa, BUT the secret splits the world into kids who believe and people who know, SO finding out is how you get let in." The script is that line, told out loud. If you can't write the chain, you don't have the reel yet.

Keep one thread. Choose the two or three plain words that carry the turn (secret, know, let in) and use them in every beat from the turn to the payoff. Never switch to a new image or frame halfway (from "a lie" to "an initiation" to "a promotion" to "passing it on"); each switch makes the viewer start over.

The shape of a reel (six beats). Most viewers leave within 10 seconds, so the turn must arrive early and the best line must come right after it:
1. Hook: a familiar puzzle from the viewer's own life, ending in the question. 20 words at most.
2. The obvious answer: what the viewer actually believes right now, in one short sentence ("You'd think it's about germs."). The turn then knocks it down. Make it a belief people really hold, not a straw man.
3. The turn, credited aloud to whoever found it, with the year. It must start within the first 30 spoken words of the reel, so a viewer hears it by about 10 seconds.
4. The sharpest line: the most surprising, quotable way of putting the turn ("A quick text can sound like: you weren't worth a call."). Never save it for the end.
5. The proof: one vivid, concrete example that shows the turn itself happening, ideally from somewhere else in the world. Not a related fact that sits next to the turn; the viewer should see the turn in action.
6. Payoff: one short line that answers the hook and hands it back to the viewer.

One explanation only. Never stack competing theories, earlier versions or revisions in the voiceover; they go in the caption. Every beat follows from the one before with "but" or "so", never "and then": read the beats in order with "but" or "so" between them, and if a beat only fits after "and also", cut it or rewrite it.

Script rules:
- 65 to 85 spoken words in total, about 30 to 35 seconds. Shorter is better; cut anything that isn't the turn, its sharpest line, or the one example.
- Write for the ear. The listener hears each sentence once and can't go back. One idea per sentence, about 8 to 12 words, subject-verb-object, active voice. Full sentences a friend would say out loud: no fragments, no telegraphic lines, no jargon. Everyday words only; if a word needs explaining, use the explanation instead of the word. Contractions are good; no brackets, no semicolons.
- Name the scholar and year aloud on the turn beat.
- Pauses: put a mark like [0.4] after a sentence to hold that many seconds before the next one. Use them after the hook question and just before the turn. Never put a mark at the very start of a beat.

Hooks (half of all viewers decide to swipe within the first two seconds, so the first sentence carries the whole hook):
- The first sentence alone must hold the tension: the puzzle, the contradiction or the question within its first eight words. Never open on a setup line everyone already agrees with; the tension can't wait for sentence two.
  Bad: "Lots of romances start with a text. So why does ending one by text feel so cruel?" (the first sentence is a harmless setup)
  Good: "Why does getting dumped by text hurt so much more?" or "You'd snatch a shoe off the table before checking if it was clean."
- Prefer opening on "you" and a concrete action the viewer has done themselves. No warm-up, no "Have you ever wondered", no "Lots of people".
- Each style still has to land in the first sentence: a contradiction states both sides at once, a surprising fact is the fact itself, a sting names the viewer's own small habit.
- The hook headline says the same thing in plain words, four words or fewer, for viewers watching with the sound off. It may be the question itself ("DUMPED BY / TEXT?"). Never a pun, a riddle or wordplay the viewer has to decode.
- Write three different hooks, one of each style: "contradiction", "surprising fact", "sting". Beat 1 is one of them (say which in hook_style); give the other two in alt_hooks. Each must end with the question, lead naturally into beat 2, and follow the hook layout rules with a film clip as its first piece. Any new pieces they use go in assets too.

Picture rules (the reel is a paper collage: black-and-white cut-out photos on coloured paper, with a few short film clips in taped paper frames):
- Each beat has a layout and one to three pieces. A piece is a cut-out (a single object, described so an image model can draw it alone on a plain ground) or a film clip.
- Two or three film clips in the whole reel: one in the hook (as its first piece), and one or two more on "film" beats, on lines that describe an action. Use only two if a third would be forced. Clips show one simple everyday action; people and faces may appear, but never text and never brands. Each clip is a different action.
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

Also write the Instagram caption: two or three plain sentences that add one detail the reel did not have room for (this is where a debate, revision or caveat goes), then a line "Sources:" listing author, work and year. No hashtags beyond three at the very end.

And a comment_question: one short question only the viewer can answer, usually comparing how their family, country or workplace does it, e.g. "Do you tip where you live? How much?". Never a yes/no about the reel itself. It is added to the caption.

When you are done researching, call submit_script once. Put the turn in "turn".`

export const HOOK_STYLES = ['contradiction', 'surprising fact', 'sting']

export const SCRIPT_TOOL = {
  name: 'submit_script',
  description: 'Submit the finished reel.',
  input_schema: {
    type: 'object',
    required: ['fits', 'chain', 'turn', 'palette', 'beats', 'hook_style', 'alt_hooks', 'assets', 'sources', 'caption', 'comment_question'],
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
      fits: { type: 'boolean', description: 'False if this question has no turn that works in 40 seconds.' },
      better_angle: { type: 'string', description: 'When fits is false: a sharper question that would work.' },
      turn: { type: 'string', description: 'The one finding the reel builds to, in one plain sentence a viewer could repeat. No technical terms.' },
      chain: { type: 'string', description: 'The whole reel in one line: "..., BUT ..., SO ...".' },
      comment_question: { type: 'string', description: 'One short question that invites viewers to say how they do it, under 100 characters.' },
      hook_style: { type: 'string', enum: HOOK_STYLES },
      alt_hooks: {
        type: 'array',
        description: 'Two alternative versions of beat 1 in the other two styles.',
        items: {
          type: 'object',
          required: ['style', 'layout', 'headline', 'say', 'pieces'],
          properties: {
            style: { type: 'string', enum: HOOK_STYLES },
            layout: { type: 'string', enum: ['hook'] },
            headline: { type: 'array', items: { type: 'string' } },
            say: { type: 'string' },
            pieces: { type: 'array', items: { type: 'object', required: ['name', 'kind'], properties: { name: { type: 'string' }, kind: { type: 'string', enum: ['piece', 'clip'] }, at: { type: 'integer', minimum: 0 } } } },
          },
        },
      },
    },
  },
}

const LIMITS = { hook: { pieces: 3, labels: 0 }, top: { pieces: 1, labels: 3 }, solo: { pieces: 1, labels: 1 }, duo: { pieces: 2, labels: 1 }, film: { pieces: 2, labels: 1 }, payoff: { pieces: 2, labels: 0 } }
const words = (s) => stripPauses(s).split(/\s+/).filter(Boolean).length
const slug = (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s || '')

// Problems with a submitted script, in words Claude (and a person) can act on.
// `known` is the set of names already available: "piece:shoes", "clip:spill".
const LADDER = /\b(primitive|savages?|civili[sz]ed|uncivili[sz]ed|backward|exotic|bizarre|tribes?|tribal)\b/i

// Problems with a submitted script, in words Claude (and a person) can act on.
// `known` is the set of names already available: "piece:shoes", "clip:spill".
// With `submission` false (a hand edit), the parts only Claude writes are not required.
export function checkScript(s, known = new Set(), { submission = true } = {}) {
  const out = []
  const beats = s?.beats || []
  if (beats.length !== 6) out.push(`There must be exactly 6 beats; there are ${beats.length}.`)
  const total = beats.reduce((n, b) => n + words(b.say || ''), 0)
  if (total < 60 || total > 90) out.push(`The script has ${total} spoken words; it must be between 65 and 85.`)
  const before = words(beats[0]?.say || '') + (beats[1] && !beats[1].cite ? words(beats[1].say || '') : 0)
  if (beats.length >= 3 && before > 32) out.push(`The turn starts after ${before} words; it must start within the first 30 spoken words (shorten the hook or the obvious answer).`)
  if (beats[0] && words(beats[0].say || '') > 22) out.push(`The hook has ${words(beats[0].say)} words; keep it to 20.`)
  const firstSentence = (say) => (stripPauses(say || '').match(/^[^.?!]*[.?!]?/) || [''])[0]
  if (beats[0] && words(firstSentence(beats[0].say)) > 14) out.push(`The hook's first sentence has ${words(firstSentence(beats[0].say))} words; keep it to 12 so the tension lands in the first two seconds.`)
  if (submission && !/\bBUT\b/i.test(s?.chain || '') ) out.push('Write the chain as one line: "..., BUT ..., SO ...".')
  else if (submission && !/\b(SO|THEREFORE)\b/i.test(s?.chain || '')) out.push('The chain needs its SO part: "..., BUT ..., SO ...".')
  if (submission) beats.forEach((b, i) => {
    for (const sentence of stripPauses(b.say || '').split(/(?<=[.?!])\s+/)) {
      const n = words(sentence)
      if (n > 18) out.push(`Beat ${i + 1} has a ${n}-word sentence ("${sentence.slice(0, 40)}…"); split it, one idea per sentence, about 8 to 12 words.`)
    }
  })
  const declared = new Set((s?.assets || []).map((a) => `${a.kind}:${a.name}`))

  function checkBeat(b, n) {
    let clips = 0
    const lim = LIMITS[b.layout]
    if (!lim) { out.push(`${n}: unknown layout "${b.layout}".`); return 0 }
    if (!b.say || !stripPauses(b.say)) { out.push(`${n} has no spoken text.`); return 0 }
    if (/^\s*\[/.test(b.say)) out.push(`${n} starts with a pause mark; remove it.`)
    const sentences = parseSay(b.say).length
    const pieces = b.pieces || []
    if (!pieces.length) out.push(`${n} has no pieces.`)
    if (pieces.length > lim.pieces) out.push(`${n}: layout "${b.layout}" takes at most ${lim.pieces} piece(s).`)
    if ((b.labels || []).length > lim.labels) out.push(`${n}: layout "${b.layout}" takes at most ${lim.labels} label(s).`)
    if (b.layout === 'duo' && pieces.length !== 2) out.push(`${n}: "duo" needs exactly 2 pieces.`)
    if (b.layout === 'film' && pieces[0]?.kind !== 'clip') out.push(`${n}: in "film" the first piece must be a film clip.`)
    if (b.layout !== 'film' && b.layout !== 'hook' && pieces.some((p) => p.kind === 'clip')) out.push(`${n}: a film clip needs the "film" layout (or the hook).`)
    if (b.layout === 'film' && pieces[1]?.kind === 'clip') out.push(`${n}: only the first piece of "film" can be a clip.`)
    if (b.layout === 'hook' && pieces[0]?.kind !== 'clip') out.push(`${n}: the first piece of a hook must be a film clip.`)
    if (b.layout === 'hook' && !/\?/.test(b.say)) out.push(`${n}: a hook must end by asking the question.`)
    const hl = b.headline || []
    if ((b.layout === 'hook' || b.layout === 'payoff') && !hl.length) out.push(`${n}: "${b.layout}" needs a headline.`)
    if (b.layout !== 'hook' && b.layout !== 'payoff' && hl.length) out.push(`${n}: only hook and payoff have a headline.`)
    const maxLines = b.layout === 'hook' ? 2 : 3
    const maxChars = b.layout === 'hook' ? 9 : 10
    if (hl.length > maxLines) out.push(`${n}: headline has ${hl.length} lines; the limit is ${maxLines}.`)
    hl.forEach((l) => { if (l.length > maxChars) out.push(`${n}: headline line "${l}" is ${l.length} characters; the limit is ${maxChars}.`) })
    for (const l of b.labels || []) if ((l.text || '').length > 18) out.push(`${n}: label "${l.text}" is over 18 characters.`)
    if (b.cite && b.cite.length > 40) out.push(`${n}: cite "${b.cite}" is over 40 characters; shorten the title.`)
    const ats = [...pieces.map((p) => p.at), ...(b.labels || []).map((l) => l.at), b.citeAt].filter((a) => a != null)
    if (pieces.length && !pieces.some((p) => !p.at)) out.push(`${n}: no piece appears on sentence 0, so the stage starts empty; give one piece "at": 0.`)
    if (ats.some((a) => a >= sentences)) out.push(`${n} has ${sentences} sentence(s), so "at" values must be below ${sentences}.`)
    for (const p of pieces) {
      if (!slug(p.name)) out.push(`${n}: piece name "${p.name}" must be lowercase letters, digits and hyphens.`)
      if (p.kind === 'clip') clips++
      const key = `${p.kind}:${p.name}`
      if (!known.has(key) && !declared.has(key)) out.push(`${n}: "${p.name}" is not in the library and has no entry in assets.`)
    }
    const text = [b.say, ...(b.headline || []), ...(b.labels || []).map((l) => l.text)].join(' ')
    const bad = text.match(LADDER)
    if (bad) out.push(`${n} uses "${bad[0]}". Avoid ladder-of-progress and exoticising words; name the people or practice instead.`)
    return clips
  }

  let clips = 0
  beats.forEach((b, i) => { clips += checkBeat(b, `Beat ${i + 1}`) })
  if (beats[0] && beats[0].layout !== 'hook') out.push('Beat 1 must use the hook layout.')
  if (beats[5] && beats[5].layout !== 'payoff') out.push('Beat 6 must use the payoff layout.')
  if (clips < 2 || clips > 3) out.push(`There are ${clips} film clips; use 2 or 3 (one in the hook, the rest on "film" beats).`)

  if (submission) {
    if ((s?.turn || '').trim().length < 15) out.push('State the turn in one full sentence in "turn".')
    const alts = s?.alt_hooks || []
    if (alts.length !== 2) out.push(`Give exactly 2 alt_hooks; there are ${alts.length}.`)
    const styles = new Set([s?.hook_style, ...alts.map((a) => a.style)])
    if (styles.size !== 3) out.push('The three hooks must use three different styles: contradiction, surprising fact, sting.')
    alts.forEach((h, i) => {
      const clipsIn = checkBeat({ ...h, layout: 'hook' }, `Alternative hook ${i + 1}`)
      if (clipsIn !== 1) out.push(`Alternative hook ${i + 1} must contain exactly one film clip, as its first piece.`)
      const t = total - words(beats[0]?.say || '') + words(h.say || '')
      if (t < 60 || t > 90) out.push(`With alternative hook ${i + 1} the script has ${t} words; keep it between 65 and 85.`)
      if (words(h.say || '') > 22) out.push(`Alternative hook ${i + 1} has ${words(h.say)} words; keep it to 20.`)
      if (words(firstSentence(h.say)) > 14) out.push(`Alternative hook ${i + 1}'s first sentence has ${words(firstSentence(h.say))} words; keep it to 12.`)
    })
    const q = (s?.comment_question || '').trim()
    if (!q.endsWith('?') || q.length > 120) out.push('comment_question must be one question under 120 characters, ending with "?".')
    const extra = `${s?.caption || ''} ${q}`.match(LADDER)
    if (extra) out.push(`The caption uses "${extra[0]}". Avoid ladder-of-progress and exoticising words.`)
  }
  for (const a of s?.assets || []) if ((a.description || '').length < 8) out.push(`Asset "${a.name}" needs a real description.`)
  if (submission && !(s?.sources || []).length) out.push('List at least one source with its URL.')
  return out
}

// Claude's submission → the shape the collage template renders.
const toBeat = (b) => ({
  layout: b.layout,
  ...(b.headline?.length ? { headline: b.headline } : {}),
  ...(b.cite ? { cite: b.cite, ...(b.citeAt != null ? { citeAt: b.citeAt } : {}) } : {}),
  pieces: b.pieces.map((p) => ({ ...(p.kind === 'clip' ? { clip: p.name } : { name: p.name }), ...(p.at != null ? { at: p.at } : {}) })),
  ...(b.labels?.length ? { labels: b.labels.map((l) => ({ text: l.text, ...(l.at != null ? { at: l.at } : {}) })) } : {}),
  say: b.say,
})

export function toRenderScript(s, number) {
  const beats = s.beats.map(toBeat)
  const hooks = [{ style: s.hook_style, ...beats[0] }, ...(s.alt_hooks || []).map((h) => ({ style: h.style, ...toBeat({ ...h, layout: 'hook' }) }))]
  return {
    palette: s.palette,
    ...(number ? { number } : {}),
    beats,
    hooks,
    hook: 0,
    turn: s.turn,
    chain: s.chain,
    comment_question: s.comment_question,
    assets: s.assets || [],
    sources: s.sources || [],
  }
}

// The comment question goes just before the sources line.
export function captionWithQuestion(caption, question) {
  const q = String(question || '').trim()
  // a revised caption may already carry the question; never add it twice
  const c = String(caption || '').split('\n').filter((l) => !q || l.trim() !== q).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!q) return c
  const i = c.search(/\n\s*Sources:/i)
  return i === -1 ? `${c}\n\n${q}` : `${c.slice(0, i).trim()}\n\n${q}\n\n${c.slice(i).trim()}`
}

export const EDITOR_SYSTEM = `${SHOW}

You are the editor. A writer has drafted a reel script. Read it as a first-time viewer hearing it at speaking pace, then make it better. Check:
1. The turn: is there one clear finding the whole reel builds to, and would it make a stranger say "huh, interesting"? Is it stated plainly on the turn beat and landed again in the payoff?
2. One story: does each beat answer the question the previous one raised? Cut anything that is a second theory, a detour, a revision or a hedge; that belongs in the caption.
3. Plain speech: would a friend actually say each sentence out loud? Rewrite fragments, jargon and stiff academic phrasing into plain, warm sentences. Replace any term a viewer wouldn't know with what it means.
4. The chain: does the script follow its "chain" line? Read the beats with "but" or "so" between them; any beat that only fits after "and also" is a detour, so cut it or rewrite it.
5. One thread: from the turn to the payoff, does every beat use the same few plain words for the idea? Replace any new frame, image or term that appears halfway.
6. The ear: one idea per sentence, about 8 to 12 words. Split long sentences. Replace any technical term with what it means, even if the draft explains it.
7. The hook: would a scroller who hears only the first sentence want the second? If the first sentence is a setup everyone agrees with, rewrite it so the tension or the question comes first. Is the headline plain words rather than wordplay? Does the rest answer exactly the question the hook asks? Do all three hooks lead into beat 2?
8. Truth: never add a claim the sources don't support. If you remove a claim, drop its source too.

Keep the format: same JSON shape, same layouts, picture names and "at" cues unless a change of words requires moving a cue; keep within the word range. You may rewrite any spoken text, headlines, labels and the caption.

Return the full improved script with submit_script, and list what you changed in editor_notes.`

export const EDITOR_TOOL = {
  ...SCRIPT_TOOL,
  input_schema: {
    ...SCRIPT_TOOL.input_schema,
    properties: { ...SCRIPT_TOOL.input_schema.properties, editor_notes: { type: 'string', description: 'What you changed and why, briefly.' } },
  },
}
