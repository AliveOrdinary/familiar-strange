import React from 'react'
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, random, staticFile, useCurrentFrame } from 'remotion'
import '@fontsource/anton/400.css'
import '@fontsource/inter/800.css'
import '@fontsource/courier-prime/700.css'
import { PALETTES } from './palettes'
import { LAYOUTS, estimateFrames } from './layouts'
import { PaperGrain, TornStrip, Tape, DotPatch, Shape, Piece, Headline, useSteppedFrame, W } from './parts'
import { captionPhrases, stripPauses } from '../../shared/captions.js'

const ANTON = "'Anton', sans-serif"
const MONO = "'Courier Prime', monospace"
const STRIP_TOP = 1190
const STRIP_H = 250

export const beatFrames = (b) => b.durationInFrames || estimateFrames(stripPauses(b.say))
const startOf = (beats, i) => beats.slice(0, i).reduce((a, b) => a + beatFrames(b), 0)

// Captions sit on the torn strip: the one running text stream. Chunks are
// timed by length across the spoken part of the beat (word timestamps from
// the voice will replace this once TTS is wired in).
const Caption = ({ say, speechFrames, captions, ink }) => {
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
  const o = interpolate(since, [0, 2], [0.5, 1], { extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', top: STRIP_TOP, left: 70, width: W - 140, height: STRIP_H, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-1.2deg)' }}>
      <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 60, lineHeight: 1.15, color: ink, textAlign: 'center', opacity: o, textWrap: 'balance' }}>
        {text}
      </div>
    </div>
  )
}

// Short keyword slab slapped down mid-beat. Never a sentence.
const Label = ({ text, P, from = 22 }) => {
  const f = useCurrentFrame() - from
  if (f < 0) return null
  const s = interpolate(f, [0, 7], [1.18, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
  const o = interpolate(f, [0, 4], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div
      style={{
        position: 'absolute', top: 1030, left: 70, fontFamily: ANTON, fontSize: 96, lineHeight: 1, textTransform: 'uppercase',
        color: P.paper, background: P.ink, padding: '14px 26px 8px', opacity: o,
        transform: `rotate(-2.5deg) scale(${s})`, transformOrigin: 'left center',
        boxShadow: '0 10px 10px rgba(0,0,0,0.3)', clipPath: 'polygon(0.5% 3%, 99% 0, 100% 96%, 1% 100%)',
      }}
    >
      {text}
    </div>
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
  const layout = (LAYOUTS[beat.layout] || LAYOUTS.solo)(beat.pieces || [])
  const hasHeadline = !!beat.headline
  const main = layout[0]
  return (
    <>
      {main ? <DotPatch id={`dp${index}`} x={main.x + main.w * 0.55} y={main.y + main.h * 0.1} w={260} h={Math.min(420, main.h)} color={P.ink} rotate={-3} /> : null}
      <Scatter seed={`b${index}`} P={P} bounds={{ x0: 30, x1: 1050, y0: hasHeadline ? 620 : 330, y1: 1080 }} />
      {hasHeadline ? <Headline lines={beat.headline} top={230} paper={P.paper} ink={P.ink} from={3} font={ANTON} /> : null}
      {layout.map((p, i) => (
        <React.Fragment key={p.name + i}>
          <Piece id={`${index}${p.name}`} src={staticFile(`pieces/${p.name}.png`)} x={p.x} y={p.y} w={p.w} rotate={p.rotate} from={6 + i * 8} enter={p.enter} />
          {i === 1 ? <Tape x={p.x + p.w * 0.15} y={p.y - 14} w={p.w * 0.7} h={58} rotate={p.rotate + 4} /> : null}
          {beat.tags?.[i] ? <Tag text={beat.tags[i]} x={p.x + p.w / 2} y={p.y + p.h + 26} P={P} from={16 + i * 8} /> : null}
        </React.Fragment>
      ))}
      {beat.label ? <Label text={beat.label} P={P} /> : null}
      {beat.cite ? <Cite text={beat.cite} P={P} /> : null}
    </>
  )
}

export const CollageReel = ({ palette = 'tomato', number = 1, beats = [] }) => {
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
          <Beat beat={b} index={i} P={P} />
        </Sequence>
      ))}

      {/* strip + captions stay put for the whole reel */}
      <TornStrip top={STRIP_TOP} height={STRIP_H} color={P.paper} />
      {beats.map((b, i) => (
        <Sequence key={'c' + i} from={startOf(beats, i)} durationInFrames={beatFrames(b)} layout="none">
          <Caption say={b.say} speechFrames={b.speechFrames || beatFrames(b) - 12} captions={b.captions} ink={P.ink} />
          {(b.clips || []).map((c, k) => (
            <Sequence key={k} from={c.from} layout="none">
              <Audio src={c.src} />
            </Sequence>
          ))}
        </Sequence>
      ))}

      <PaperGrain id="top-grain" opacity={0.12} scale={1.6} />
    </AbsoluteFill>
  )
}
