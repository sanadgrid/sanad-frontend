import { describe, expect, it } from 'vitest'
import { assessCase, loadingLevel, summarize, type BackupCase } from './model'
import { ampsToMva, mvaToAmps } from './units'

// The team's worked example: 30 feeders in three sectors, two backups each, all
// figures synthetic. (sector, main load, first backup, second backup) in amperes.
const SHEET: Record<string, [c: number, a1: number, a2: number][]> = {
  A: [
    [300, 220, 270], [280, 245, 260], [260, 250, 245], [310, 230, 275], [290, 260, 255],
    [275, 240, 280], [320, 270, 250], [265, 235, 270], [305, 255, 265], [285, 250, 260],
  ],
  B: [
    [295, 265, 255], [315, 245, 275], [270, 255, 265], [300, 270, 250], [280, 250, 280],
    [325, 275, 260], [260, 240, 275], [310, 260, 245], [290, 280, 255], [275, 250, 285],
  ],
  C: [
    [305, 260, 275], [285, 270, 250], [315, 255, 280], [265, 245, 265], [300, 275, 255],
    [290, 250, 285], [320, 285, 250], [275, 260, 270], [310, 270, 245], [280, 255, 280],
  ],
}

const sectorOf = new Map<string, string>()
const cases: BackupCase[] = Object.entries(SHEET).flatMap(([sector, rows]) =>
  rows.map(([c, a1, a2]) => {
    const id = `F${String(sectorOf.size + 1).padStart(2, '0')}`
    sectorOf.set(id, sector)
    return {
      id,
      level: 'feeder' as const,
      voltageKv: 13.8,
      main: { no: id, loadA: c },
      backups: [
        { no: `${id}-B1`, loadA: a1 },
        { no: `${id}-B2`, loadA: a2 },
      ],
    }
  }),
)
const bySector = (c: BackupCase) => sectorOf.get(c.id) ?? ''

/** The sheet's own formulas, cell for cell, for up to three backups. */
function sheetRow(R: number, C: number, a: (number | null)[]) {
  const [G, H, I] = [0, 1, 2].map((i) => (a[i] == null ? 0 : Math.max(0, R - (a[i] as number))))
  const J = G + H + I
  const K = Math.min(C, J)
  const L = Math.max(0, C - K)
  const M = C === 0 ? 1 : K / C
  const O = J === 0 ? 0 : Math.min(G, (C * G) / J)
  const P = H + I === 0 ? 0 : Math.min(H, (Math.max(0, C - O) * H) / (H + I))
  const Q = Math.min(I, Math.max(0, C - O - P))
  return { J, K, L, M, transfers: [O, P, Q] }
}

