import React from 'react'
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, random, staticFile, useCurrentFrame } from 'remotion'
import '@fontsource/anton/400.css'
import '@fontsource/inter/800.css'
import '@fontsource/courier-prime/700.css'
import { PALETTES } from './palettes'
import { layoutFor, estimateFrames } from './layouts'
import { PaperGrain, TornStrip, Tape, DotPatch, Shape, Piece, Clip, Headline, useSteppedFrame, W, H } from './parts'
import { captionPhrases, stripPauses, parseSay } from '../../shared/captions.js'

const ANTON = "'Anton', sans-serif"
const MONO = "'Courier Prime', monospace"
const STRIP_TOP = 1190
const STRIP_H = 250

export const beatFrames = (b) => b.durationInFrames || estimateFrames(stripPauses(b.say))
const startOf = (beats, i) => beats.slice(0, i).reduce((a, b) => a + beatFrames(b), 0)

// When each sentence of a beat starts, in frames. The render server measures
// this from the voice; in a silent preview it is estimated from text length.
const sentenceStarts = (beat) => {
  if (beat.sentenceStarts) return beat.sentenceStarts
  const parts = parseSay(beat.say)
  const span = beatFrames(beat) - 12
  const weight = (p) => p.text.length + p.pause * 14
  const total = parts.reduce((n, p) => n + weight(p), 0) || 1
  const out = []
  let t = 0
  for (const p of parts) { out.push(Math.round((t / total) * span)); t += weight(p) }
  return out
}
// "at: 2" means "arrive as sentence 2 starts" (a hair early, so it lands on the word)
const cue = (starts, at, fallback) => (at != null && starts[at] != null ? Math.max(0, starts[at] - 2) : fallback)

// Captions sit on the torn strip: the one running text stream. Chunks are
// timed by length across the spoken part of the beat (word timestamps from
// the voice will replace this once TTS is wired in).
const Caption = ({ say, speechFrames, captions, ink, opening = false }) => {
  const frame = useCurrentFrame()
  let text
  let since
  if (captions?.length) {
    // Real timings from the voice: each phrase starts when its sentence does.
    let active = 0
    for (let i = 0; i < captions.length; i++) if (frame >= captions[i].from) active = i
    text = captions[active].text
    since = frame - captions[active].from
  } else {
    // Preview without audio: estimate by length across the beat.
    const chunks = captionPhrases(stripPauses(say))
    const weights = chunks.map((c) => Math.max(c.length, 14))
    const total = weights.reduce((a, c) => a + c, 0) || 1
    const starts = []
    let t = 0
    for (const w of weights) { starts.push(t); t += (w / total) * speechFrames }
    let active = 0
    for (let i = 0; i < starts.length; i++) if (frame >= starts[i]) active = i
    text = chunks[active]
    since = frame - starts[active]
  }
  // phrases swap on a near-cut: a 2-frame soften, never a gap with no text
  const o = opening && frame < 2 ? 1 : interpolate(since, [0, 2], [0.5, 1], { extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', top: STRIP_TOP, left: 70, width: W - 140, height: STRIP_H, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-1.2deg)' }}>
      <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 60, lineHeight: 1.15, color: ink, textAlign: 'center', opacity: o, textWrap: 'balance' }}>
        {text}
      </div>
    </div>
  )
}

