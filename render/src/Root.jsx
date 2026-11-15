import React from 'react'
import { Composition } from 'remotion'
import { FPS, W, H } from './theme'
import { WhyReel } from './WhyReel'

const TAIL_PAD = 45 // 1.5s hold on the last frame so the loop doesn't jolt

const durationFromLines = ({ props }) => ({
  durationInFrames: Math.max(90, props.lines.reduce((a, l) => a + l.durationInFrames, 0) + TAIL_PAD),
  fps: FPS,
  width: W,
  height: H,
})

// Sample so `npm run studio` works without the render server (no audio,
// no images, estimated durations). Paste a real image URL into `image` to
// preview the pans.
const sample = {
  number: 1,
  handle: '@familiar.strange',
  lines: [
    {
      kind: 'hook',
      say: 'You tip the waiter. You don’t tip the nurse. Why?',
      show: 'Why do we tip some people and not others?',
      durationInFrames: 105,
      image: null,
      credit: null,
    },
    {
      kind: 'beat',
      say: 'In 1925, Marcel Mauss noticed something strange: no gift is ever free.',
      show: 'No gift is ever free',
      durationInFrames: 120,
      image: null,
      credit: null,
    },
    {
      kind: 'beat',
      say: 'Every gift creates a debt, and the debt creates a relationship.',
      show: 'The debt is the point',
      durationInFrames: 110,
      image: null,
      credit: null,
    },
    {
      kind: 'beat',
      say: 'A tip keeps a stranger’s service personal. A salary keeps it a job.',
      show: 'Personal vs. professional',
      durationInFrames: 120,
      image: null,
      credit: null,
    },
    {
      kind: 'payoff',
      say: 'So a tip isn’t really payment. It’s a tiny gift, and gifts are how we say: this was between us.',
      show: 'A tip is a gift pretending to be a payment.',
      durationInFrames: 150,
      image: null,
      credit: null,
    },
  ],
}

export const RemotionRoot = () => (
  <Composition
    id="WhyReel"
    component={WhyReel}
    calculateMetadata={durationFromLines}
    defaultProps={sample}
    fps={FPS}
    width={W}
    height={H}
    durationInFrames={600}
  />
)
