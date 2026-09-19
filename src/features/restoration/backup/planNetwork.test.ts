import { describe, expect, it } from 'vitest'
import { buildDirectory } from './directory'
import type { BackupCase } from './model'
import { cases as sheet } from './model.fixture'
import { defaultPlanFilters, matchesRow } from './planFilters'
import { byPriority, dataKind, derivePlanNetwork, isSupportOnly, summarizeRows, visibleNetwork } from './planNetwork'
import { ampsToMva } from './units'

// all synthetic: six stations on a line, and 7005 at two places
const directory = buildDirectory([
  {
    id: 'layer-a',
    name: 'Zone A',
    stations: [
      { no: '7001', c: [46.1, 24.1] },
      { no: '7002', c: [46.2, 24.1] },
      { no: '7003', n: '7003 North', c: [46.3, 24.1] },
      { no: '7004', c: [46.4, 24.1] },
      { no: '7005', c: [46.5, 24.1] },
      { no: '7005', c: [46.5, 24.3] },
      { no: '7006', c: [46.6, 24.1] },
    ],
  },
])

const plan = (id: string, main: [string, number], backups: [string, number][], patch: Partial<BackupCase> = {}): BackupCase => ({
  id,
  level: 'station',
  voltageKv: 13.8,
  main: { no: main[0], loadA: main[1] },
  backups: backups.map(([no, loadA]) => ({ no, loadA })),
  ...patch,
})

// 7002 stands behind both 7001 and 7004
const shared = [plan('a', ['7001', 300], [['7002', 250], ['7003', 200]]), plan('b', ['7004', 380], [['7002', 250]])]

describe('the network the plans make', () => {
  it('one station per element, one link per backup and main', () => {
    const net = derivePlanNetwork(shared, directory)
    expect([...net.nodes.values()].map((n) => n.no).sort()).toEqual(['7001', '7002', '7003', '7004'])
    expect(net.links.map((l) => `${l.backupNo}>${l.mainNo}`)).toEqual(['7002>7001', '7003>7001', '7002>7004'])
    expect(net.nodes.get('7003@46.3,24.1')?.name).toBe('7003 North')
    expect(net.nodes.get('7001@46.1,24.1')?.name).toBeNull()
  })

  it('a main element carries the result of its case', () => {
    const net = derivePlanNetwork(shared, directory)
    const main = net.nodes.get('7004@46.4,24.1')
    expect(main?.rows[0].result).toMatchObject({ loadA: 380, restorableA: 150, unrestorableA: 230, status: 'limited' })
    expect(main?.loadMva).toBeCloseTo(ampsToMva(380, 13.8), 9)
    expect(main && isSupportOnly(main)).toBe(false)
  })

  it('a backup shared by two mains: a link to each, and the worst single case — never the sum', () => {
    const net = derivePlanNetwork(shared, directory)
    const backup = net.nodes.get('7002@46.2,24.1')
    expect(backup && isSupportOnly(backup)).toBe(true)
    expect(backup?.supports.map((l) => l.mainNo)).toEqual(['7001', '7004'])
    // behind 7001 it takes 300 × 150/350; behind 7004 it is filled to its rating
    expect(backup?.supports[0].transferA).toBeCloseTo((300 * 150) / 350, 9)
    expect(backup?.supports[1]).toMatchObject({ transferA: 150, finalLoadA: 400, finalLoadingPct: 100, level: 'near' })
    expect(backup).toMatchObject({ loadA: 250, nowPct: 62.5, worstPct: 100, worstLevel: 'near' })
  })

  it('a backup already above its rating takes nothing and is counted once', () => {
    const over = [plan('a', ['7001', 300], [['7002', 420]]), plan('b', ['7004', 100], [['7002', 420], ['7003', 100]])]
    const net = derivePlanNetwork(over, directory)
    expect(net.nodes.get('7002@46.2,24.1')).toMatchObject({ worstLevel: 'over', worstPct: 105 })
    expect(summarizeRows(net.rows)).toMatchObject({ overRated: 1, below100: 1, cases: 2 })
  })

  it('the derating and the rating move every figure', () => {
    const plain = derivePlanNetwork(shared, directory, { ratingA: 400 })
    const derated = derivePlanNetwork(shared, directory, { ratingA: 400, derating: 0.87 })
    expect(plain.rows[0].result.status).toBe('full')
    expect(derated.rows[0].result).toMatchObject({ restorableA: 246, status: 'high' })
    expect(derated.nodes.get('7002@46.2,24.1')?.nowPct).toBeCloseTo((250 / 348) * 100, 9)
  })

  it('an element stands at the point its plan names, else where the directory first finds it', () => {
    const at: BackupCase = { ...plan('c', ['7006', 100], []), backups: [{ no: '7005', loadA: 50, at: [46.5, 24.3] }, { no: '7005', loadA: 60 }] }
    const net = derivePlanNetwork([at], directory)
    expect(net.links.map((l) => l.from)).toEqual(['7005@46.5,24.3', '7005@46.5,24.1'])
    // only the one that does not say which of the two places it means
    expect(net.ambiguous).toEqual(['7005'])
  })

  it('a number the imported stations do not know is listed, not placed', () => {
    const net = derivePlanNetwork([plan('d', ['7001', 100], [['7999', 50]])], directory)
    expect(net.unplaced).toEqual(['7999'])
    expect(net.nodes.get('7999@')?.at).toBeNull()
  })

  it('coverage: imported stations that have a plan of their own, a feeder counting for its station', () => {
    const feeder = plan('e', ['7003/F2', 120], [['7001', 80]], { level: 'feeder' })
    const net = derivePlanNetwork([...shared, feeder, plan('f', ['7999', 10], [])], directory)
    expect(net.coverage).toEqual({ planned: 3, imported: 6 })
    expect(derivePlanNetwork([], directory).coverage).toEqual({ planned: 0, imported: 6 })
  })

  it('two cases for the same main element: the node carries the weaker', () => {
    const twice = [plan('a', ['7001', 300], [['7002', 100]]), plan('b', ['7001', 300], [['7003', 350]])]
    expect(derivePlanNetwork(twice, directory).nodes.get('7001@46.1,24.1')?.rows.map((r) => r.plan.id)).toEqual(['b', 'a'])
  })
})