// Short keyword slab slapped down mid-beat. Never a sentence.
const Label = ({ text, P, from = 22, top = 1030 }) => {
  const f = useCurrentFrame() - from
  if (f < 0) return null
  const s = interpolate(f, [0, 7], [1.18, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
  const o = interpolate(f, [0, 4], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div
      style={{
        position: 'absolute', top, left: 70, fontFamily: ANTON, fontSize: 96, lineHeight: 1, textTransform: 'uppercase',
        color: P.paper, background: P.ink, padding: '14px 26px 8px', opacity: o,
        transform: `rotate(-2.5deg) scale(${s})`, transformOrigin: 'left center',
        boxShadow: '0 10px 10px rgba(0,0,0,0.3)', clipPath: 'polygon(0.5% 3%, 99% 0, 100% 96%, 1% 100%)',
      }}
    >
      {text}
    </div>
  )
}

// Every beat drifts slowly toward the viewer so the frame is never fully
// still, and is swept off to the left in its last few frames so the next beat
// arrives onto a cleared table instead of a hard cut.
const BeatMotion = ({ duration, last, children }) => {
  const frame = useCurrentFrame()
  const stepped = useSteppedFrame()
  const scale = interpolate(frame, [0, duration], [1, 1.045])
  const out = last ? 0 : interpolate(stepped, [duration - 9, duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) })
  return (
    <AbsoluteFill style={{ transform: `translateX(${-out * W * 0.9}px) rotate(${-out * 4}deg) scale(${scale})`, transformOrigin: `50% ${H * 0.4}px` }}>
      {children}
    </AbsoluteFill>
  )
}

// Source credit: a small paper tag under the masthead, only on the beat where
// the author is named. The full reference list goes in the post caption.
const Cite = ({ text, P, from = 14 }) => {
  const f = useCurrentFrame() - from
  if (f < 0) return null
  const o = interpolate(f, [0, 5], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', top: 196, right: 70, opacity: o, transform: 'rotate(1.2deg)', fontFamily: MONO, fontWeight: 700, fontSize: 30, letterSpacing: 1, color: P.ink, background: P.paper, padding: '9px 18px 5px', boxShadow: '0 6px 8px rgba(0,0,0,0.25)' }}>
      {text}
    </div>
  )
}

const Tag = ({ text, x, y, P, from }) => {
  const f = useSteppedFrame() - from
  if (f < 0) return null
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: 'translateX(-50%) rotate(-2deg)', fontFamily: MONO, fontWeight: 700, fontSize: 40, letterSpacing: 3, textTransform: 'uppercase', color: P.ink, background: P.paper, padding: '8px 18px 4px', boxShadow: '0 6px 8px rgba(0,0,0,0.25)' }}>
      {text}
    </div>
  )
}

// Loose shapes are placed from a seed, so every beat gets its own scatter
// without anyone hand-placing them, and re-renders are identical.
const Scatter = ({ seed, P, bounds }) => {
  const kinds = ['triangle', 'circle', 'half', 'triangle', 'circle']
  return kinds.map((kind, i) => {
    const r = (k) => random(`${seed}-${i}-${k}`)
    const edge = r('side') > 0.5
    const x = edge ? bounds.x0 + r('x') * 160 : bounds.x1 - 200 + r('x') * 160
    const y = bounds.y0 + r('y') * (bounds.y1 - bounds.y0)
    return <Shape key={i} id={`${seed}${i}`} kind={kind} x={x} y={y} size={60 + r('s') * 110} color={P.accent} rotate={r('rot') * 360} from={10 + i * 4} />
  })
}

const Beat = ({ beat, index, P }) => {
  // pieces may be plain names or { name, at } where `at` is a sentence number
  // a piece may also be a film clip: { clip: 'nurse-gift', at, startFrom }
  const specs = (beat.pieces || []).map((p) => (typeof p === 'string' ? { name: p } : p.clip ? { ...p, name: `clip:${p.clip}` } : p))
  const extra = Object.fromEntries(specs.filter((p) => p.aspect && !p.clip).map((p) => [p.name, p.aspect]))
  const layout = layoutFor(beat.layout, specs.map((p) => p.name), extra)
  const starts = sentenceStarts(beat)
  const hasHeadline = !!beat.headline
  const main = layout[0]
  const labels = beat.labels || (beat.label ? [{ text: beat.label }] : [])
  const opening = index === 0
  return (
    <>
      {main ? <DotPatch id={`dp${index}`} x={main.x + main.w * 0.55} y={main.y + main.h * 0.1} w={260} h={Math.min(420, main.h)} color={P.ink} rotate={-3} /> : null}
      <Scatter seed={`b${index}`} P={P} bounds={{ x0: 30, x1: 1050, y0: hasHeadline ? 620 : 330, y1: 1080 }} />
      {hasHeadline ? <Headline lines={beat.headline} top={230} paper={P.paper} ink={P.ink} from={opening ? 0 : cue(starts, beat.headlineAt, 3)} font={ANTON} instant={opening} /> : null}
      {layout.map((p, i) => {
        // In the opening shot, everything cued to the first sentence is already in place at frame 0.
        const first = opening && !specs[i]?.at
        const from = first ? 0 : cue(starts, specs[i]?.at, 6 + i * 8) + (specs[i]?.at != null ? i * 3 : 0)
        return (
          <React.Fragment key={p.name + i}>
            {specs[i]?.clip ? (
              <Clip id={`${index}c${i}`} src={specs[i].src || staticFile(`clips/${specs[i].clip}.mp4`)} x={p.x} y={p.y} w={p.w} h={p.h} rotate={p.rotate} from={from} enter={p.enter} startFrom={specs[i].startFrom || 0} instant={first} />
            ) : (
              <Piece id={`${index}${p.name}`} src={specs[i]?.src || staticFile(`pieces/${p.name}.png`)} x={p.x} y={p.y} w={p.w} rotate={p.rotate} from={from} enter={p.enter} instant={first} />
            )}
            {beat.tags?.[i] ? <Tag text={beat.tags[i]} x={p.x + p.w / 2} y={p.y + p.h + 26} P={P} from={from + 10} /> : null}
          </React.Fragment>
        )
      })}
      {labels.map((l, i) => (
        <Label key={i} text={l.text} P={P} from={cue(starts, l.at, 22 + i * 12)} top={1142 - (labels.length - i) * 112} />
      ))}
      {beat.cite ? <Cite text={beat.cite} P={P} from={cue(starts, beat.citeAt, 14)} /> : null}
    </>
  )
}

