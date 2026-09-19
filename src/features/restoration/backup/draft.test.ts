import { describe, expect, it } from 'vitest'
import type { Position } from '../import/types'
import { buildDirectory, placesOf } from './directory'
import { compact, DEMO_NOTE, draftOf, fillDemoLoads, isComplete, moveBackup, nextTarget, pick, setRow, toCase, withNumber, withPlace, type PlanDraft } from './draft'
import { assessCase, type BackupCase } from './model'

const at = (lng: number, lat: number): Position => [lng, lat]

// 7005 stands at three points of layer a and once more in layer b; the rest stand once
const directory = buildDirectory([
  {
    id: 'a',
    name: 'Layer A',
    stations: [
      { no: '7001', c: at(46.6, 24.6) },
      { no: '7002', c: at(46.61, 24.6) },
      { no: '7003', c: at(46.62, 24.6) },
      { no: '7005', c: at(46.7, 24.7) },
      { no: '7005', c: at(46.72, 24.7) },
      { no: '7005', c: at(46.7, 24.73) },
    ],
  },
  { id: 'b', name: 'Layer B', stations: [{ no: '7005', c: at(46.8, 24.8) }] },
])
const point = (no: string, index = 0) => placesOf(directory, no)[index]
const typed = (draft: PlanDraft, target: 'main' | number, no: string, load = '') =>
  setRow(draft, target, (row) => ({ ...withNumber(row, no, directory), load }))
const round2 = (value: number) => Math.round(value * 100) / 100

describe('a number typed into the plan', () => {
  it('takes its place without asking when the number stands at one place only', () => {
    const draft = typed(draftOf(undefined, 'p'), 'main', '7001', '300')
    expect(draft.main).toMatchObject({ no: '7001', at: at(46.6, 24.6), layerId: 'a' })
    expect(toCase(draft).main).toEqual({ no: '7001', loadA: 300, at: at(46.6, 24.6), layerId: 'a' })
  })

  it('waits for a choice when the number stands at several, and keeps the choice while it is typed on', () => {
    let draft = typed(draftOf(undefined, 'p'), 0, '7005')
    expect(draft.backups[0].at).toBeUndefined()
    expect(toCase(draft).backups[0]).toEqual({ no: '7005', loadA: 0 })
    draft = setRow(draft, 0, (row) => withPlace(row, point('7005', 2)))
    expect(draft.backups[0]).toMatchObject({ at: at(46.7, 24.73), layerId: 'a' })
    // the feeder of the same station stands at the same place
    expect(typed(draft, 0, '7005/F2').backups[0].at).toEqual(at(46.7, 24.73))
    // another number drops the place, an unknown one too
    expect(typed(draft, 0, '7002').backups[0].at).toEqual(at(46.61, 24.6))
    expect(typed(draft, 0, '7999').backups[0]).not.toHaveProperty('at')
    expect(typed(draft, 0, '7999').backups[0]).not.toHaveProperty('layerId')
  })
})

describe('stations clicked on the map', () => {
  it('sets the main element, then the backups in order — each with the very point that was clicked', () => {
    let draft = draftOf(undefined, 'p')
    expect(nextTarget(draft)).toBe('main')
    draft = pick(draft, point('7001'))
    expect(nextTarget(draft)).toBe(0)
    draft = pick(draft, point('7005', 1))
    draft = pick(draft, point('7002'))
    draft = pick(draft, point('7005', 3))
    expect(nextTarget(draft)).toBe(3)
    draft = pick(draft, point('7003'))
    expect(draft.backups).toHaveLength(4)
    const saved = toCase(draft)
    expect(saved.main).toMatchObject({ no: '7001', at: at(46.6, 24.6) })
    expect(saved.backups.map((b) => [b.no, b.at, b.layerId])).toEqual([
      ['7005', at(46.72, 24.7), 'a'],
      ['7002', at(46.61, 24.6), 'a'],
      ['7005', at(46.8, 24.8), 'b'],
      ['7003', at(46.62, 24.6), 'a'],
    ])
  })

  it('takes a clicked backup out again and closes the gap; the main element leaves its line to be set again', () => {
    let draft = [point('7001'), point('7002'), point('7005', 1), point('7003')].reduce(pick, draftOf(undefined, 'p'))
    draft = pick(draft, point('7005', 1))
    expect(toCase(draft).backups.map((b) => b.no)).toEqual(['7002', '7003'])
    // another point of the same number is another station
    draft = pick(draft, point('7005', 0))
    expect(toCase(draft).backups.map((b) => b.no)).toEqual(['7002', '7003', '7005'])
    draft = pick(draft, point('7001'))
    expect(nextTarget(draft)).toBe('main')
    expect(isComplete(draft)).toBe(false)
    expect(pick(draft, point('7005', 2)).main).toMatchObject({ no: '7005', at: at(46.7, 24.73) })
  })

  it('fills the blank lines first, blank lines last once picking starts', () => {
    let draft = typed(typed(draftOf(undefined, 'p'), 'main', '7001', '300'), 2, '7003', '250')
    draft = compact(draft)
    expect(draft.backups.map((row) => row.no)).toEqual(['7003', '', ''])
    expect(nextTarget(draft)).toBe(1)
    expect(pick(draft, point('7002')).backups.map((row) => row.no)).toEqual(['7003', '7002', ''])
  })
})

