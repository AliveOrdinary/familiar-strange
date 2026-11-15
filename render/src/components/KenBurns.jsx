import React from 'react'
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion'

// Slow push / pull across an archival image. Direction alternates by index so
// consecutive beats never move the same way. Fades in over `fadeIn` frames so
// cuts between beats become soft dissolves.
const MOVES = [
  { from: [1.06, 0, 0], to: [1.18, -30, -40] },
  { from: [1.18, 30, -20], to: [1.06, -10, 20] },
  { from: [1.08, -40, 30], to: [1.16, 20, -10] },
  { from: [1.16, 0, 40], to: [1.08, 0, -30] },
]

export const KenBurns = ({ src, index = 0, durationInFrames, fadeIn = 10 }) => {
  const frame = useCurrentFrame()
  const m = MOVES[index % MOVES.length]
  const t = (k) => interpolate(frame, [0, durationInFrames], [m.from[k], m.to[k]], { extrapolateRight: 'clamp' })
  const opacity = interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ opacity, overflow: 'hidden' }}>
      {src ? (
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${t(0)}) translate(${t(1)}px, ${t(2)}px)`,
            // Archival photos vary wildly in tone; a consistent warm, slightly
            // faded grade makes them read as one series.
            filter: 'grayscale(0.85) sepia(0.25) contrast(1.05) brightness(0.82)',
          }}
        />
      ) : null}
    </AbsoluteFill>
  )
}
