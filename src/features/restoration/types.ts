// Data model for the restoration-capacity module. These interfaces mirror the
// Firestore documents one-to-one (see docs/data-model.md in the backend repo).
// Every document carries `sectorId`, so a new sector (Western, Eastern, …) is
// just more documents — no schema change.

export type Visibility = 'public' | 'restricted'
export type StationType = 'NG' | 'MDN'
export type Construction = 'underground' | 'overhead'
export type Switching = 'remote' | 'manual'

export interface LatLng {
  lat: number
  lng: number
}

export interface Area {
  /** Operating area code, e.g. COA / WOA / EOA / SOA. */
  id: string
  nameAr: string
  /** Optional finer split, e.g. the departments of COA. */
  departments?: string[]
}

/** `sectors/{id}` — one per distribution sector (Central, Western, …). */
export interface Sector {
  id: string
  nameAr: string
  nameEn: string
  center: LatLng
  zoom: number
  areas: Area[]
  visibility: Visibility
  /** Load in each month as a fraction of the annual peak, Jan → Dec. */
  monthlyLoadFactor: number[]
  /** Thermal derating of cables and lines for ambient temperature, Jan → Dec. */
  monthlyDerating: number[]
  /** Growth applied to the annual peak for the "forecast peak" period. */
  forecastGrowth: number
}

/** `substations/{id}` */
export interface Substation {
  id: string
  sectorId: string
  areaId: string
  department: string | null
  code: string
  district: string
  type: StationType
  voltageKv: number
  location: LatLng
  /** Installed transformer ratings; firm capacity = total − largest unit. */
  transformersMva: number[]
  sensitiveCustomers: string[]
  vipCustomers: string[]
  /** Mobile generation / mobile substation that can be deployed here (0 = none). */
  temporarySupplyMva: number
  visibility: Visibility
}

/** `feeders/{id}` — outgoing feeders of a substation. */
export interface Feeder {
  id: string
  sectorId: string
  stationId: string
  code: string
  construction: Construction
  /** Continuous thermal rating at reference ambient. */
  ratingMva: number
  /** Feeder load at the sector's annual peak. */
  peakLoadMva: number
  customers: number
  visibility: Visibility
}

/** `ties/{id}` — a normally-open tie between two feeders of different stations. */
export interface Tie {
  id: string
  sectorId: string
  fromFeederId: string
  toFeederId: string
  construction: Construction
  circuits: 1 | 2
  /** Combined rating of all circuits at reference ambient. */
  capacityMva: number
  switching: Switching
  visibility: Visibility
}

export interface Network {
  sector: Sector
  substations: Substation[]
  feeders: Feeder[]
  ties: Tie[]
}

/** 0–11 = month of the year, `forecast` = next year's annual peak. */
export type Period = number | 'forecast'
export type Scenario = 'normal' | 'peak'

export interface Conditions {
  period: Period
  scenario: Scenario
}
