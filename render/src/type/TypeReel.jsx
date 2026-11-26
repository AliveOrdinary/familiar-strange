// Style B: type-led. The spoken sentence is the picture: big serif type on
// cream paper, revealed word by word as it is said, key words in one accent
// colour, one picture at a time underneath. Calm, legible, one idea per
// screen. Same beats and props as the collage template.
import React from 'react'
import '@fontsource/fraunces/600.css'
import '@fontsource/fraunces/600-italic.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/800.css'
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, interpolate, useCurrentFrame, Easing } from 'remotion'
import { parseSay, stripPauses } from '../../shared/captions.js'
import { PaperGrain } from '../collage/parts.jsx'

const SERIF = "'Fraunces', serif"
const SANS = "'Inter', sans-serif"
const PAPER = '#F2EBDD'
const INK = '#1E1B17'
const ACCENTS = { tomato: '#C8372A', forest: '#2F6B4F', cobalt: '#2B4BC4', mustard: '#B97F12', plum: '#7A3366' }

const estimate = (say) => Math.max(45, Math.round(stripPauses(say).split(/\s+/).length * 11))
export const typeBeatFrames = (b) => b.durationInFrames || estimate(b.say)
const startOf = (beats, i) => beats.slice(0, i).reduce((a, b) => a + typeBeatFrames(b), 0)
const ease = Easing.out(Easing.cubic)
const END_HOLD = 30 // the composition runs 30 frames past the last beat; hold the final frame
const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')

// Sentences of a beat, each with its words and the frame each word is spoken.
// One-take renders carry exact word times; otherwise words are spread over the
// sentence by length.
function sentencesOf(beat) {
  const texts = parseSay(beat.say).map((x) => x.text)
  const end = beat.speechFrames || typeBeatFrames(beat) - 12
  const starts = beat.sentenceStarts || texts.map((_, i) => Math.round((end * i) / Math.max(1, texts.length)))
  return texts.map((text, i) => {
    const from = starts[i] ?? 0
    const to = starts[i + 1] ?? end
    let words
    if (beat.words?.length) words = beat.words.filter((w) => w.s === i).map((w) => ({ text: w.text, from: w.from }))
    if (!words?.length) {
      const tokens = text.match(/\S+/g) || []
      const lens = tokens.map((t) => t.length + 1)
      const total = lens.reduce((a, b) => a + b, 0) || 1
      let acc = 0
      words = tokens.map((t, k) => { const w = { text: t, from: Math.round(from + ((to - from) * 0.85 * acc) / total) }; acc += lens[k]; return w })
    }
    return { text, from, to, words }
  })
}

// Words worth the accent colour: the beat's on-screen labels and headline words.
function keyWords(beat) {
  const set = new Set()
  for (const l of beat.labels || []) for (const w of String(l.text || '').split(/\s+/)) if (norm(w).length > 2) set.add(norm(w))
  for (const line of beat.headline || []) for (const w of String(line).split(/\s+/)) if (norm(w).length > 3) set.add(norm(w))
  return set
}