describe('figures of the strip', () => {
  it.each([
    [undefined, 525, 0.94, 21],
    [0.87, 3475, 0.603, 30],
  ])('the calibration sheet, derating %s → %i A unrestorable', (derating, unrestorableA, ratio, below100) => {
    const kpis = summarizeRows(derivePlanNetwork(sheet, directory, { ratingA: 400, derating }).rows)
    expect(kpis.cases).toBe(30)
    expect(kpis.loadA).toBe(8755)
    expect(kpis.unrestorableA).toBeCloseTo(unrestorableA, 6)
    expect(kpis.ratio).toBeCloseTo(ratio, 3)
    expect(kpis.below100).toBe(below100)
    expect(kpis.status).toBe(derating ? 'limited' : 'high')
    expect(kpis.loadMva).toBeCloseTo(ampsToMva(8755, 13.8), 6)
    expect(kpis.unrestorableMw).toBeCloseTo(ampsToMva(unrestorableA, 13.8) * 0.9, 6)
  })

  it('no cases: nothing to restore, nothing lost', () => {
    expect(summarizeRows([])).toMatchObject({ cases: 0, loadA: 0, ratio: 1, status: 'full', overRated: 0 })
  })

  it('priority: the weakest ratio first, then the most amperes left dark', () => {
    const rows = derivePlanNetwork(sheet, directory).rows
    const sorted = byPriority(rows)
    expect(sorted[0].plan.id).toBe('F16')
    expect(sorted.at(-1)?.result.ratio).toBe(1)
    for (let i = 1; i < sorted.length; i += 1) expect(sorted[i].result.ratio).toBeGreaterThanOrEqual(sorted[i - 1].result.ratio)
  })
})

describe('filters', () => {
  const demo = plan('g', ['7006', 100], [['7005', 20]], { demo: true, level: 'feeder', voltageKv: 33 })
  const net = derivePlanNetwork([...shared, demo], directory)
  const ids = (patch: Partial<typeof defaultPlanFilters>) => net.rows.filter((row) => matchesRow(row, { ...defaultPlanFilters, ...patch })).map((r) => r.plan.id)

  it('by number (main or backup, Arabic digits too), class, level, voltage and the flags', () => {
    expect(ids({})).toEqual(['a', 'b', 'g'])
    expect(ids({ search: '7002' })).toEqual(['a', 'b'])
    expect(ids({ search: '٧٠٠٦' })).toEqual(['g'])
    expect(ids({ status: 'limited' })).toEqual(['b'])
    expect(ids({ level: 'feeder' })).toEqual(['g'])
    expect(ids({ voltageKv: 33 })).toEqual(['g'])
    expect(ids({ below100: true })).toEqual(['b'])
    expect(ids({ overRated: true })).toEqual([])
    expect(ids({ demo: 'only' })).toEqual(['g'])
    expect(ids({ demo: 'without' })).toEqual(['a', 'b'])
  })

  it('the map keeps the stations at either end of the cases that passed', () => {
    const shown = visibleNetwork(net, net.rows.filter((row) => row.plan.id === 'b'))
    expect(shown.nodes.map((n) => n.no).sort()).toEqual(['7002', '7004'])
    expect(shown.links.map((l) => l.id)).toEqual(['b:0'])
  })

  it('says whether what is shown is real', () => {
    expect(dataKind([])).toBeNull()
    expect(dataKind([demo])).toBe('demo')
    expect(dataKind([demo, shared[0]])).toBe('real')
  })
})
