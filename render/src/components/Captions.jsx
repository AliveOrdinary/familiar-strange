import React from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { C, FONT, captionChunks } from '../theme'

// Sound-off captions for one spoken line. Without word timestamps from TTS we
// allot each chunk time in proportion to its character count across the
// spoken portion of the line — close enough at reel pace, and it never drifts
// across lines because every line restarts the clock.
export const Captions = ({ text, speechFrames, top }) => {
  const frame = useCurrentFrame()
  const chunks = captionChunks(text)
  const total = chunks.reduce((a, c) => a + c.length, 0) || 1

  let start = 0
  let active = chunks.length - 1
  let activeStart = 0
  for (let i = 0; i < chunks.length; i++) {
    const len = (chunks[i].length / total) * speechFrames
    if (frame < start + len) {
      active = i
      activeStart = start
      break
    }
    start += len
    activeStart = start
  }

  const local = frame - activeStart
  const pop = interpolate(local, [0, 4], [0.92, 1], { extrapolateRight: 'clamp' })
  const o = interpolate(local, [0, 3], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 90,
        right: 150,
        textAlign: 'center',
        fontFamily: FONT.caption,
        fontWeight: 700,
        fontSize: 54,
        lineHeight: 1.2,
        color: C.bone,
        textShadow: '0 2px 18px rgba(0,0,0,0.85)',
        opacity: o,
        transform: `scale(${pop})`,
      }}
    >
      {chunks[active]}
    </div>
  )
}
