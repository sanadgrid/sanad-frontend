import { describe, expect, it } from 'vitest'
import { buildDirectory, allPoints } from './directory'
import { compact, draftOf, pick, setRow, toCase, type PlanDraft } from './draft'
import { canReach, isUntouched, saveBlocker, stepOf } from './wizard'

const directory = buildDirectory([
  { id: 'a', name: 'Layer A', stations: [{ no: '7001', c: [46.7, 24.7] }, { no: '7002', c: [46.71, 24.7] }, { no: '7003', c: [46.72, 24.7] }] },
])
const [main, first, second] = allPoints(directory)
const load = (draft: PlanDraft, target: 'main' | number, value: string) => setRow(draft, target, (row) => ({ ...row, load: value }))

describe('a new plan, step by step', () => {
  const blank = compact(draftOf(undefined, 'new'))

  it('starts on the main station, moves to the backups with the first click and to the loads when the map is left', () => {
    expect(stepOf(blank, true)).toBe(1)
    const withMain = pick(blank, main)
    expect(stepOf(withMain, true)).toBe(2)
    expect(stepOf(pick(withMain, first), true)).toBe(2)
    // clicking the main station again takes it out: back to the first step, with the backups kept
    const unpicked = pick(pick(withMain, first), main)
    expect(stepOf(unpicked, true)).toBe(1)
    expect(unpicked.backups[0].no).toBe('7002')
    expect(stepOf(pick(withMain, first), false)).toBe(3)
  })

  it('only opens a step once what comes before it is there', () => {
    expect([1, 2, 3].map((s) => canReach(blank, s as 1 | 2 | 3))).toEqual([true, false, false])
    const withMain = pick(blank, main)
    expect([1, 2, 3].map((s) => canReach(withMain, s as 1 | 2 | 3))).toEqual([true, true, false])
    expect(canReach(pick(withMain, first), 3)).toBe(true)
  })

  it('says in plain words what still keeps the plan from being saved', () => {
    expect(saveBlocker(blank)).toMatch('المحطة الرئيسية')
    let draft = pick(blank, main)
    expect(saveBlocker(draft)).toMatch('بديلاً واحداً')
    draft = pick(pick(draft, first), second)
    expect(saveBlocker(draft)).toMatch('حمل المحطة الرئيسية')
    expect(saveBlocker(load(draft, 'main', '0'))).toMatch('حمل المحطة الرئيسية')
    draft = load(draft, 'main', '٣٢٠')
    expect(saveBlocker(draft)).toMatch('البديل ١')
    draft = load(draft, 0, '270')
    expect(saveBlocker(draft)).toMatch('البديل ٢')
    expect(saveBlocker(load(draft, 1, 'abc'))).toMatch('البديل ٢')
    draft = load(draft, 1, '285')
    expect(saveBlocker(draft)).toBeNull()
    expect(saveBlocker({ ...draft, rating: 'x' })).toMatch('سعة القاطع')
    expect(saveBlocker({ ...draft, rating: '350' })).toBeNull()

    // what is saved is the plan as clicked: exact places, the defaults of the sheet
    expect(toCase(draft)).toEqual({
      id: 'new',
      level: 'station',
      voltageKv: 13.8,
      main: { no: '7001', loadA: 320, at: [46.7, 24.7], layerId: 'a' },
      backups: [
        { no: '7002', loadA: 270, at: [46.71, 24.7], layerId: 'a' },
        { no: '7003', loadA: 285, at: [46.72, 24.7], layerId: 'a' },
      ],
    })
  })

  it('knows a draft that holds nothing from one that would be lost', () => {
    expect(isUntouched(blank)).toBe(true)
    expect(isUntouched(pick(blank, main))).toBe(false)
    expect(isUntouched(load(blank, 'main', '300'))).toBe(false)
    expect(isUntouched({ ...blank, note: 'x' })).toBe(false)
  })
})
