import aspects from './pieces.json'

// Layout presets. Each returns where the pieces of a beat sit on the stage
// (the area between the masthead and the caption strip). Sizes are capped by
// height so tall cut-outs (a phone, a chair) never run into the strip.
const fit = (name, w, maxH) => {
  const a = aspects[name] || 1
  const width = Math.min(w, maxH / a)
  return { w: width, h: width * a }
}
const place = (name, cx, cy, w, maxH, rotate, enter) => {
  const s = fit(name, w, maxH)
  return { name, x: cx - s.w / 2, y: cy - s.h / 2, w: s.w, h: s.h, rotate, enter }
}

export const LAYOUTS = {
  // headline up top, three pieces underneath
  hook: (p) => [
    p[0] && place(p[0], 300, 900, 620, 520, -3, 'left'),
    p[1] && place(p[1], 800, 880, 380, 520, 5, 'right'),
    p[2] && place(p[2], 850, 1660, 340, 340, -8, 'bottom'),
  ].filter(Boolean),
  // one piece held high, leaving room for a stack of keyword slabs under it
  top: (p) => [place(p[0], 540, 560, 640, 400, -4, 'left')],
  solo: (p) => [place(p[0], 540, 650, 700, 600, -4, 'left')],
  duo: (p) => [place(p[0], 330, 540, 520, 440, -6, 'left'), place(p[1], 740, 800, 500, 430, 5, 'right')],
  versus: (p) => [place(p[0], 290, 650, 420, 560, -4, 'left'), place(p[1], 790, 650, 420, 560, 4, 'right')],
  payoff: (p) => [
    p[0] && place(p[0], 300, 980, 460, 330, -5, 'left'),
    p[1] && place(p[1], 790, 990, 400, 330, 6, 'right'),
  ].filter(Boolean),
}

// Rough speaking pace until real voice durations are passed in.
export const estimateFrames = (say, fps = 30) => Math.round((say.split(/\s+/).length / 2.7) * fps) + 12
