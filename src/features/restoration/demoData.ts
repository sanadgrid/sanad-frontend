import type { Construction, Feeder, Network, Sector, Substation, Switching, Tie } from './types'

// Synthetic demo network for the Central sector. Codes, ratings, loads and ties
// are invented — only the district names and their rough centres are real and
// publicly known. Real utility data never belongs in this public repo: it is
// loaded into Firestore by a signed-in admin (see services/restoration.ts).

const SECTOR_ID = 'central'
const RIYADH = 'مدينة الرياض'
const OASES = 'واحات الرياض'

const sector: Sector = {
  id: SECTOR_ID,
  nameAr: 'القطاع الأوسط',
  nameEn: 'Central Sector',
  center: { lat: 24.7136, lng: 46.6753 },
  zoom: 11,
  areas: [
    { id: 'COA', nameAr: 'منطقة التشغيل الوسطى', departments: [RIYADH, OASES, 'الخرج', 'القصيم', 'حائل', 'الدوادمي'] },
    { id: 'WOA', nameAr: 'منطقة التشغيل الغربية' },
    { id: 'EOA', nameAr: 'منطقة التشغيل الشرقية' },
    { id: 'SOA', nameAr: 'منطقة التشغيل الجنوبية' },
  ],
  visibility: 'public',
  monthlyLoadFactor: [0.52, 0.5, 0.58, 0.72, 0.86, 0.95, 0.99, 1, 0.93, 0.78, 0.6, 0.52],
  monthlyDerating: [1, 1, 0.98, 0.95, 0.92, 0.89, 0.87, 0.87, 0.9, 0.94, 0.98, 1],
  forecastGrowth: 1.05,
}

const UG: Construction = 'underground'
const OH: Construction = 'overhead'

type FeederSpec = [ratingMva: number, peakLoadPct: number, customers: number, construction: Construction]

interface StationSpec {
  /** `NG-…` = 33 kV grid station, `MDN-…` = 13.8 kV distribution station. */
  code: string
  district: string
  areaId: string
  department?: string
  at: [lat: number, lng: number]
  transformersMva: number[]
  feeders: FeederSpec[]
  sensitive?: string[]
  vip?: string[]
  temporarySupplyMva?: number
}

