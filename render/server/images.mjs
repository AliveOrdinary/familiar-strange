// Archival images are downloaded once and served locally to the renderer, so
// a slow or flaky museum CDN can never fail a render halfway through, and
// re-renders don't re-download.
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

// Wikimedia (and most museum APIs) reject requests without a descriptive UA.
const UA = 'familiar-strange-render/1.0 (personal educational project)'
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export async function cacheImage(url, dir) {
  if (!url) return null
  mkdirSync(dir, { recursive: true })
  const key = createHash('sha1').update(url).digest('hex').slice(0, 16)
  for (const ext of Object.values(TYPES)) {
    if (existsSync(join(dir, `${key}.${ext}`))) return `${key}.${ext}`
  }
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Image ${res.status} for ${url}`)
  const type = (res.headers.get('content-type') || '').split(';')[0].trim()
  const ext = TYPES[type]
  if (!ext) throw new Error(`Not an image (${type || 'unknown type'}): ${url}`)
  const file = `${key}.${ext}`
  writeFileSync(join(dir, file), Buffer.from(await res.arrayBuffer()))
  return file
}
