import '@fontsource/fraunces/300.css'
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/400-italic.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/700.css'
import '@fontsource/courier-prime/400.css'

export const FPS = 30
export const W = 1080
export const H = 1920

// "Why we do this" — archival, warm, quiet. The writing carries the punch;
// the frame stays out of its way.
export const C = {
  ink: '#141210', // near-black ground
  bone: '#EDE6D8', // primary text
  dim: 'rgba(237, 230, 216, 0.72)',
  muted: 'rgba(237, 230, 216, 0.5)',
  ochre: '#C8892E', // single accent: the underline, the progress ticks
}

export const FONT = {
  display: "'Fraunces', serif",
  caption: "'Inter', sans-serif",
  mono: "'Courier Prime', monospace",
}

// Instagram overlays its own UI on the bottom ~20% and the right edge, so all
// text lives inside this box.
export const SAFE = { top: 220, bottom: 1500, left: 90, right: 150 }

// Rough width-aware font sizing (Fraunces averages ~0.52em per glyph; 0.58
// leaves room for word-boundary wrapping).
export function fitText(text, { maxWidth, maxSize, minSize, maxLines = 3 }) {
  const chars = (text || '').length
  if (!chars) return maxSize
  for (let size = maxSize; size > minSize; size -= 2) {
    const perLine = Math.max(1, Math.floor(maxWidth / (size * 0.58)))
    if (Math.ceil(chars / perLine) <= maxLines) return size
  }
  return minSize
}

// Split spoken text into short caption chunks (sound-off viewers read these).
// Breaks on punctuation first, otherwise every ~4 words, but never strands a
// little word like "the" or "of" at the end of a chunk.
const DANGLERS = new Set(['a', 'an', 'the', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'with', 'is', 'it', 'you', 'we', 'our', 'your', 'their', 'that', 'but'])
export function captionChunks(text, maxWords = 4) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean)
  const chunks = []
  let cur = []
  for (const w of words) {
    cur.push(w)
    const punct = /[.,;:!?—]$/.test(w)
    const dangling = DANGLERS.has(w.toLowerCase())
    if (punct || (cur.length >= maxWords && !dangling) || cur.length >= maxWords + 2) {
      chunks.push(cur.join(' '))
      cur = []
    }
  }
  if (cur.length) chunks.push(cur.join(' '))
  // Fold one-word orphans ("free.", "strange:") into the chunk before them.
  const merged = []
  for (const c of chunks) {
    const prev = merged[merged.length - 1]
    if (prev && !c.includes(' ') && prev.split(' ').length <= maxWords + 1) merged[merged.length - 1] = prev + ' ' + c
    else merged.push(c)
  }
  return merged
}