const stationSpecs: StationSpec[] = [
  // ---- EOA
  {
    code: 'NG-101',
    district: 'الرمال',
    areaId: 'EOA',
    at: [24.867, 46.823],
    transformersMva: [60, 60, 60],
    feeders: [
      [25, 46, 2400, UG],
      [25, 48, 2900, UG],
      [25, 45, 2100, OH],
      [25, 50, 3300, UG],
    ],
  },
  {
    code: 'NG-102',
    district: 'قرطبة',
    areaId: 'EOA',
    at: [24.815, 46.735],
    transformersMva: [67, 67, 67],
    feeders: [
      [30, 45, 3600, UG],
      [30, 46, 4100, UG],
      [30, 45, 3800, UG],
      [30, 47, 4400, UG],
      [30, 50, 4700, OH],
    ],
    sensitive: ['مستشفى'],
  },
  {
    code: 'NG-103',
    district: 'النسيم',
    areaId: 'EOA',
    at: [24.735, 46.83],
    transformersMva: [60, 60, 60],
    feeders: [
      [28, 88, 5600, UG],
      [28, 92, 5900, OH],
      [28, 80, 5100, UG],
      [28, 93, 6000, OH],
      [28, 86, 5400, UG],
    ],
    sensitive: ['مستشفى', 'مركز إسعاف'],
    temporarySupplyMva: 10,
  },
  {
    code: 'MDN-211',
    district: 'المونسية',
    areaId: 'EOA',
    at: [24.838, 46.78],
    transformersMva: [40, 40, 40],
    feeders: [
      [10, 45, 2300, UG],
      [10, 45, 2500, UG],
      [10, 46, 2700, OH],
      [10, 45, 2200, UG],
      [10, 45, 2400, OH],
    ],
  },
  {
    code: 'MDN-212',
    district: 'اليرموك',
    areaId: 'EOA',
    at: [24.8, 46.78],
    transformersMva: [50, 50],
    feeders: [
      [9, 94, 5200, UG],
      [9, 91, 4900, UG],
      [9, 95, 5500, OH],
      [10, 90, 5000, UG],
      [9, 93, 5300, UG],
      [10, 92, 5600, OH],
    ],
    sensitive: ['مركز طبي'],
    temporarySupplyMva: 8,
  },
  {
    code: 'MDN-213',
    district: 'إشبيلية',
    areaId: 'EOA',
    at: [24.79, 46.8],
    transformersMva: [40, 40, 40],
    feeders: [
      [9, 45, 1700, UG],
      [9, 46, 1900, UG],
      [9, 45, 1600, UG],
      [9, 46, 1800, UG],
      [9, 45, 1500, UG],
    ],
  },

  // ---- COA
  {
    code: 'NG-104',
    district: 'الملقا',
    areaId: 'COA',
    department: OASES,
    at: [24.81, 46.61],
    transformersMva: [67, 67, 67],
    feeders: [
      [30, 50, 4300, UG],
      [30, 48, 4800, UG],
      [28, 48, 3900, UG],
      [30, 55, 4500, OH],
      [28, 46, 3500, UG],
    ],
    vip: ['مركز بيانات'],
  },
  {
    code: 'NG-105',
    district: 'العليا',
    areaId: 'COA',
    department: RIYADH,
    at: [24.695, 46.685],
    transformersMva: [67, 67, 67],
    feeders: [
      [30, 84, 5800, UG],
      [30, 55, 4400, UG],
      [30, 88, 6000, UG],
      [28, 50, 3700, UG],
      [30, 82, 5600, UG],
      [28, 60, 4200, UG],
    ],
    sensitive: ['مستشفى', 'مركز طبي'],
    vip: ['مركز بيانات', 'مرفق حكومي'],
    temporarySupplyMva: 15,
  },
  {
    code: 'MDN-214',
    district: 'حطين',
    areaId: 'COA',
    department: OASES,
    at: [24.765, 46.6],
    transformersMva: [40, 40, 40],
    feeders: [
      [10, 52, 2300, UG],
      [10, 56, 2700, UG],
      [10, 49, 2000, UG],
      [10, 45, 1900, UG],
      [10, 45, 1800, UG],
    ],
    vip: ['مرفق حكومي'],
  },
  {
    code: 'MDN-215',
    district: 'الصحافة',
    areaId: 'COA',
    department: OASES,
    at: [24.805, 46.64],
    transformersMva: [50, 50],
    feeders: [
      [10, 50, 2900, UG],
      [10, 74, 4300, UG],
      [10, 48, 2700, UG],
      [10, 77, 4600, OH],
      [10, 52, 3100, UG],
    ],
    sensitive: ['مركز إسعاف'],
  },
  {
    code: 'MDN-216',
    district: 'الملز',
    areaId: 'COA',
    department: RIYADH,
    at: [24.665, 46.735],
    transformersMva: [40, 40, 40],
    feeders: [
      [9, 81, 4700, UG],
      [9, 76, 4300, UG],
      [8, 84, 4500, OH],
      [9, 72, 3900, UG],
      [8, 79, 4100, UG],
      [9, 68, 3500, UG],
    ],
    sensitive: ['مستشفى'],
    vip: ['مركز قيادة'],
  },
  {
    code: 'MDN-217',
    district: 'المربع',
    areaId: 'COA',
    department: RIYADH,
    at: [24.65, 46.71],
    transformersMva: [50, 50],
    feeders: [
      [9, 90, 5100, UG],
      [9, 86, 4800, UG],
      [10, 50, 3200, UG],
      [9, 88, 5000, OH],
      [10, 48, 3000, UG],
      [9, 52, 2900, UG],
    ],
    sensitive: ['محطة مياه'],
    vip: ['مرفق حكومي'],
    temporarySupplyMva: 5,
  },

  // ---- WOA
  {
    code: 'NG-107',
    district: 'الدرعية',
    areaId: 'WOA',
    at: [24.735, 46.575],
    transformersMva: [60, 60, 60],
    feeders: [
      [25, 66, 3400, OH],
      [25, 72, 3900, OH],
      [25, 58, 2800, UG],
      [25, 63, 3100, OH],
    ],
    sensitive: ['محطة مياه'],
    temporarySupplyMva: 15,
  },
  {
    code: 'MDN-218',
    district: 'الحي الدبلوماسي',
    areaId: 'WOA',
    at: [24.682, 46.623],
    transformersMva: [40, 40, 40],
    feeders: [
      [9, 45, 1800, UG],
      [9, 46, 1600, UG],
      [9, 45, 2100, UG],
      [9, 46, 1500, UG],
    ],
    vip: ['مرفق حكومي', 'مركز قيادة'],
  },
  {
    code: 'MDN-219',
    district: 'لبن',
    areaId: 'WOA',
    at: [24.635, 46.56],
    transformersMva: [50, 50],
    feeders: [
      [9, 78, 4400, OH],
      [9, 83, 4900, OH],
      [10, 45, 2600, UG],
      [10, 80, 5000, OH],
      [10, 45, 2800, UG],
    ],
    sensitive: ['مركز طبي'],
  },

  // ---- SOA
  {
    code: 'NG-106',
    district: 'العزيزية',
    areaId: 'SOA',
    at: [24.59, 46.77],
    transformersMva: [60, 60, 60],
    feeders: [
      [28, 67, 4600, OH],
      [28, 73, 5100, OH],
      [25, 62, 3800, UG],
      [28, 70, 4900, OH],
      [25, 59, 3300, UG],
    ],
    sensitive: ['محطة مياه'],
  },
  {
    code: 'MDN-220',
    district: 'السويدي',
    areaId: 'SOA',
    at: [24.605, 46.655],
    transformersMva: [40, 40, 40],
    feeders: [
      [10, 52, 3400, UG],
      [10, 50, 3200, UG],
      [9, 71, 4200, OH],
      [10, 77, 5100, UG],
      [9, 66, 3600, UG],
    ],
    sensitive: ['مستشفى'],
  },
  {
    code: 'MDN-221',
    district: 'الشفا',
    areaId: 'SOA',
    at: [24.565, 46.7],
    transformersMva: [40, 40, 40],
    feeders: [
      [10, 46, 2900, OH],
      [10, 45, 2700, UG],
      [10, 48, 3200, OH],
      [10, 47, 3000, UG],
      [9, 62, 3700, OH],
    ],
  },
  {
    code: 'MDN-222',
    district: 'عريض',
    areaId: 'SOA',
    at: [24.555, 46.6],
    transformersMva: [50, 50],
    feeders: [
      [9, 46, 2600, OH],
      [9, 48, 3000, OH],
      [8, 50, 2200, OH],
      [9, 45, 2400, OH],
    ],
    temporarySupplyMva: 6,
  },
]