describe('calibration against the worked example', () => {
  it.each([
    [400, 525, 0.94, { full: 9, high: 21, limited: 0, none: 0 }],
    [348, 3475, 0.603, { full: 0, high: 3, limited: 27, none: 0 }],
    [320, 5155, 0.411, { full: 0, high: 0, limited: 30, none: 0 }],
  ])('rating %i A → %i A unrestorable', (ratingA, unrestorableA, ratio, byStatus) => {
    const { total, groups } = summarize(cases, bySector, { ratingA })
    expect(total.count).toBe(30)
    expect(total.loadA).toBe(8755)
    expect(total.unrestorableA).toBe(unrestorableA)
    expect(total.restorableA).toBe(8755 - unrestorableA)
    expect(total.ratio).toBeCloseTo(ratio, 3)
    expect(total.byStatus).toEqual(byStatus)
    expect(groups.map((g) => [g.key, g.count])).toEqual([['A', 10], ['B', 10], ['C', 10]])
    expect(groups.reduce((sum, g) => sum + g.unrestorableA, 0)).toBe(unrestorableA)
  })

  it('sums each sector like the summary block', () => {
    const { groups, total } = summarize(cases, bySector)
    expect(groups.map((g) => g.loadA)).toEqual([2890, 2920, 2945])
    expect(groups.map((g) => g.spareA)).toEqual([2915, 2765, 2720])
    expect(groups.map((g) => g.unrestorableA)).toEqual([85, 190, 250])
    expect(groups.map((g) => g.status)).toEqual(['high', 'high', 'high'])
    expect(total.spareA).toBe(groups.reduce((sum, g) => sum + g.spareA, 0))
    expect(total.status).toBe('high')
  })

  it('row 1: fully restorable, shared in proportion to the spare', () => {
    const r = assessCase(cases[0])
    expect(r).toMatchObject({ totalSpareA: 310, restorableA: 300, unrestorableA: 0, ratio: 1, status: 'full' })
    // 300 × 180 / 310, then the remaining 125.81 of the 130 spare
    expect(r.transfers[0].transferA).toBeCloseTo(174.1935, 4)
    expect(r.transfers[1].transferA).toBeCloseTo(125.8065, 4)
    expect(r.transfers[0].finalLoadA).toBeCloseTo(394.1935, 4)
    expect(r.transfers[1].finalLoadA).toBeCloseTo(395.8065, 4)
    expect(r.transfers[0].finalLoadingPct).toBeCloseTo(98.548, 3)
  })

  it('row 4: 15 A short, both backups filled to the rating', () => {
    const r = assessCase(cases[3])
    expect(r).toMatchObject({ totalSpareA: 295, restorableA: 295, unrestorableA: 15, status: 'high' })
    expect(r.ratio).toBeCloseTo(295 / 310, 12)
    expect(r.transfers.map((t) => t.transferA)).toEqual([170, 125])
    expect(r.transfers.map((t) => t.finalLoadA)).toEqual([400, 400])
    expect(r.transfers.map((t) => t.level)).toEqual(['near', 'near'])
  })

  it('row 16: the weakest of the sheet', () => {
    const r = assessCase(cases[15])
    expect(r).toMatchObject({ totalSpareA: 265, restorableA: 265, unrestorableA: 60, status: 'high' })
    expect(r.transfers.map((t) => t.transferA)).toEqual([125, 140])
    expect(r.transfers.map((t) => t.finalLoadingPct)).toEqual([100, 100])
  })

  it('equals the sheet formulas on every row and rating', () => {
    for (const ratingA of [400, 348, 320])
      for (const c of cases) {
        const sheet = sheetRow(ratingA, c.main.loadA, c.backups.map((b) => b.loadA))
        const r = assessCase(c, { ratingA })
        expect(r.totalSpareA).toBe(sheet.J)
        expect(r.restorableA).toBe(sheet.K)
        expect(r.unrestorableA).toBe(sheet.L)
        expect(r.ratio).toBe(sheet.M)
        r.transfers.forEach((t, i) => expect(t.transferA).toBeCloseTo(sheet.transfers[i], 9))
      }
  })

  it('equals the sheet formulas with one, two and three backups of any size', () => {
    // a small fixed-seed generator: the same cases on every run
    let seed = 7
    const next = (max: number) => (seed = (seed * 48271) % 2147483647) % max
    for (let n = 0; n < 300; n += 1) {
      const loads = Array.from({ length: 1 + next(3) }, () => next(460))
      const c: BackupCase = {
        id: 'x',
        level: 'feeder',
        voltageKv: 13.8,
        main: { no: '7001', loadA: next(500) },
        backups: loads.map((loadA, i) => ({ no: String(7002 + i), loadA })),
      }
      const sheet = sheetRow(400, c.main.loadA, loads)
      const r = assessCase(c)
      expect(r.restorableA).toBeCloseTo(sheet.K, 9)
      r.transfers.forEach((t, i) => expect(t.transferA).toBeCloseTo(sheet.transfers[i], 9))
      expect(r.transfers.reduce((sum, t) => sum + t.transferA, 0)).toBeCloseTo(r.restorableA, 9)
    }
  })
})