const Word = ({ text, from, accent, color, instant }) => {
  const f = useCurrentFrame()
  const p = instant ? 1 : interpolate(f, [from - 2, from + 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
  return (
    <span style={{ display: 'inline-block', opacity: 0.12 + 0.88 * p, transform: `translateY(${(1 - p) * 14}px)`, color: accent ? color : INK, fontStyle: accent ? 'italic' : 'normal', marginRight: '0.24em' }}>
      {text}
    </span>
  )
}

const Sentence = ({ s, keys, accent, instant, underline, size }) => {
  const f = useCurrentFrame()
  const shown = instant || f >= s.from ? 1 : 0
  const out = shown * interpolate(f, [s.to - 6, s.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const lastWord = s.words[s.words.length - 1]?.from ?? s.from
  const line = underline ? interpolate(f, [lastWord + 4, lastWord + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease }) : 0
  return (
    <div style={{ position: 'absolute', left: 90, right: 90, top: 300, opacity: out }}>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: size, lineHeight: 1.08, letterSpacing: -1, textWrap: 'balance', color: INK }}>
        {s.words.map((w, i) => (
          <Word key={i} text={w.text} from={w.from} accent={keys.has(norm(w.text))} color={accent} instant={instant} />
        ))}
      </div>
      {underline ? <div style={{ height: 10, marginTop: 26, width: `${line * 62}%`, background: accent, borderRadius: 5 }} /> : null}
    </div>
  )
}

// One picture at a time under the text: the beat's pieces swap in at the
// sentence they are cued to. Cut-outs float; film clips play in a clean frame.
const Picture = ({ spec, from, to, instant, id, compact }) => {
  const f = useCurrentFrame()
  const inP = instant ? 1 : interpolate(f, [from, from + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
  const outP = to == null ? 1 : interpolate(f, [to - 5, to + 3], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  if (f < from - 1 || (to != null && f > to + 4)) return null
  const drift = Math.sin((f - from) / 40) * 6
  const style = { position: 'absolute', left: '50%', top: compact ? 900 : 1080, scale: compact ? '0.8' : '1', transformOrigin: 'top center', transform: `translate(-50%, ${(1 - inP) * 40 + drift}px) rotate(${spec.clip ? -1.2 : 0}deg)`, opacity: inP * outP }
  if (spec.clip) {
    return (
      <div style={{ ...style, width: 660, height: 760, padding: 14, background: '#fff', boxShadow: '0 18px 30px rgba(30,27,23,0.22)', border: `2px solid ${INK}` }}>
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#222' }}>
          <OffthreadVideo src={spec.src || staticFile(`clips/${spec.clip}.mp4`)} muted startFrom={spec.startFrom || 0} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) sepia(0.25) contrast(1.25)' }} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ ...style, width: 720, height: 720, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Img src={spec.src || staticFile(`pieces/${spec.name}.png`)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'drop-shadow(0 16px 18px rgba(30,27,23,0.25))' }} />
    </div>
  )
}

const Kicker = ({ text, accent, from }) => {
  const f = useCurrentFrame()
  const o = interpolate(f, [from, from + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <div style={{ position: 'absolute', left: 92, top: 236, fontFamily: SANS, fontWeight: 800, fontSize: 30, letterSpacing: 4, textTransform: 'uppercase', color: accent, opacity: o }}>{text}</div>
}

const Beat = ({ beat, index, total, accent, bookend, compact }) => {
  const sents = sentencesOf(beat)
  const keys = keyWords(beat)
  const opening = index === 0
  const turn = index === 2
  const all = (beat.pieces || []).map((p) => (typeof p === 'string' ? { name: p } : p))
  // one picture per sentence cue; when two share a cue, the film clip wins
  const byCue = new Map()
  for (const p of all) { const k = p.at ?? 0; if (!byCue.has(k) || (p.clip && !byCue.get(k).clip)) byCue.set(k, p) }
  const specs = [...byCue.values()].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
  const lead = specs.length ? specs : bookend ? [bookend] : []
  // when each picture shows: from its cued sentence until the next picture's
  const shows = lead.map((p, i) => ({ spec: p, from: opening && !p.at ? 0 : sents[p.at ?? 0]?.from ?? 0 }))
  const words = (beat.say || '').split(/\s+/).length
  const size = Math.max(...sents.map((s) => s.words.length)) > 11 || words > 30 ? 84 : 100
  return (
    <>
      {beat.cite ? <Kicker text={beat.cite} accent={accent} from={sents[beat.citeAt ?? 0]?.from ?? 0} /> : null}
      {shows.map((s, i) => (
        <Picture key={i} id={`${index}-${i}`} spec={s.spec} from={s.from} to={shows[i + 1]?.from} instant={opening && s.from === 0} compact={compact} />
      ))}
      {sents.map((s, i) => (
        <Sentence key={i} s={{ ...s, to: i < sents.length - 1 ? s.to : 1e9 }} keys={keys} accent={accent} instant={opening && i === 0} underline={turn && i === 0} size={size} />
      ))}
    </>
  )
}

export const TypeReel = ({ palette = 'tomato', number = 1, beats = [], question = null, voiceover = null }) => {
  const accent = ACCENTS[palette] || ACCENTS.tomato
  const first = (beats[0]?.pieces || []).map((p) => (typeof p === 'string' ? { name: p } : p))[0]
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <PaperGrain id="type-grain" opacity={0.22} />
      <div style={{ position: 'absolute', top: 120, left: 92, right: 92, display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontWeight: 600, fontSize: 26, letterSpacing: 5, color: INK, opacity: 0.55 }}>
        <span>WHY WE DO THIS</span>
        <span>Nº {String(number).padStart(3, '0')}</span>
      </div>

      {beats.map((b, i) => (
        <Sequence key={i} from={startOf(beats, i)} durationInFrames={typeBeatFrames(b) + (i === beats.length - 1 ? END_HOLD : 0)} layout="none">
          <Beat beat={b} index={i} total={beats.length} accent={accent} bookend={i === beats.length - 1 && !(b.pieces || []).length ? first : null} compact={!!question && i === beats.length - 1} />
          {(b.clips || []).map((c, k) => (
            <Sequence key={k} from={c.from} layout="none">
              <Audio src={c.src} />
            </Sequence>
          ))}
        </Sequence>
      ))}

      {voiceover?.src ? (
        <Sequence from={voiceover.from || 0} layout="none">
          <Audio src={voiceover.src} />
        </Sequence>
      ) : null}

      {question && beats.length ? (
        <Sequence from={startOf(beats, beats.length - 1) + 8} durationInFrames={typeBeatFrames(beats[beats.length - 1]) - 8 + END_HOLD} layout="none">
          <QuestionCard text={question} accent={accent} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  )
}

const QuestionCard = ({ text, accent }) => {
  const f = useCurrentFrame()
  const p = interpolate(f, [0, 10], [0, 1], { extrapolateRight: 'clamp', easing: ease })
  return (
    <div style={{ position: 'absolute', left: 90, right: 90, bottom: 150, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, background: INK, color: PAPER, padding: '28px 36px 32px', borderRadius: 6 }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 24, letterSpacing: 5, color: accent, filter: 'brightness(1.5)', marginBottom: 10 }}>TELL US IN THE COMMENTS</div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 50, lineHeight: 1.15, textWrap: 'balance' }}>{text}</div>
    </div>
  )
}
