// One palette per theme. The cut-outs are always black-and-white halftone, so
// colour lives entirely here: changing a reel's palette never needs new images.
// ground = the big sheet, accent = loose shapes, paper = torn strip + labels.
export const PALETTES = {
  tomato: { ground: '#D9392B', accent: '#2A52D0', paper: '#EFE6CF', ink: '#141210' },
  forest: { ground: '#1F5D46', accent: '#E8B23A', paper: '#EFE6CF', ink: '#141210' },
  cobalt: { ground: '#2447C8', accent: '#F2643D', paper: '#EFE6CF', ink: '#141210' },
  mustard: { ground: '#E3A72F', accent: '#2A52D0', paper: '#F3ECD9', ink: '#141210' },
  plum: { ground: '#5B2A4E', accent: '#F0705A', paper: '#EFE6CF', ink: '#141210' },
}
