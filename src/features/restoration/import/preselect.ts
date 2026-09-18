import type { LatLng } from '../types'
import type { ParsedLayer } from './types'

// A sector spans a few degrees at most; anything farther than this from its
// centre belongs to another region (or another continent).
const REGION_DEGREES = 8
// the demo tour every copy of Google Earth ships inside "My Places"
const DEFAULT_TOUR = 'sightseeing tour'

export const isDefaultTour = (name: string) => name.trim().toLowerCase().startsWith(DEFAULT_TOUR)

export interface Preselection {
  selected: boolean
  /** Whether the layer can be imported at all. */
  importable: boolean
  /** Shown next to a layer that starts unticked. */
  note?: string
}

export function preselect(layer: ParsedLayer, center: LatLng): Preselection {
  if (!layer.bbox) return { selected: false, importable: false, note: 'لا تحتوي عناصر يمكن عرضها على الخريطة' }
  if (isDefaultTour(layer.name))
    return { selected: false, importable: true, note: 'جولة Google Earth الافتراضية' }

  const [west, south, east, north] = layer.bbox
  const outside =
    east < center.lng - REGION_DEGREES ||
    west > center.lng + REGION_DEGREES ||
    north < center.lat - REGION_DEGREES ||
    south > center.lat + REGION_DEGREES
  if (outside) return { selected: false, importable: true, note: 'تقع خارج نطاق القطاع' }
  return { selected: true, importable: true }
}
