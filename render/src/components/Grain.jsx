import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { W, H } from '../theme'

// Film grain that re-seeds every few frames for a subtle analog flicker.
export const Grain = ({ opacity = 0.18 }) => {
  const frame = useCurrentFrame()
  const seed = Math.floor(frame / 4)
  return (
    <AbsoluteFill style={{ mixBlendMode: 'overlay', pointerEvents: 'none' }}>
      <svg width={W} height={H}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed={seed} />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope={opacity} />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  )
}
