import React from 'react'
import { AbsoluteFill, Freeze, Img, OffthreadVideo, interpolate, random, useCurrentFrame, Easing } from 'remotion'

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
// --- Paper physics -------------------------------------------------------
// A piece is paper on a table: it moves on twos, carries a hand jitter only
// while it moves, lands (a slide overshoots and settles; a drop falls faster
// and bounces once) and then lies still. Its shadow shows its height: big,
// soft and far while it flies, tight under it once it lands. A thin darker
// cut edge gives it thickness.
const TWOS = 2
const LAND = 12 // frames from entering to touching down
export function paperMotion(fRaw, { enter = 'left', id = 'p', instant = false } = {}) {
  if (instant) return { dx: 0, dy: 0, r: 0, lift: 0, landed: true }
  const f = Math.floor(fRaw / TWOS) * TWOS
  if (enter === 'top') {
    // drop: accelerate down, one small bounce, settle
    const fall = interpolate(f, [0, LAND], [0, 1], { extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) })
    const bounce = f > LAND && f <= LAND + 8 ? Math.sin(((f - LAND) / 8) * Math.PI) * 26 : 0
    const lift = f < LAND ? 1 - fall * 0.8 : f <= LAND + 8 ? bounce / 60 : 0
    const moving = f <= LAND + 8
    const j = moving ? jitter(id, f, 0.6) : { x: 0, y: 0, r: 0 }
    return { dx: j.x, dy: -900 * (1 - fall) - bounce + j.y, r: j.r + (1 - fall) * 8, lift, landed: !moving }
  }
  // slide (left, right, bottom): overshoot past the mark, wiggle back, settle
  const p = interpolate(f, [0, LAND], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.5)) })
  const settle = f > LAND && f <= LAND + 6 ? Math.sin(((f - LAND) / 6) * Math.PI * 2) * 0.8 : 0
  const off = { left: [-W, 0], right: [W, 0], bottom: [0, 900] }[enter] || [-W, 0]
  const moving = f <= LAND + 6
  const j = moving ? jitter(id, f, 0.6) : { x: 0, y: 0, r: 0 }
  const lift = Math.max(0, 1 - p) * 0.9 + (f < LAND ? 0.1 : 0)
  return { dx: off[0] * (1 - p) + j.x, dy: off[1] * (1 - p) + j.y, r: (1 - p) * (enter === 'left' ? -14 : 14) + settle + j.r, lift, landed: !moving }
}

// Shadow from a top-left light that grows with height, plus the cut edge.
export const paperFilter = (lift) =>
  `drop-shadow(1.5px 2px 0 rgba(70, 55, 40, 0.55)) drop-shadow(${4 + lift * 22}px ${8 + lift * 34}px ${6 + lift * 26}px rgba(0,0,0,${(0.36 - lift * 0.14).toFixed(3)}))`

export const Piece = ({ src, x, y, w, rotate = 0, from = 0, enter = 'left', id, instant = false, onLand }) => {
  const f = useCurrentFrame() - from
  if (f < 0) return null
  const m = paperMotion(f, { enter, id, instant })
  return (
    <>
      <Img
        src={src}
        style={{
          position: 'absolute', left: x, top: y, width: w,
          transform: `translate(${m.dx}px, ${m.dy}px) rotate(${rotate + m.r}deg) scale(${1 + m.lift * 0.05})`,
          filter: paperFilter(m.lift),
        }}
      />
      {!instant && onLand ? onLand(LAND) : null}
    </>
  )
}

// A moving photo: a short film clip printed in black and white, glued inside
// a white paper frame and taped down. It flies in like any other piece, plays
// on threes so it shares the stop-motion rhythm, and carries print dots.
export const Clip = ({ src, x, y, w, h, rotate = 0, from = 0, enter = 'left', id, startFrom = 0, instant = false, onLand }) => {
  const f = useCurrentFrame() - from
  if (f < 0) return null
  const m = paperMotion(f, { enter, id, instant })
  const B = 22
  const play = Math.floor(Math.max(0, f) / STEP) * STEP
  return (
    <>
      <div
        style={{
          position: 'absolute', left: x, top: y, width: w, height: h, background: '#f4efe4', padding: B, boxSizing: 'border-box',
          transform: `translate(${m.dx}px, ${m.dy}px) rotate(${rotate + m.r}deg) scale(${1 + m.lift * 0.04})`,
          filter: paperFilter(m.lift),
          clipPath: 'polygon(0.6% 1.2%, 99.2% 0, 100% 98.6%, 0 100%)',
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#111' }}>
          <Freeze frame={play}>
            <OffthreadVideo src={src} muted startFrom={startFrom} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) contrast(1.55) brightness(1.08)' }} />
          </Freeze>
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, mixBlendMode: 'multiply', opacity: 0.55 }}>
            <defs>
              <pattern id={`ht-${id}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="#fff" />
                <circle cx="3.5" cy="3.5" r="1.7" fill="#3a3a3a" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#ht-${id})`} />
          </svg>
        </div>
        <div style={{ position: 'absolute', left: '50%', top: -24, width: 170, height: 48, marginLeft: -85, transform: 'rotate(-4deg)', background: 'rgba(240, 226, 178, 0.78)', boxShadow: '0 2px 4px rgba(0,0,0,0.18)' }} />
      </div>
      {!instant && onLand ? onLand(LAND) : null}
    </>
  )
}

// Cut-out headline: each line is its own slab of paper, slapped down in turn.
export const Headline = ({ lines, top, left = 80, paper, ink, from = 0, font, instant = false }) => (
  <div style={{ position: 'absolute', top, left, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
    {lines.map((line, i) => (
      <HeadlineLine key={i} text={line} i={i} from={instant ? 0 : from + i * 7} paper={i % 2 ? ink : paper} ink={i % 2 ? paper : ink} font={font} instant={instant} />
    ))}
  </div>
)

const HeadlineLine = ({ text, i, from, paper, ink, font, instant = false }) => {
  const f = useCurrentFrame() - from
  if (f < 0) return <div style={{ height: 150 }} />
  // Text lands once and then holds still: the paper pieces carry the
  // stop-motion jitter, anything that has to be read does not.
  // a slap: one drawing of a larger copy held above the table, then down
  const up = !instant && f < 2
  const s = up ? 1.14 : 1
  const o = 1
  const tilt = [-2.2, 1.4, -1, 1.8][i % 4] + (up ? -1.2 : 0)
  return (
    <div
      style={{
        fontFamily: font, fontSize: 132, lineHeight: 1, textTransform: 'uppercase', letterSpacing: 1,
        color: ink, background: paper, padding: '14px 26px 8px',
        transform: `rotate(${tilt}deg) scale(${s})`, transformOrigin: 'left center',
        opacity: o, boxShadow: up ? '10px 26px 22px rgba(0,0,0,0.22)' : '2px 3px 0 rgba(70,55,40,0.5), 0 10px 10px rgba(0,0,0,0.3)',
        clipPath: up ? 'none' : 'polygon(0.5% 3%, 99% 0, 100% 96%, 1% 100%)',
      }}
    >
      {text}
    </div>
  )
}
