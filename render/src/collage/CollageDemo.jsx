import React from 'react'
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from 'remotion'
import '@fontsource/anton/400.css'
import '@fontsource/inter/800.css'
import '@fontsource/courier-prime/700.css'
import { PALETTES } from './palettes'
import { PaperGrain, TornStrip, Tape, DotPatch, Shape, Piece, Headline, W } from './parts'

const ANTON = "'Anton', sans-serif"

// Style test: the opening beat of the tipping reel. Layout is hand-placed
// here; the real template will pick from a few layout presets per beat.
const CAPTIONS = [
  { text: 'You tip the waiter.', from: 30, to: 70 },
  { text: 'You don’t tip the nurse.', from: 70, to: 112 },
  { text: 'Why?', from: 112, to: 999 },
]

const Caption = ({ ink }) => {
  const frame = useCurrentFrame()
  const c = CAPTIONS.find((x) => frame >= x.from && frame < x.to)
  if (!c) return null
  const s = interpolate(frame - c.from, [0, 3], [0.9, 1], { extrapolateRight: 'clamp' })
  return (
    <div
      style={{
        position: 'absolute', top: 1262, left: 60, width: W - 120, textAlign: 'center',
        fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 66, color: ink,
        transform: `rotate(-1.2deg) scale(${s})`,
      }}
    >
      {c.text}
    </div>
  )
}

export const CollageDemo = ({ palette = 'tomato', number = 1 }) => {
  const P = PALETTES[palette] || PALETTES.tomato
  return (
    <AbsoluteFill style={{ background: P.ground }}>
      <PaperGrain id="ground-grain" opacity={0.3} />

      {/* masthead */}
      <div style={{ position: 'absolute', top: 120, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: 28, letterSpacing: 5, color: P.paper, opacity: 0.9 }}>
        <span>WHY WE DO THIS</span>
        <span>Nº {String(number).padStart(3, '0')}</span>
      </div>

      <Headline lines={['Why do', 'we tip?']} top={230} paper={P.paper} ink={P.ink} from={4} font={ANTON} />

      {/* loose shapes + halftone patch behind the photos */}
      <DotPatch id="dp1" x={470} y={720} w={250} h={420} color={P.ink} rotate={-3} />
      <Shape id="s1" kind="triangle" x={410} y={640} size={110} color={P.accent} rotate={18} from={14} />
      <Shape id="s2" kind="half" x={800} y={610} size={170} color={P.accent} rotate={8} from={18} />
      <Shape id="s3" kind="triangle" x={70} y={940} size={90} color={P.accent} rotate={-70} from={22} />

      <Piece id="receipt" src={staticFile('demo/receipt.png')} x={600} y={650} w={390} rotate={5} from={16} enter="right" />
      <Tape x={640} y={640} w={330} h={62} rotate={9} />

      <Piece id="hand" src={staticFile('demo/hand.png')} x={-40} y={690} w={640} rotate={-3} from={8} enter="left" />

      {/* the torn strip carries the captions: one text stream, always readable */}
      <TornStrip top={1190} height={250} color={P.paper} />
      <Shape id="s4" kind="circle" x={110} y={1170} size={74} color={P.accent} from={26} />
      <Tape x={70} y={1120} w={210} h={56} rotate={32} />
      <Caption ink={P.ink} />

      <Piece id="cup" src={staticFile('demo/cup.png')} x={640} y={1380} w={380} rotate={-8} from={24} enter="bottom" />
      <Shape id="s5" kind="circle" x={300} y={1560} size={46} color={P.accent} from={30} />
      <Shape id="s6" kind="triangle" x={380} y={1600} size={150} color={P.accent} rotate={200} from={32} />
      <Tape x={330} y={1690} w={230} h={58} rotate={14} />

      <PaperGrain id="top-grain" opacity={0.12} scale={1.6} />
    </AbsoluteFill>
  )
}
