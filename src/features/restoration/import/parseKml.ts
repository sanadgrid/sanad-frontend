import { plainText } from './describe'
import { childrenOf, firstChild, localNameOf, textOf } from './dom'
import { positionsOf, shapesOf, toFeature, type Shape } from './geometry'
import { isDefaultTour } from './preselect'
import { ImportError, type Bbox, type LayerCounts, type ParsedFile, type ParsedLayer, type XmlParser } from './types'
import { parseXml } from './xml'

const UNNAMED_LAYER = 'طبقة بدون اسم'
const PATH_SEPARATOR = ' / '
const COUNT_KEY = { p: 'point', l: 'line', g: 'polygon' } as const

interface RawPlacemark {
  name: string
  description: string
  /** Sub-folders between the layer's folder and the placemark. */
  sub: string
  shapes: Shape[]
}

const isContainer = (element: Element) => ['Document', 'Folder'].includes(localNameOf(element))
const labelOf = (element: Element) => textOf(firstChild(element, 'name'))

function readPlacemark(placemark: Element, sub: string): RawPlacemark {
  return {
    name: labelOf(placemark),
    description: plainText(textOf(firstChild(placemark, 'description'))),
    sub,
    shapes: childrenOf(placemark).flatMap(shapesOf),
  }
}

/** Every placemark under a folder, however deeply nested. */
function collect(container: Element, sub: string[], found: RawPlacemark[]) {
  for (const child of childrenOf(container)) {
    if (localNameOf(child) === 'Placemark') found.push(readPlacemark(child, sub.join(PATH_SEPARATOR)))
    else if (isContainer(child)) collect(child, [...sub, labelOf(child)].filter(Boolean), found)
  }
}

function buildLayer(name: string, path: string, placemarks: RawPlacemark[]): ParsedLayer {
  const uses = new Map<string, number>()
  for (const p of placemarks) uses.set(p.name, (uses.get(p.name) ?? 0) + 1)

  const counts: LayerCounts = { point: 0, line: 0, polygon: 0 }
  let bbox: Bbox | null = null
  const features = placemarks.flatMap((p) => {
    // the sub-folder is only spelled out where the name alone would be ambiguous
    const shared = (uses.get(p.name) ?? 0) > 1 || !p.name
    const name = shared && p.sub ? [p.sub, p.name].filter(Boolean).join(PATH_SEPARATOR) : p.name
    return p.shapes.map((shape) => {
      counts[COUNT_KEY[shape.t]] += 1
      for (const [lng, lat] of positionsOf(shape))
        bbox = bbox
          ? [Math.min(bbox[0], lng), Math.min(bbox[1], lat), Math.max(bbox[2], lng), Math.max(bbox[3], lat)]
          : [lng, lat, lng, lat]
      return toFeature(shape, name, p.description)
    })
  })
  return { name, path, placemarks: placemarks.length, counts, bbox, features }
}

/** Folders may share a name; the layer's path has to stay unique. */
function uniqueNames() {
  const taken = new Set<string>()
  return (wanted: string) => {
    let name = wanted
    for (let n = 2; taken.has(name); n += 1) name = `${wanted} (${n})`
    taken.add(name)
    return name
  }
}

/**
 * One layer per folder. Google Earth wraps everything in a chain of single
 * folders (Document › My Places › My Places › …); the layers are the folders
 * under the deepest link of that chain, and whatever they nest belongs to them.
 * The bundled demo tour sits beside that chain: it is stepped over, not lost.
 */
export function parseKml(text: string, parser: XmlParser = new DOMParser()): ParsedFile {
  let root: Element = parseXml(text, parser).documentElement
  const trail: string[] = []
  const folders: { folder: Element; above: string[] }[] = []
  for (;;) {
    const inner = childrenOf(root).filter(isContainer)
    const main = inner.filter((folder) => !isDefaultTour(labelOf(folder)))
    if (main.length !== 1 || childrenOf(root, 'Placemark').length > 0) {
      folders.unshift(...inner.map((folder) => ({ folder, above: [...trail] })))
      break
    }
    for (const folder of inner) if (folder !== main[0]) folders.push({ folder, above: [...trail] })
    root = main[0]
    if (labelOf(root)) trail.push(labelOf(root))
  }

  const unique = uniqueNames()
  let skipped = 0
  const layerOf = (name: string, path: string, placemarks: RawPlacemark[]) => {
    skipped += placemarks.filter((p) => p.shapes.length === 0).length
    return buildLayer(name, path, placemarks)
  }

  const layers = folders.map(({ folder, above }) => {
    const placemarks: RawPlacemark[] = []
    collect(folder, [], placemarks)
    const name = unique(labelOf(folder) || UNNAMED_LAYER)
    return layerOf(name, [...above, name].join(PATH_SEPARATOR), placemarks)
  })

  // placemarks that sit beside the folders, or a file with no folders at all
  const loose = childrenOf(root, 'Placemark').map((placemark) => readPlacemark(placemark, ''))
  if (loose.length > 0) {
    const name = unique(trail.at(-1) ?? UNNAMED_LAYER)
    layers.unshift(layerOf(name, trail.join(PATH_SEPARATOR) || name, loose))
  }

  if (layers.every((layer) => layer.features.length === 0)) throw new ImportError('empty')
  return { layers, placemarks: layers.reduce((sum, layer) => sum + layer.placemarks, 0), skipped }
}
