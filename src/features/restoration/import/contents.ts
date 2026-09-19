import { positionsOf } from './geometry'
import { stationNoOf } from './stations'
import type { Bbox, CompactFeature, Position } from './types'

/** One row of a layer's contents: where it is and what its popup says. */
export interface ContentItem {
  /** Index of its (first) feature in the layer — stable for as long as the features are. */
  key: number
  t: CompactFeature['t']
  n: string
  d?: string
  g?: string
  /** Station number, for station points only. */
  no?: string
  /** Where the popup opens. */
  at: Position
  /** What to frame; absent for a point. */
  bbox?: Bbox
}

export type ContentKind = 'stations' | 'folder' | 'points' | 'lines' | 'areas'

export interface ContentGroup {
  kind: ContentKind
  /** The sub-folder path, for `folder` groups only. */
  folder?: string
  items: ContentItem[]
}

type RestKind = 'points' | 'lines' | 'areas'
const REST: Record<CompactFeature['t'], RestKind> = { p: 'points', l: 'lines', g: 'areas' }

function bboxOf(positions: Position[]): Bbox {
  let [west, south] = positions[0]
  let [east, north] = positions[0]
  for (const [lng, lat] of positions) {
    west = Math.min(west, lng)
    south = Math.min(south, lat)
    east = Math.max(east, lng)
    north = Math.max(north, lat)
  }
  return [west, south, east, north]
}

const sameText = (a: CompactFeature, b: CompactFeature) => a.n === b.n && a.d === b.d && a.g === b.g

/** Consecutive lines that say the same thing are one drawing cut into segments, and one row. */
export const continuesLine = (first: CompactFeature, next: CompactFeature | undefined): boolean =>
  first.t === 'l' && next?.t === 'l' && sameText(first, next)

function itemOf(features: CompactFeature[], start: number, end: number): ContentItem {
  const feature = features[start]
  const text = { key: start, t: feature.t, n: feature.n, ...(feature.d && { d: feature.d }), ...(feature.g && { g: feature.g }) }
  if (feature.t === 'p') {
    const no = stationNoOf(feature.n)
    return { ...text, ...(no && { no }), at: feature.c }
  }
  const positions = features.slice(start, end).flatMap(positionsOf)
  const bbox = bboxOf(positions)
  // a line is pointed at on the line itself; an area at the middle of its box
  const at: Position = feature.t === 'l' ? feature.c[feature.c.length >> 1] : [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
  return { ...text, at, bbox }
}

/**
 * A layer's contents the way its list shows them: the stations by number, then
 * one group per sub-folder in file order, then whatever sits in the layer's own
 * folder by kind. Empty groups are left out.
 */
export function layerContents(features: CompactFeature[]): ContentGroup[] {
  const stations: ContentItem[] = []
  const folders = new Map<string, ContentItem[]>()
  const rest: Record<RestKind, ContentItem[]> = { points: [], lines: [], areas: [] }

  for (let start = 0; start < features.length; ) {
    let end = start + 1
    while (continuesLine(features[start], features[end])) end += 1
    const item = itemOf(features, start, end)
    if (item.no) stations.push(item)
    else if (item.g) {
      const folder = folders.get(item.g) ?? []
      folder.push(item)
      folders.set(item.g, folder)
    } else rest[REST[item.t]].push(item)
    start = end
  }
  stations.sort((a, b) => (a.no ?? '').localeCompare(b.no ?? '') || a.n.localeCompare(b.n))

  const groups: ContentGroup[] = [
    { kind: 'stations', items: stations },
    ...[...folders].map(([folder, items]): ContentGroup => ({ kind: 'folder', folder, items })),
    { kind: 'points', items: rest.points },
    { kind: 'lines', items: rest.lines },
    { kind: 'areas', items: rest.areas },
  ]
  return groups.filter((group) => group.items.length > 0)
}