describe('edge cases', () => {
  const base: BackupCase = { id: 'e', level: 'station', voltageKv: 13.8, main: { no: '7001', loadA: 300 }, backups: [] }

  it('no backups: nothing is restorable', () => {
    expect(assessCase(base)).toMatchObject({ totalSpareA: 0, restorableA: 0, unrestorableA: 300, ratio: 0, status: 'none', transfers: [] })
  })

  it('zero load counts as fully restorable and moves nothing', () => {
    const r = assessCase({ ...base, main: { no: '7001', loadA: 0 }, backups: [{ no: '7002', loadA: 100 }] })
    expect(r).toMatchObject({ ratio: 1, status: 'full', restorableA: 0, unrestorableA: 0 })
    expect(r.transfers[0]).toMatchObject({ transferA: 0, finalLoadA: 100, level: 'calm' })
  })

  it('an overloaded backup has no spare, takes nothing and is flagged', () => {
    const r = assessCase({ ...base, backups: [{ no: '7002', loadA: 430 }, { no: '7003', loadA: 250 }] })
    expect(r.transfers[0]).toMatchObject({ spareA: 0, transferA: 0, finalLoadA: 430, level: 'over' })
    expect(r.transfers[1]).toMatchObject({ spareA: 150, transferA: 150, finalLoadA: 400, level: 'near' })
    expect(r).toMatchObject({ restorableA: 150, unrestorableA: 150, ratio: 0.5, status: 'limited' })
  })

  it('five backups: shared in proportion, never beyond a spare, summing to the load', () => {
    const loads = [350, 300, 380, 390, 250]
    const r = assessCase({ ...base, main: { no: '7001', loadA: 200 }, backups: loads.map((loadA, i) => ({ no: String(7002 + i), loadA })) })
    // spares 50, 100, 20, 10, 150 = 330 → everyone gives 200/330 of their spare
    expect(r.totalSpareA).toBe(330)
    r.transfers.forEach((t) => {
      expect(t.transferA).toBeCloseTo((t.spareA * 200) / 330, 9)
      expect(t.transferA).toBeLessThanOrEqual(t.spareA)
    })
    expect(r.transfers.reduce((sum, t) => sum + t.transferA, 0)).toBeCloseTo(200, 9)
    expect(r.status).toBe('full')
  })

  it('rating: the backup wins over the case, the case over the default', () => {
    const backups = [{ no: '7002', loadA: 300 }, { no: '7003', loadA: 300, ratingA: 600 }]
    expect(assessCase({ ...base, backups }).transfers.map((t) => t.spareA)).toEqual([100, 300])
    expect(assessCase({ ...base, backups }, { ratingA: 350 }).transfers.map((t) => t.spareA)).toEqual([50, 300])
    expect(assessCase({ ...base, ratingA: 500, backups }, { ratingA: 350 }).transfers.map((t) => t.spareA)).toEqual([200, 300])
  })

  it('derating multiplies the rating; 0.87 × 400 is the 348 A of the calibration', () => {
    const derated = summarize(cases, bySector, { derating: 0.87 })
    expect(derated.total.unrestorableA).toBeCloseTo(3475, 6)
    expect(assessCase(cases[0], { derating: 0.87 }).transfers[0].ratingA).toBeCloseTo(348, 9)
  })

  it('a cap limits what one backup may take', () => {
    const r = assessCase({ ...base, backups: [{ no: '7002', loadA: 200 }, { no: '7003', loadA: 200 }] }, { spareCapsA: [50, null] })
    expect(r.transfers.map((t) => t.spareA)).toEqual([50, 200])
    expect(r.unrestorableA).toBe(50)
  })

  it('missing or negative figures count as zero', () => {
    const r = assessCase({ ...base, main: { no: '7001', loadA: Number.NaN }, backups: [{ no: '7002', loadA: -5 }] })
    expect(r).toMatchObject({ loadA: 0, totalSpareA: 400, status: 'full' })
  })

  it('loading levels: calm to 80 %, near to 100 %, over beyond', () => {
    expect([0, 80, 80.1, 100, 100.0000001, 100.1].map(loadingLevel)).toEqual(['calm', 'calm', 'near', 'near', 'near', 'over'])
  })
})

describe('amperes and MVA', () => {
  it('√3 · kV · A / 1000, and back', () => {
    expect(ampsToMva(400, 13.8)).toBeCloseTo(9.5609, 4)
    expect(ampsToMva(400, 33)).toBeCloseTo(22.8631, 4)
    expect(mvaToAmps(ampsToMva(275, 13.8), 13.8)).toBeCloseTo(275, 9)
    expect(mvaToAmps(10, 0)).toBe(0)
  })

  it('a result carries its MVA equivalents', () => {
    const r = assessCase(cases[3])
    expect(r.loadMva).toBeCloseTo(ampsToMva(310, 13.8), 9)
    expect(r.unrestorableMva).toBeCloseTo(ampsToMva(15, 13.8), 9)
  })
})
