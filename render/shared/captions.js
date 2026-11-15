// Phrase-level captions: one clause at a time, so the strip changes a few
// times per beat instead of flickering every few words. Sentences split at
// their end; long ones split again at a comma or, failing that, the middle.
export function captionPhrases(text, maxWords = 8) {
  const sentences = (text || '').trim().match(/[^.!?:]+[.!?:]+["”’]?|[^.!?:]+$/g) || []
  const out = []
  for (const raw of sentences) {
    const words = raw.trim().split(/\s+/).filter(Boolean)
    if (words.length <= maxWords) { out.push(words.join(' ')); continue }
    let cur = []
    const parts = []
    for (const w of words) {
      cur.push(w)
      if (/,$/.test(w) && cur.length >= 3) { parts.push(cur); cur = [] }
    }
    if (cur.length) parts.push(cur)
    for (const part of parts) {
      if (part.length <= maxWords) out.push(part.join(' '))
      else {
        const mid = Math.ceil(part.length / 2)
        out.push(part.slice(0, mid).join(' '), part.slice(mid).join(' '))
      }
    }
  }
  // never leave a one-word scrap unless it is its own sentence ("Why?")
  const merged = []
  for (const c of out) {
    const prev = merged[merged.length - 1]
    if (prev && !c.includes(' ') && !/[.!?]["”’]?$/.test(prev)) merged[merged.length - 1] = prev + ' ' + c
    else merged.push(c)
  }
  return merged
}

// Authored pauses: "Why? [0.6]" means hold 0.6s after that sentence. Splits a
// beat's text into sentences, each with the pause that follows it.
const DEFAULT_PAUSE = { '?': 0.45, '!': 0.35, ':': 0.2, '.': 0.3 }
export const stripPauses = (say) => (say || '').replace(/\s*\[\d+(?:\.\d+)?\]/g, '').trim()
export function parseSay(say) {
  const out = []
  for (const part of (say || '').split(/(\[\d+(?:\.\d+)?\])/)) {
    const m = part.match(/^\[(\d+(?:\.\d+)?)\]$/)
    if (m) { if (out.length) Object.assign(out[out.length - 1], { pause: Number(m[1]), authored: true }); continue }
    for (const s of part.match(/[^.!?:]+[.!?:]+["”’]?|[^.!?:]+$/g) || []) {
      const text = s.trim()
      if (!text) continue
      const end = (text.match(/([.!?:])["”’]?$/) || [])[1]
      out.push({ text, pause: DEFAULT_PAUSE[end] ?? 0.3 })
    }
  }
  // no automatic pause after the last sentence (the beat adds its own breath)
  if (out.length && !out[out.length - 1].authored) out[out.length - 1].pause = 0
  return out
}