type TieSpec = [from: string, to: string, circuits: 1 | 2, switching: Switching, construction: Construction]

const R: Switching = 'remote'
const M: Switching = 'manual'

// `STATION/F<n>` on both ends; always between neighbouring stations of the same voltage
const tieSpecs: TieSpec[] = [
  // 33 kV
  ['NG-101/F4', 'NG-102/F1', 2, R, UG],
  ['NG-101/F2', 'NG-102/F2', 1, R, UG],
  ['NG-101/F1', 'NG-102/F4', 1, R, UG],
  ['NG-101/F3', 'NG-102/F3', 1, M, OH],
  ['NG-102/F5', 'NG-104/F5', 1, R, UG],
  ['NG-102/F3', 'NG-104/F3', 1, M, UG],
  ['NG-102/F1', 'NG-104/F4', 1, M, OH],
  ['NG-102/F4', 'NG-104/F1', 1, R, UG],
  ['NG-104/F1', 'NG-105/F4', 2, R, UG],
  ['NG-104/F2', 'NG-105/F2', 1, M, UG],
  ['NG-103/F1', 'NG-105/F6', 1, R, UG],
  ['NG-103/F5', 'NG-106/F5', 1, M, OH],
  ['NG-105/F1', 'NG-106/F1', 1, R, UG],
  ['NG-105/F5', 'NG-106/F4', 1, M, OH],
  ['NG-105/F2', 'NG-106/F3', 1, M, UG],
  // 13.8 kV — north-east
  ['MDN-213/F1', 'MDN-211/F1', 1, R, UG],
  ['MDN-213/F2', 'MDN-211/F2', 1, R, UG],
  ['MDN-213/F3', 'MDN-211/F3', 2, R, UG],
  ['MDN-213/F4', 'MDN-211/F4', 1, M, UG],
  ['MDN-213/F5', 'MDN-211/F5', 1, M, OH],
  ['MDN-212/F1', 'MDN-211/F1', 1, M, OH],
  ['MDN-212/F4', 'MDN-211/F4', 1, M, UG],
  ['MDN-212/F2', 'MDN-213/F3', 1, R, UG],
  ['MDN-212/F5', 'MDN-213/F4', 1, M, UG],
  // 13.8 kV — north
  ['MDN-214/F1', 'MDN-215/F1', 1, R, UG],
  ['MDN-214/F2', 'MDN-215/F3', 1, R, UG],
  ['MDN-214/F3', 'MDN-215/F5', 1, M, UG],
  ['MDN-214/F4', 'MDN-218/F1', 2, R, UG],
  ['MDN-214/F5', 'MDN-218/F2', 1, M, UG],
  // 13.8 kV — centre and west
  ['MDN-216/F1', 'MDN-217/F3', 1, R, UG],
  ['MDN-216/F2', 'MDN-217/F5', 1, M, UG],
  ['MDN-216/F4', 'MDN-217/F6', 1, R, UG],
  ['MDN-217/F3', 'MDN-218/F3', 2, R, UG],
  ['MDN-217/F5', 'MDN-220/F5', 1, M, UG],
  ['MDN-218/F4', 'MDN-219/F3', 1, R, UG],
  ['MDN-218/F3', 'MDN-219/F5', 1, M, UG],
  ['MDN-219/F1', 'MDN-220/F3', 1, M, OH],
  ['MDN-219/F4', 'MDN-222/F3', 1, M, OH],
  // 13.8 kV — south
  ['MDN-220/F1', 'MDN-221/F5', 1, R, UG],
  ['MDN-220/F2', 'MDN-221/F4', 2, R, UG],
  ['MDN-220/F4', 'MDN-221/F1', 1, M, OH],
  ['MDN-221/F1', 'MDN-222/F1', 1, M, OH],
  ['MDN-221/F3', 'MDN-222/F2', 1, M, OH],
  ['MDN-221/F2', 'MDN-222/F4', 1, R, OH],
]

