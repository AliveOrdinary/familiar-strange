// Turns a cut-out generated on a flat green ground into a transparent PNG.
import sharp from 'sharp'

export async function keyGreen(input, { maxSide = 1000 } = {}) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const LO = 24 // green dominance where transparency starts
  const HI = 80 // ...and where the pixel is fully gone
  let cleared = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const m = Math.max(r, b)
    const d = g - m
    if (d > LO) {
      const a = d >= HI ? 0 : 1 - (d - LO) / (HI - LO)
      data[i + 3] = Math.round(a * 255)
      if (a === 0) cleared++
    }
    if (g > m) data[i + 1] = m // remove green spill from the paper edge
  }
  const share = cleared / (data.length / 4)
  if (share < 0.15) throw new Error('The image has no green ground to remove (the model ignored the green-screen instruction)')
  if (share > 0.97) throw new Error('The image is almost entirely green: no subject found')
  const keyed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
  const out = await sharp(keyed).trim({ threshold: 1 }).resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
  return { png: out.data, width: out.info.width, height: out.info.height, aspect: +(out.info.height / out.info.width).toFixed(3) }
}