describe('the order of the backups', () => {
  const plan: BackupCase = {
    id: 'p',
    level: 'station',
    voltageKv: 13.8,
    main: { no: '7001', loadA: 320 },
    backups: [{ no: '7002', loadA: 270 }, { no: '7003', loadA: 285 }, { no: '7005', loadA: 260 }],
  }
  const transfers = (c: BackupCase, derating = 1) => assessCase(c, { ratingA: 400, derating }).transfers.map((t) => [t.no, round2(t.transferA)])

  it('moves a line up or down and leaves the ends where they are', () => {
    const draft = draftOf(plan, 'p')
    expect(toCase(moveBackup(draft, 2, -1)).backups.map((b) => b.no)).toEqual(['7002', '7005', '7003'])
    expect(toCase(moveBackup(draft, 0, 1)).backups.map((b) => b.no)).toEqual(['7003', '7002', '7005'])
    expect(moveBackup(draft, 0, -1)).toBe(draft)
    expect(moveBackup(draft, 2, 1)).toBe(draft)
    // the line moves whole: its load and its place go with it
    expect(moveBackup(draft, 1, 1).backups[2]).toBe(draft.backups[1])
  })

  // The split is in proportion to the spare, so the order decides the line and the
  // badge of a backup — not what it takes: the transfers travel with their backups.
  it('reorders the transfers with their backups, and leaves what is restored as it was', () => {
    const draft = draftOf(plan, 'p')
    expect(transfers(toCase(draft))).toEqual([['7002', 108.05], ['7003', 95.58], ['7005', 116.36]])
    const moved = toCase(moveBackup(draft, 2, -1))
    expect(transfers(moved)).toEqual([['7002', 108.05], ['7005', 116.36], ['7003', 95.58]])
    const first = toCase(moveBackup(moveBackup(draft, 2, -1), 1, -1))
    expect(transfers(first).map(([no]) => no)).toEqual(['7005', '7002', '7003'])
    for (const c of [toCase(draft), moved, first]) expect(round2(assessCase(c, { ratingA: 400 }).restorableA)).toBe(320)
    // under the derating the backups are full whichever comes first: the order shares out the same 229 A
    for (const c of [toCase(draft), moved]) expect(round2(assessCase(c, { ratingA: 400, derating: 0.87 }).restorableA)).toBe(229)
    expect(transfers(toCase(draft), 0.87)).toEqual([['7002', 78], ['7003', 63], ['7005', 88]])
  })
})

describe('loads for a presentation', () => {
  it('fills empty fields only, marks the case and says so in an empty note', () => {
    let draft = [point('7001'), point('7002'), point('7003'), point('7005', 1)].reduce(pick, draftOf(undefined, 'p'))
    draft = setRow(draft, 1, (row) => ({ ...row, load: '199' }))
    const filled = fillDemoLoads(draft)
    expect(filled.main.load).toBe('320')
    expect(filled.backups.map((row) => row.load)).toEqual(['270', '199', '260'])
    expect(filled).toMatchObject({ demo: true, note: DEMO_NOTE })
    expect(fillDemoLoads({ ...draft, note: 'ملاحظة' }).note).toBe('ملاحظة')
    expect(toCase(filled)).toMatchObject({ demo: true, note: DEMO_NOTE })
    // a line without a number is not a backup: it gets no load
    expect(fillDemoLoads(draftOf(undefined, 'p')).backups.map((row) => row.load)).toEqual(['', '', ''])
  })

  it('gives 100 % as written and 71.6 % under the summer derating, for three backups at 400 A', () => {
    const draft = fillDemoLoads([point('7001'), point('7002'), point('7003'), point('7005')].reduce(pick, draftOf(undefined, 'p')))
    const saved = toCase(draft)
    expect([saved.main.loadA, ...saved.backups.map((b) => b.loadA)]).toEqual([320, 270, 285, 260])
    const plain = assessCase(saved, { ratingA: 400 })
    expect(plain.ratio).toBe(1)
    expect(plain.transfers.map((t) => round2(t.transferA))).toEqual([108.05, 95.58, 116.36])
    const derated = assessCase(saved, { ratingA: 400, derating: 0.87 })
    expect(round2(derated.restorableA)).toBe(229)
    expect(Math.round(derated.ratio * 1000) / 10).toBe(71.6)
  })

  it('cycles the assumed loads past five backups, and loads a station picked into a demo plan at once', () => {
    let draft = fillDemoLoads(draftOf(undefined, 'p'))
    for (const p of [point('7001'), point('7002'), point('7003'), point('7005', 0), point('7005', 1), point('7005', 2), point('7005', 3)]) draft = pick(draft, p)
    expect(draft.backups.map((row) => row.load)).toEqual(['270', '285', '260', '250', '275', '270'])
    // the flag stays when a load is edited by hand, until it is unticked
    const edited = setRow(draft, 0, (row) => ({ ...row, load: '150' }))
    expect(toCase(edited).demo).toBe(true)
    expect(toCase({ ...edited, demo: false })).not.toHaveProperty('demo')
  })
})
