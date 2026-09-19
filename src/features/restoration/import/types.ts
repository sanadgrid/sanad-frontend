// What the importer produces. `CompactFeature` is also the shape stored in the
// database (as JSON text), so its keys are short on purpose.

export type Position = [lng: number, lat: number]

interface FeatureText {
  n: string
  d?: string
  /** Sub-folders between the layer's folder and the placemark: "11kV / Phase 2". Absent in older imports. */
  g?: string
}

export type CompactFeature =
  | ({ t: 'p'; c: Position } & FeatureText)
  | ({ t: 'l'; c: Position[] } & FeatureText)
  /** Rings, outer first. */
  | ({ t: 'g'; c: Position[][] } & FeatureText)

export type Bbox = [west: number, south: number, east: number, north: number]

export interface LayerCounts {
  point: number
  line: number
  polygon: number
}

export interface ParsedLayer {
  name: string
  /** Folder path in the source file, unique within it. */
  path: string
  /** Placemarks found in the folder; one placemark can yield several features. */
  placemarks: number
  counts: LayerCounts
  /** `null` when the folder holds nothing that can be drawn. */
  bbox: Bbox | null
  features: CompactFeature[]
}

export interface ParsedFile {
  layers: ParsedLayer[]
  placemarks: number
  /** Placemarks without a geometry the map can draw (3D models, empty shapes). */
  skipped: number
}

/** The browser's `DOMParser` fits; a test can pass any other implementation. */
export interface XmlParser {
  parseFromString(text: string, type: 'application/xml'): Document
}

export type ImportFailure = 'unsupported' | 'unreadable' | 'empty'

export class ImportError extends Error {
  reason: ImportFailure

  constructor(reason: ImportFailure, cause?: unknown) {
    super(`map layer import: ${reason}`, { cause })
    this.reason = reason
  }
}

export const featureCount = (counts: LayerCounts) => counts.point + counts.line + counts.polygon