// The comment question, on screen for the last seconds: most viewers never see the caption.
export const QUESTION_FRAMES = 75
const Question = ({ text, P }) => {
  const f = useCurrentFrame()
  const s = interpolate(f, [0, 8], [1.12, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
  const o = interpolate(f, [0, 5], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', left: 80, right: 80, top: 1500, display: 'flex', justifyContent: 'center', opacity: o, transform: `scale(${s}) rotate(1.2deg)` }}>
      <div style={{ background: P.ink, color: P.paper, padding: '26px 34px 30px', boxShadow: '0 12px 14px rgba(0,0,0,0.35)', clipPath: 'polygon(0 2%, 99.4% 0, 100% 97%, 0.6% 100%)', maxWidth: 900 }}>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, letterSpacing: 5, opacity: 0.75, marginBottom: 10 }}>TELL US IN THE COMMENTS</div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 52, lineHeight: 1.15, textWrap: 'balance' }}>{text}</div>
      </div>
    </div>
  )
}

export const CollageReel = ({ palette = 'tomato', number = 1, beats = [], question = null }) => {
  const P = PALETTES[palette] || PALETTES.tomato
  return (
    <AbsoluteFill style={{ background: P.ground }}>
      <PaperGrain id="ground-grain" opacity={0.3} />

      <div style={{ position: 'absolute', top: 120, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontWeight: 700, fontSize: 28, letterSpacing: 5, color: P.paper, opacity: 0.9 }}>
        <span>WHY WE DO THIS</span>
        <span>Nº {String(number).padStart(3, '0')}</span>
      </div>

      {beats.map((b, i) => (
        <Sequence key={i} from={startOf(beats, i)} durationInFrames={beatFrames(b)} layout="none">
          <BeatMotion duration={beatFrames(b)} last={i === beats.length - 1}>
            <Beat beat={b} index={i} P={P} />
          </BeatMotion>
        </Sequence>
      ))}

      {/* strip + captions stay put for the whole reel */}
      <TornStrip top={STRIP_TOP} height={STRIP_H} color={P.paper} />
      {beats.map((b, i) => (
        <Sequence key={'c' + i} from={startOf(beats, i)} durationInFrames={beatFrames(b)} layout="none">
          <Caption say={b.say} speechFrames={b.speechFrames || beatFrames(b) - 12} captions={b.captions} ink={P.ink} opening={i === 0} />
          {(b.clips || []).map((c, k) => (
            <Sequence key={k} from={c.from} layout="none">
              <Audio src={c.src} />
            </Sequence>
          ))}
        </Sequence>
      ))}

      {question && beats.length ? (
        <Sequence from={startOf(beats, beats.length - 1) + beatFrames(beats[beats.length - 1]) - QUESTION_FRAMES} durationInFrames={QUESTION_FRAMES} layout="none">
          <Question text={question} P={P} />
        </Sequence>
      ) : null}
      <PaperGrain id="top-grain" opacity={0.12} scale={1.6} />
    </AbsoluteFill>
  )
}
