import React from 'react'
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { C, FONT, SAFE, fitText } from './theme'
import { KenBurns } from './components/KenBurns'
import { Captions } from './components/Captions'
import { Grain } from './components/Grain'

// lines: [{ kind: 'hook'|'beat'|'payoff'|'cta', say, show, src, durationInFrames,
//           speechFrames, image, credit }]
// Timing is AUDIO-DRIVEN: the server measures each TTS clip and passes the
// durations in. Every visual change lands on a line boundary.

const FADE = 12
const lineStart = (lines, i) => lines.slice(0, i).reduce((a, l) => a + l.durationInFrames, 0)
const TEXT_W = 1080 - SAFE.left - SAFE.right

const Rise = ({ children, delay = 0 }) => {
  const frame = useCurrentFrame() - delay
  const o = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const y = interpolate(frame, [0, 10], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <div style={{ opacity: o, transform: `translateY(${y}px)` }}>{children}</div>
}

const Underline = ({ delay, width = 260 }) => {
  const frame = useCurrentFrame() - delay
  const w = interpolate(frame, [0, 14], [0, width], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <div style={{ height: 6, width: w, background: C.ochre, marginTop: 28, borderRadius: 3 }} />
}

// Big statement text: the hook question and the payoff.
const Statement = ({ text, italic = false }) => {
  const size = fitText(text, { maxWidth: TEXT_W, maxSize: 118, minSize: 64, maxLines: 4 })
  return (
    <Rise>
      <div
        style={{
          fontFamily: FONT.display,
          fontWeight: 400,
          fontStyle: italic ? 'italic' : 'normal',
          fontSize: size,
          lineHeight: 1.1,
          color: C.bone,
          textShadow: '0 4px 30px rgba(0,0,0,0.6)',
        }}
      >
        {text}
      </div>
      <Underline delay={8} />
    </Rise>
  )
}

// Beat label: the short on-screen punch, deliberately different from the voice.
const BeatLabel = ({ text, n }) => (
  <Rise>
    <div style={{ fontFamily: FONT.mono, fontSize: 30, letterSpacing: 4, color: C.ochre, marginBottom: 22 }}>
      {String(n).padStart(2, '0')}
    </div>
    <div
      style={{
        fontFamily: FONT.display,
        fontWeight: 300,
        fontStyle: 'italic',
        fontSize: fitText(text, { maxWidth: TEXT_W, maxSize: 84, minSize: 52, maxLines: 3 }),
        lineHeight: 1.15,
        color: C.bone,
        textShadow: '0 4px 24px rgba(0,0,0,0.6)',
      }}
    >
      {text}
    </div>
  </Rise>
)

export const WhyReel = ({ lines = [], number = 1, handle = '@the.familiarstrange', ambientSrc = null }) => {
  const frame = useCurrentFrame()
  const beats = lines.filter((l) => l.kind === 'beat')
  const current = lines.findIndex((_, i) => frame < lineStart(lines, i + 1))
  const credit = lines[current === -1 ? lines.length - 1 : current]?.credit

  return (
    <AbsoluteFill style={{ background: C.ink, color: C.bone }}>
      {/* Images: each extends FADE frames past its line and later lines sit on
          top, so every cut is a dissolve instead of a dip to black. */}
      {lines.map((l, i) => (
        <Sequence
          key={'img' + i}
          from={lineStart(lines, i)}
          durationInFrames={l.durationInFrames + (i < lines.length - 1 ? FADE : 60)}
          layout="none"
        >
          <KenBurns src={l.image} index={i} durationInFrames={l.durationInFrames + FADE} fadeIn={i === 0 ? 1 : FADE} />
        </Sequence>
      ))}

      {/* Legibility: darken top (masthead) and the text band */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(20,18,16,0.75) 0%, rgba(20,18,16,0.15) 22%, rgba(20,18,16,0.35) 50%, rgba(20,18,16,0.85) 100%)',
        }}
      />

      {/* Masthead */}
      <div
        style={{
          position: 'absolute',
          top: 130,
          left: SAFE.left,
          right: SAFE.left,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: FONT.mono,
          fontSize: 28,
          letterSpacing: 6,
          color: C.muted,
        }}
      >
        <span>WHY WE DO THIS</span>
        <span>Nº {String(number).padStart(3, '0')}</span>
      </div>

      {/* Per-line text */}
      {lines.map((l, i) => {
        const beatN = beats.indexOf(l) + 1
        return (
          <Sequence key={'txt' + i} from={lineStart(lines, i)} durationInFrames={l.durationInFrames} layout="none">
            <div style={{ position: 'absolute', top: 560, left: SAFE.left, right: SAFE.right }}>
              {l.kind === 'hook' ? <Statement text={l.show} /> : null}
              {l.kind === 'beat' ? <BeatLabel text={l.show} n={beatN} /> : null}
              {l.kind === 'payoff' ? <Statement text={l.show} italic /> : null}
              {l.kind === 'cta' ? (
                <Rise>
                  <div style={{ fontFamily: FONT.display, fontSize: 72, lineHeight: 1.15 }}>{l.show}</div>
                  <div style={{ fontFamily: FONT.mono, fontSize: 34, color: C.ochre, marginTop: 36 }}>{handle}</div>
                </Rise>
              ) : null}
            </div>
            <Captions text={l.say} speechFrames={l.speechFrames || l.durationInFrames} top={1230} />
          </Sequence>
        )
      })}

      {/* Progress ticks + image credit, inside the safe area */}
      <div
        style={{
          position: 'absolute',
          top: SAFE.bottom - 90,
          left: SAFE.left,
          right: SAFE.right,
          fontFamily: FONT.mono,
          color: C.muted,
        }}
      >
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          {beats.map((b, i) => {
            const done = frame >= lineStart(lines, lines.indexOf(b))
            return (
              <div key={i} style={{ width: 34, height: 4, borderRadius: 2, background: done ? C.ochre : 'rgba(237,230,216,0.25)' }} />
            )
          })}
        </div>
        <div style={{ fontSize: 22, letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {credit ? `Image: ${credit}` : ''}
        </div>
      </div>

      {/* Voice */}
      {lines.map((l, i) =>
        l.src ? (
          <Sequence key={'a' + i} from={lineStart(lines, i)} durationInFrames={l.durationInFrames} layout="none">
            <Audio src={l.src} />
          </Sequence>
        ) : null
      )}
      {ambientSrc ? <Audio src={ambientSrc} volume={0.1} loop /> : null}

      <Grain />
    </AbsoluteFill>
  )
}
