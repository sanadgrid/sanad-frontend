import { DEFAULT_RATING_A } from './backup/model'
import type { LatLng } from './types'

// What the dashboard needs to know about a sector before anything is read: its
// name, where the map opens, how much the summer heat takes off a rating, and the
// rating a plan is held to. Built in, so the page stands without a `sectors`
// document; a name found in the database replaces the one written here.

export interface SectorInfo {
  id: string
  nameAr: string
  nameEn: string
  center: LatLng
  zoom: number
  /** Thermal derating of cables and lines for ambient temperature, Jan → Dec. */
  monthlyDerating: readonly number[]
  /** The breaker rating used until the sector's plans name their own. */
  ratingA: number
}

export type SectorSummary = Pick<SectorInfo, 'id' | 'nameAr' | 'nameEn'>

const MONTHLY_DERATING = [1, 1, 0.98, 0.95, 0.92, 0.89, 0.87, 0.87, 0.9, 0.94, 0.98, 1]
const CITY_CENTRE: LatLng = { lat: 24.7136, lng: 46.6753 }

const BUILT_IN: SectorInfo[] = [
  {
    id: 'central',
    nameAr: 'القطاع الأوسط',
    nameEn: 'Central Sector',
    center: CITY_CENTRE,
    zoom: 11,
    monthlyDerating: MONTHLY_DERATING,
    ratingA: DEFAULT_RATING_A,
  },
]

export const DEFAULT_SECTOR_ID = BUILT_IN[0].id
/** August: loads at their highest and ratings at their lowest — the month a plan has to hold in. */
export const DESIGN_MONTH = 7

export const builtInSectors = (): SectorSummary[] => BUILT_IN.map(({ id, nameAr, nameEn }) => ({ id, nameAr, nameEn }))

/** A sector nobody has described yet still opens: under its id, with the defaults of the first. */
export function sectorInfo(id: string, known?: Partial<SectorSummary>): SectorInfo {
  const builtIn = BUILT_IN.find((sector) => sector.id === id) ?? { ...BUILT_IN[0], id, nameAr: id, nameEn: id }
  return { ...builtIn, nameAr: known?.nameAr || builtIn.nameAr, nameEn: known?.nameEn || builtIn.nameEn }
}

/** The built-in sectors first, then whatever else the database lists; a name from the database wins. */
export function mergeSectors(listed: SectorSummary[]): SectorSummary[] {
  const byId = new Map(builtInSectors().map((sector) => [sector.id, sector]))
  for (const sector of listed) {
    const { id, nameAr, nameEn } = sectorInfo(sector.id, sector)
    byId.set(id, { id, nameAr, nameEn })
  }
  return [...byId.values()]
}

export const deratingOf = (sector: SectorInfo, month: number) => sector.monthlyDerating[month] ?? 1
