import type { Network, Visibility } from '../features/restoration/types'

// A sector is published as one JSON text, so opening the page reads a document
// or two instead of one per station, feeder and tie. No Firebase in here.

// A stored document may not exceed 1 MiB, counted in UTF-8 bytes. Stay well clear of it.
export const MAX_PART_BYTES = 680_000

/** The fields of a `networkBundles` document the reader relies on. */
export interface BundlePart {
  index: number
  /** How many parts the bundle has. */
  count: number
  /** When the bundle was published, ms since the epoch — the same in all its parts. */
  version: number
  payload: string
}

export const bundlePartId = (sectorId: string, visibility: Visibility, index: number) => `${sectorId}_${visibility}_${index}`

const utf8Bytes = (codePoint: number) => (codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4)

/** The network as JSON text, cut into pieces below `maxBytes` of UTF-8 each. Never cuts through a character. */
export function splitBundle(network: Network, maxBytes = MAX_PART_BYTES): string[] {
  const { sector, substations, feeders, ties } = network
  const json = JSON.stringify({ sector, substations, feeders, ties })
  const parts: string[] = []
  let start = 0
  let bytes = 0
  for (let i = 0; i < json.length; ) {
    const codePoint = json.codePointAt(i) ?? 0
    const size = utf8Bytes(codePoint)
    if (bytes + size > maxBytes) {
      parts.push(json.slice(start, i))
      start = i
      bytes = 0
    }
    bytes += size
    // a character outside the basic plane takes two places in the string
    i += codePoint > 0xffff ? 2 : 1
  }
  parts.push(json.slice(start))
  return parts
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function isNetwork(value: unknown): value is Network {
  return (
    isRecord(value) &&
    isRecord(value.sector) &&
    typeof value.sector.id === 'string' &&
    isRecord(value.sector.center) &&
    Array.isArray(value.substations) &&
    Array.isArray(value.feeders) &&
    Array.isArray(value.ties)
  )
}

/**
 * Puts the parts of one bundle back together. Throws when they do not belong
 * together — a reader that arrives in the middle of a publish sees parts of two
 * versions — or when the text is not a network.
 */
export function joinBundle(parts: BundlePart[]): { network: Network; version: number } {
  const ordered = [...parts].sort((a, b) => a.index - b.index)
  const head = ordered[0]
  const complete =
    head !== undefined &&
    ordered.length === head.count &&
    ordered.every((part, i) => part.index === i && part.version === head.version && part.count === head.count)
  if (!complete) throw new Error('network bundle: the parts do not form one version')
  const network: unknown = JSON.parse(ordered.map((part) => part.payload).join(''))
  if (!isNetwork(network)) throw new Error('network bundle: the payload is not a network')
  return { network, version: head.version }
}

function mergeById<T extends { id: string }>(base: T[], over: T[]): T[] {
  const winners = new Map(over.map((item) => [item.id, item]))
  const seen = new Set(base.map((item) => item.id))
  return [...base.map((item) => winners.get(item.id) ?? item), ...over.filter((item) => !seen.has(item.id))]
}

/** What a member sees: the public network plus the restricted one, which wins wherever both know an id. */
export function mergeNetworks(open: Network | null, restricted: Network | null): Network | null {
  if (!open || !restricted) return restricted ?? open
  return {
    sector: restricted.sector,
    substations: mergeById(open.substations, restricted.substations),
    feeders: mergeById(open.feeders, restricted.feeders),
    ties: mergeById(open.ties, restricted.ties),
  }
}

/**
 * The bundles a network is published as, one per visibility. A public sector
 * keeps its restricted documents apart, so a visitor's bundle never carries
 * them; a restricted sector is restricted as a whole, whatever its documents say.
 */
export function partitionByVisibility(network: Network): Partial<Record<Visibility, Network>> {
  if (network.sector.visibility !== 'public') return { restricted: network }
  const only = (visibility: Visibility): Network => ({
    sector: network.sector,
    substations: network.substations.filter((s) => s.visibility === visibility),
    feeders: network.feeders.filter((f) => f.visibility === visibility),
    ties: network.ties.filter((t) => t.visibility === visibility),
  })
  const restricted = only('restricted')
  const hasRestricted = restricted.substations.length + restricted.feeders.length + restricted.ties.length > 0
  return { public: only('public'), ...(hasRestricted ? { restricted } : {}) }
}
