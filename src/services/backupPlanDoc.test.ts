import { describe, expect, it } from 'vitest'
import type { BackupCase } from '../features/restoration/backup/model'
import { applyPlanChanges, caseOf, emptyPlan, fitPlan, fitsOneDocument, keyOfTrashed, MAX_TRASH, planOf, TRASH_MS, trashKey, type BackupPlan } from './backupPlanDoc'

const plan = (id: string, main = '7001'): BackupCase => ({
  id,
  level: 'station',
  voltageKv: 13.8,
  main: { no: main, loadA: 300 },
  backups: [
    { no: '7002', loadA: 220 },
    { no: '7003', loadA: 270 },
  ],
})

describe('backup plan document', () => {
  it('adds, replaces in place, removes and re-rates — in order', () => {
    let doc = applyPlanChanges(emptyPlan('central'), [{ upsert: plan('a') }, { upsert: plan('b', '7010') }, { upsert: plan('c', '7020') }])
    expect(doc.cases.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    doc = applyPlanChanges(doc, [{ upsert: { ...plan('b', '7011'), note: 'x' } }, { remove: 'a' }, { ratingA: 350 }])
    expect(doc.cases.map((c) => [c.id, c.main.no])).toEqual([['b', '7011'], ['c', '7020']])
    expect(doc).toMatchObject({ sectorId: 'central', ratingA: 350 })
  })

  it('changes queued together equal the same changes one by one', () => {
    const changes = [{ upsert: plan('a') }, { remove: 'a' }, { upsert: plan('a', '7005') }]
    const together = applyPlanChanges(emptyPlan('central'), changes, { now: 1000 })
    const apart = changes.reduce((doc, change) => applyPlanChanges(doc, [change], { now: 1000 }), emptyPlan('central'))
    expect(together).toEqual(apart)
    expect(together.cases).toHaveLength(1)
  })

  it('ignores a rating that is not a positive number', () => {
    expect(applyPlanChanges(emptyPlan('central'), [{ ratingA: 0 }, { ratingA: Number.NaN }]).ratingA).toBe(400)
  })

  it('reads whatever was stored without breaking', () => {
    const stored = { ratingA: 'x', cases: [plan('a'), null, { id: '' }, { id: 'b', level: 'feeder', voltageKv: 33, main: { no: 7001, loadA: '12' }, backups: [{ no: '' }, { no: '7002', loadA: 10, ratingA: -1 }] }] }
    const doc = planOf('central', stored)
    expect(doc.ratingA).toBe(400)
    expect(doc.cases.map((c) => c.id)).toEqual(['a', 'b'])
    expect(doc.cases[1]).toEqual({ id: 'b', level: 'feeder', voltageKv: 33, main: { no: '7001', loadA: 0 }, backups: [{ no: '7002', loadA: 10 }] })
    expect(planOf('central', undefined)).toEqual(emptyPlan('central'))
    expect(caseOf('nonsense')).toBeNull()
  })

  it('keeps the chosen place of an element and the demo flag through the document, and drops what is not a place', () => {
    const placed: BackupCase = {
      ...plan('a'),
      demo: true,
      note: 'x',
      main: { no: '7001', loadA: 320, at: [46.7, 24.7], layerId: 'layer-a' },
      backups: [{ no: '7005', loadA: 270, at: [46.72, 24.7], layerId: 'layer-a' }, { no: '7005', loadA: 285, at: [46.8, 24.8] }, { no: '7003', loadA: 260 }],
    }
    const doc = applyPlanChanges(emptyPlan('central'), [{ upsert: placed }])
    // what is written goes through JSON, and is read back through planOf
    const stored = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>
    expect(planOf('central', stored).cases).toEqual([placed])

    const odd = { id: 'b', demo: 'yes', main: { no: '7001', at: [46.7], layerId: 'l' }, backups: [{ no: '7002', at: [200, 24.7] }, { no: '7003', at: ['46.7', 24.7] }, { no: '7004', at: [46.7, 24.7], layerId: 7 }] }
    expect(caseOf(odd)).toEqual({
      id: 'b',
      level: 'station',
      voltageKv: 13.8,
      main: { no: '7001', loadA: 0 },
      backups: [{ no: '7002', loadA: 0 }, { no: '7003', loadA: 0 }, { no: '7004', loadA: 0, at: [46.7, 24.7], layerId: '7' }],
    })
    // a case stored before places were kept reads as it always did
    expect(caseOf(plan('old'))).toEqual(plan('old'))
  })

  it('holds thousands of cases in one document, and says when it no longer can', () => {
    const many = (n: number) => ({ ...emptyPlan('central'), cases: Array.from({ length: n }, (_, i) => plan(`case-${i}`)) })
    expect(fitsOneDocument(many(3000))).toBe(true)
    expect(fitsOneDocument(many(8000))).toBe(false)
  })
})

describe('the trash of the plans', () => {
  const DAY = 24 * 60 * 60_000
  const NOW = 100 * DAY
  const start = (): BackupPlan => applyPlanChanges(emptyPlan('central'), [{ upsert: plan('a') }, { upsert: plan('b', '7010') }], { now: NOW })

  it('moves a deleted case to the trash, with when and by whom, and leaves the others alone', () => {
    const doc = applyPlanChanges(start(), [{ remove: 'a', at: NOW + 5 }], { now: NOW + 9, by: 'admin-1' })
    expect(doc.cases.map((c) => c.id)).toEqual(['b'])
    expect(doc.trash).toEqual([{ case: plan('a'), deletedAt: NOW + 5, deletedBy: 'admin-1' }])
    // deleting what is not there changes nothing
    expect(applyPlanChanges(doc, [{ remove: 'a' }], { now: NOW + 10 })).toEqual(doc)
  })

  it('restores a case exactly as it was, by the key the deletion gave it', () => {
    const deleted = applyPlanChanges(start(), [{ remove: 'a', at: NOW + 5 }], { now: NOW + 5 })
    const back = applyPlanChanges(deleted, [{ restore: trashKey('a', NOW + 5) }], { now: NOW + 6 })
    expect(back.cases.map((c) => c.id).sort()).toEqual(['a', 'b'])
    expect(back.cases.find((c) => c.id === 'a')).toEqual(plan('a'))
    expect(back.trash).toEqual([])
    // a key that names nothing is ignored
    expect(applyPlanChanges(deleted, [{ restore: trashKey('a', 1) }], { now: NOW + 6 })).toEqual(deleted)
  })

  it('keeps both copies apart when a case is deleted, written again and deleted again', () => {
    let doc = applyPlanChanges(start(), [{ remove: 'a', at: NOW + 1 }, { upsert: plan('a', '7030') }, { remove: 'a', at: NOW + 2 }], { now: NOW + 2 })
    expect(doc.trash.map(keyOfTrashed)).toEqual([trashKey('a', NOW + 1), trashKey('a', NOW + 2)])
    doc = applyPlanChanges(doc, [{ restore: trashKey('a', NOW + 1) }], { now: NOW + 3 })
    expect(doc.cases.find((c) => c.id === 'a')?.main.no).toBe('7001')
    // restoring the other copy over a live one swaps them: nothing is lost
    doc = applyPlanChanges(doc, [{ restore: trashKey('a', NOW + 2) }], { now: NOW + 4 })
    expect(doc.cases.find((c) => c.id === 'a')?.main.no).toBe('7030')
    expect(doc.trash.map((t) => [t.case.main.no, t.deletedAt])).toEqual([['7001', NOW + 4]])
  })

  it('deletes for good only when asked to', () => {
    const deleted = applyPlanChanges(start(), [{ remove: 'a', at: NOW + 5 }], { now: NOW + 5 })
    const purged = applyPlanChanges(deleted, [{ purge: trashKey('a', NOW + 5) }], { now: NOW + 6 })
    expect(purged.trash).toEqual([])
    expect(purged.cases.map((c) => c.id)).toEqual(['b'])
  })

  it('drops what has waited thirty days on the next write, whatever that write is', () => {
    const deleted = applyPlanChanges(start(), [{ remove: 'a', at: NOW }, { remove: 'b', at: NOW + 10 * DAY }], { now: NOW + 10 * DAY })
    expect(applyPlanChanges(deleted, [{ ratingA: 350 }], { now: NOW + TRASH_MS - 1 }).trash).toHaveLength(2)
    expect(applyPlanChanges(deleted, [{ ratingA: 350 }], { now: NOW + TRASH_MS }).trash.map((t) => t.case.id)).toEqual(['b'])
  })

  it('never holds more than it has room for: the oldest go first', () => {
    const many = Array.from({ length: MAX_TRASH + 5 }, (_, i) => plan(`case-${i}`, String(7100 + i)))
    let doc = applyPlanChanges(emptyPlan('central'), many.map((upsert) => ({ upsert })), { now: NOW })
    doc = applyPlanChanges(doc, many.map((c, i) => ({ remove: c.id, at: NOW + i })), { now: NOW + 1000 })
    expect(doc.cases).toEqual([])
    expect(doc.trash).toHaveLength(MAX_TRASH)
    expect(doc.trash[0].case.id).toBe('case-5')
    expect(doc.trash.at(-1)?.case.id).toBe(`case-${MAX_TRASH + 4}`)
  })

  it('sends a plan overwritten by a bulk entry to the trash, and an ordinary edit nowhere', () => {
    const edited = applyPlanChanges(start(), [{ upsert: { ...plan('a'), note: 'edited' } }], { now: NOW + 1 })
    expect(edited.trash).toEqual([])
    const replaced = applyPlanChanges(start(), [{ upsert: plan('a', '7040'), keepReplaced: true }, { upsert: plan('b', '7010'), keepReplaced: true }, { upsert: plan('c', '7050'), keepReplaced: true }], { now: NOW + 1, by: 'admin-1' })
    expect(replaced.cases.map((c) => [c.id, c.main.no])).toEqual([['a', '7040'], ['b', '7010'], ['c', '7050']])
    // only the one whose content changed: `b` was pasted as it already stood
    expect(replaced.trash).toEqual([{ case: plan('a'), deletedAt: NOW + 1, deletedBy: 'admin-1' }])
  })

  it('reads the trash back through the document, and a document written before there was one', () => {
    const deleted = applyPlanChanges(start(), [{ remove: 'a', at: NOW + 5 }], { now: NOW + 5, by: 'admin-1' })
    const stored = JSON.parse(JSON.stringify(deleted)) as Record<string, unknown>
    expect(planOf('central', stored)).toEqual(deleted)
    expect(planOf('central', { cases: [plan('a')] }).trash).toEqual([])
    expect(planOf('central', { trash: [null, { case: { id: '' }, deletedAt: 5 }, { case: plan('x'), deletedAt: 'soon' }, { case: plan('y'), deletedAt: 7 }] }).trash).toEqual([{ case: plan('y'), deletedAt: 7 }])
  })

  it('gives up the oldest of the trash before it lets the document outgrow its limit', () => {
    const cases = Array.from({ length: 3000 }, (_, i) => plan(`case-${i}`))
    const trash = Array.from({ length: 6000 }, (_, i) => ({ case: plan(`old-${i}`), deletedAt: NOW + i }))
    const doc: BackupPlan = { ...emptyPlan('central'), cases, trash }
    expect(fitsOneDocument(doc)).toBe(false)
    const fitted = fitPlan(doc)
    expect(fitsOneDocument(fitted)).toBe(true)
    expect(fitted.cases).toHaveLength(3000)
    expect(fitted.trash.length).toBeGreaterThan(0)
    expect(fitted.trash.at(-1)).toEqual(trash.at(-1))
  })
})
