import React from 'react'
import { AbsoluteFill, Img, interpolate, random, useCurrentFrame, Easing } from 'remotion'

export const W = 1080
export const H = 1920

// Stop-motion feel: everything moves "on threes" (10 poses a second at 30fps)
// instead of gliding, and resting pieces get nudged a hair every few frames,
// the way hand-animated paper never sits perfectly still.
export const STEP = 3
export const useSteppedFrame = () => Math.floor(useCurrentFrame() / STEP) * STEP

export const jitter = (id, frame, amount = 1) => {
  const k = Math.floor(frame / 6)
  return {
    r: (random(`r${id}${k}`) - 0.5) * 1.1 * amount,
    x: (random(`x${id}${k}`) - 0.5) * 4 * amount,
    y: (random(`y${id}${k}`) - 0.5) * 4 * amount,
  }
}

// Fibre texture over any flat colour so it reads as paper, not a fill.
export const PaperGrain = ({ id = 'grain', opacity = 0.35, scale = 0.9 }) => (
  <AbsoluteFill style={{ mixBlendMode: 'multiply', pointerEvents: 'none', opacity }}>
    <svg width="100%" height="100%">
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency={scale} numOctaves="3" seed="7" />
        <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 -1.4 1.05" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  </AbsoluteFill>
)

// A strip of paper torn by hand: both long edges are jagged.
export const TornStrip = ({ top, height, color, seed = 'strip', rotate = -1.2 }) => {
  const edge = (y, dir, s) => {
    const pts = []
    for (let x = -40; x <= W + 40; x += 14) {
      const big = (random(`${s}b${Math.floor(x / 90)}`) - 0.5) * 26
      const small = (random(`${s}s${x}`) - 0.5) * 12
      pts.push([x, y + dir * (big + small)])
    }
    return pts
  }
  const topPts = edge(20, 1, seed + 't')
  const botPts = edge(height - 20, 1, seed + 'b').reverse()
  const d = 'M' + [...topPts, ...botPts].map((p) => p.join(',')).join(' L') + ' Z'
  return (
    <div style={{ position: 'absolute', top, left: 0, width: W, height, transform: `rotate(${rotate}deg)`, filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.28))' }}>
      <svg width={W} height={height} style={{ overflow: 'visible' }}>
        <defs>
          <filter id={`fibre-${seed}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="3" />
            <feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 -1.2 0.75" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
        <path d={d} fill={color} />
        <path d={d} fill={color} filter={`url(#fibre-${seed})`} opacity="0.5" />
      </svg>
    </div>
  )
}

export const Tape = ({ x, y, w = 190, h = 54, rotate = 0 }) => (
  <div
    style={{
      position: 'absolute', left: x, top: y, width: w, height: h, transform: `rotate(${rotate}deg)`,
      background: 'rgba(240, 226, 178, 0.72)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.18)',
      clipPath: 'polygon(0 6%, 3% 0, 6% 8%, 9% 0, 100% 0, 97% 10%, 100% 22%, 97% 34%, 100% 46%, 97% 58%, 100% 70%, 97% 82%, 100% 100%, 0 100%, 3% 88%, 0 76%, 3% 64%, 0 52%, 3% 40%, 0 28%, 3% 16%)',
    }}
  />
)

export const DotPatch = ({ x, y, w, h, color, rotate = 0, id = 'dots' }) => (
  <svg width={w} height={h} style={{ position: 'absolute', left: x, top: y, transform: `rotate(${rotate}deg)` }}>
    <defs>
      <pattern id={id} width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="8" cy="8" r="4.2" fill={color} />
      </pattern>
    </defs>
    <rect width={w} height={h} fill={`url(#${id})`} />
  </svg>
)

// Loose cut paper shape that pops in and then keeps jittering.
export const Shape = ({ kind = 'circle', x, y, size, color, rotate = 0, from = 0, id }) => {
  const f = useSteppedFrame() - from
  if (f < 0) return null
  const s = interpolate(f, [0, 6], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2.2)) })
  const j = jitter(id, f)
  const clip = { circle: 'circle(50%)', triangle: 'polygon(50% 0, 100% 100%, 0 100%)', half: 'ellipse(50% 100% at 50% 100%)', square: 'none' }[kind]
  return (
    <div
      style={{
        position: 'absolute', left: x + j.x, top: y + j.y, width: size, height: kind === 'half' ? size / 2 : size,
        background: color, clipPath: clip, transform: `rotate(${rotate + j.r * 2}deg) scale(${s})`,
      }}
    />
  )
}

// A cut-out photo piece: flies in from one side, lands with a small overshoot.
export const Piece = ({ src, x, y, w, rotate = 0, from = 0, enter = 'left', id }) => {
  const f = useSteppedFrame() - from
  if (f < 0) return null
  const p = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.4)) })
  const off = { left: [-W, 0], right: [W, 0], top: [0, -900], bottom: [0, 900] }[enter]
  const j = jitter(id, f)
  const dx = off[0] * (1 - p) + j.x
  const dy = off[1] * (1 - p) + j.y
  const r = rotate + (1 - p) * (enter === 'left' ? -14 : 14) + j.r
  return (
    <Img
      src={src}
      style={{
        position: 'absolute', left: x, top: y, width: w,
        transform: `translate(${dx}px, ${dy}px) rotate(${r}deg)`,
        filter: 'drop-shadow(0 14px 12px rgba(0,0,0,0.38))',
      }}
    />
  )
}

// Cut-out headline: each line is its own slab of paper, slapped down in turn.
export const Headline = ({ lines, top, left = 80, paper, ink, from = 0, font }) => (
  <div style={{ position: 'absolute', top, left, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
    {lines.map((line, i) => (
      <HeadlineLine key={i} text={line} i={i} from={from + i * 7} paper={i % 2 ? ink : paper} ink={i % 2 ? paper : ink} font={font} />
    ))}
  </div>
)

const HeadlineLine = ({ text, i, from, paper, ink, font }) => {
  const f = useSteppedFrame() - from
  if (f < 0) return <div style={{ height: 150 }} />
  const s = interpolate(f, [0, 6], [1.35, 1], { extrapolateRight: 'clamp' })
  const o = interpolate(f, [0, 3], [0, 1], { extrapolateRight: 'clamp' })
  const j = jitter('h' + i, f, 0.6)
  const tilt = [-2.2, 1.4, -1, 1.8][i % 4]
  return (
    <div
      style={{
        fontFamily: font, fontSize: 132, lineHeight: 1, textTransform: 'uppercase', letterSpacing: 1,
        color: ink, background: paper, padding: '14px 26px 8px',
        transform: `translate(${j.x}px, ${j.y}px) rotate(${tilt + j.r}deg) scale(${s})`, transformOrigin: 'left center',
        opacity: o, boxShadow: '0 10px 10px rgba(0,0,0,0.3)',
        clipPath: 'polygon(0.5% 3%, 99% 0, 100% 96%, 1% 100%)',
      }}
    >
      {text}
    </div>
  )
}
