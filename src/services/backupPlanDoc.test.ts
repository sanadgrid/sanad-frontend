import { describe, expect, it } from 'vitest'
import type { BackupCase } from '../features/restoration/backup/model'
import { applyPlanChanges, caseOf, emptyPlan, fitsOneDocument, planOf } from './backupPlanDoc'

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
    const together = applyPlanChanges(emptyPlan('central'), changes)
    const apart = changes.reduce((doc, change) => applyPlanChanges(doc, [change]), emptyPlan('central'))
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
