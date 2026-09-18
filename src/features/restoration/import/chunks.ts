import type { CompactFeature } from './types'

// A stored document may not exceed 1 MiB, and the limit counts UTF-8 bytes, not
// characters — Arabic names take two bytes a letter. Stay well clear of it.
export const MAX_CHUNK_BYTES = 680_000

const encoder = new TextEncoder()
export const byteLength = (text: string) => encoder.encode(text).length

/** A feature too large for one chunk: a line is cut in two, a polygon loses every other vertex. */
function fit(feature: CompactFeature, maxBytes: number): CompactFeature[] {
  if (byteLength(JSON.stringify(feature)) <= maxBytes) return [feature]
  if (feature.t === 'l' && feature.c.length > 2) {
    const middle = feature.c.length >> 1
    // both halves keep the middle vertex, so the line stays connected
    return [
      ...fit({ ...feature, c: feature.c.slice(0, middle + 1) }, maxBytes),
      ...fit({ ...feature, c: feature.c.slice(middle) }, maxBytes),
    ]
  }
  if (feature.t === 'g' && feature.c.some((ring) => ring.length > 8)) {
    const thinned = feature.c.map((ring) => ring.filter((_, i) => i % 2 === 0 || i === ring.length - 1))
    return fit({ ...feature, c: thinned }, maxBytes)
  }
  return []
}

/** JSON arrays of features, each below `maxBytes` once encoded as UTF-8. */
export function chunkFeatures(features: CompactFeature[], maxBytes = MAX_CHUNK_BYTES): string[] {
  const chunks: string[] = []
  let items: string[] = []
  let bytes = 2 // the brackets
  for (const json of features.flatMap((f) => fit(f, maxBytes - 2)).map((f) => JSON.stringify(f))) {
    const size = byteLength(json) + 1 // and its comma
    if (items.length > 0 && bytes + size > maxBytes) {
      chunks.push(`[${items.join(',')}]`)
      items = []
      bytes = 2
    }
    items.push(json)
    bytes += size
  }
  if (items.length > 0) chunks.push(`[${items.join(',')}]`)
  return chunks
}