const slug = (code: string) => `${SECTOR_ID}-${code.toLowerCase()}`
const voltageOf = (code: string) => (code.startsWith('NG') ? 33 : 13.8)

const substations: Substation[] = stationSpecs.map((s) => ({
  id: slug(s.code),
  sectorId: SECTOR_ID,
  areaId: s.areaId,
  department: s.department ?? null,
  code: s.code,
  district: s.district,
  type: s.code.startsWith('NG') ? 'NG' : 'MDN',
  voltageKv: voltageOf(s.code),
  location: { lat: s.at[0], lng: s.at[1] },
  transformersMva: s.transformersMva,
  sensitiveCustomers: s.sensitive ?? [],
  vipCustomers: s.vip ?? [],
  temporarySupplyMva: s.temporarySupplyMva ?? 0,
  visibility: 'public',
}))

const feeders: Feeder[] = stationSpecs.flatMap((s) =>
  s.feeders.map(([ratingMva, peakLoadPct, customers, construction], i) => ({
    id: `${slug(s.code)}-f${i + 1}`,
    sectorId: SECTOR_ID,
    stationId: slug(s.code),
    code: `F${i + 1}`,
    construction,
    ratingMva,
    peakLoadMva: Math.round(ratingMva * peakLoadPct) / 100,
    customers,
    visibility: 'public',
  })),
)

const feederById = new Map(feeders.map((f) => [f.id, f]))

function feederAt(ref: string): Feeder {
  const [station, feeder] = ref.split('/')
  const found = feederById.get(`${slug(station)}-${feeder.toLowerCase()}`)
  if (!found) throw new Error(`demo data: unknown feeder ${ref}`)
  return found
}

const ties: Tie[] = tieSpecs.map(([fromRef, toRef, circuits, switching, construction], i) => {
  const from = feederAt(fromRef)
  const to = feederAt(toRef)
  // a tie is a cable between two feeders of one voltage level — never 13.8 ↔ 33 kV
  if (voltageOf(fromRef) !== voltageOf(toRef)) throw new Error(`demo data: ${fromRef} ↔ ${toRef} mixes voltages`)
  const single = Math.min(from.ratingMva, to.ratingMva)
  return {
    id: `${SECTOR_ID}-tie-${String(i + 1).padStart(3, '0')}`,
    sectorId: SECTOR_ID,
    fromFeederId: from.id,
    toFeederId: to.id,
    construction,
    circuits,
    capacityMva: circuits === 2 ? Math.round(single * 1.6) : single,
    switching,
    visibility: 'public',
  }
})

export const demoNetwork: Network = { sector, substations, feeders, ties }
