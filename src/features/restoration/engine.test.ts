import { describe, expect, it } from 'vitest'
import { demoNetwork } from './demoData'
import { assessNetwork, derating, firmCapacity, loadFactor, type Status } from './engine'
import type { Conditions } from './types'

// These pin what the engine says about the synthetic demo network today, so a
// change to it that moves the dashboard's figures has to be a deliberate one.

const AUGUST_PEAK: Conditions = { period: 7, scenario: 'peak' }
const JANUARY_NORMAL: Conditions = { period: 0, scenario: 'normal' }

const byCode = (conditions: Conditions) => {
  const results = assessNetwork(demoNetwork, conditions)
  return new Map(demoNetwork.substations.map((s) => [s.code, results.get(s.id)!]))
}

const statusCounts = (conditions: Conditions) => {
  const counts: Record<Status, number> = { full: 0, high: 0, limited: 0, none: 0 }
  for (const a of assessNetwork(demoNetwork, conditions).values()) counts[a.status] += 1
  return counts
}

describe('engine on the demo network', () => {
  it('assesses every station', () => {
    expect(assessNetwork(demoNetwork, AUGUST_PEAK).size).toBe(19)
  })

  it('August at peak: 3 full / 6 high / 9 limited / 1 none', () => {
    expect(statusCounts(AUGUST_PEAK)).toEqual({ full: 3, high: 6, limited: 9, none: 1 })
  })

  it('January on a normal day: 10 full / 3 high / 5 limited / 1 none', () => {
    expect(statusCounts(JANUARY_NORMAL)).toEqual({ full: 10, high: 3, limited: 5, none: 1 })
  })

  it('the forecast peak leaves no station fully restorable', () => {
    expect(statusCounts({ period: 'forecast', scenario: 'peak' })).toEqual({ full: 0, high: 5, limited: 13, none: 1 })
  })

  it('a station with no tie at its own voltage restores nothing', () => {
    const lonely = byCode(AUGUST_PEAK).get('NG-107')!
    expect(lonely).toMatchObject({ capacityPct: 0, status: 'none', n1: false, transfers: [] })
    expect(lonely.unrestoredMva).toBe(lonely.loadMva)
    expect(byCode(JANUARY_NORMAL).get('NG-107')!.capacityPct).toBe(0)
  })

  it('pins a full, a high and a limited station in August', () => {
    const august = byCode(AUGUST_PEAK)
    expect(august.get('NG-101')).toMatchObject({ capacityPct: 100, loadMva: 47.3, unrestoredMva: 0, n1: true })
    expect(august.get('NG-102')).toMatchObject({ capacityPct: 89, loadMva: 69.9, unrestoredMva: 7.6, status: 'high' })
    expect(august.get('NG-103')).toMatchObject({ capacityPct: 12, loadMva: 122.9, unrestoredMva: 108.4, status: 'limited' })
  })

  it('what is restored and what is not add up to the load', () => {
    for (const a of assessNetwork(demoNetwork, AUGUST_PEAK).values())
      expect(a.restoredRemoteMva + a.restoredManualMva + a.unrestoredMva).toBeCloseTo(a.loadMva, 0)
  })

  it('load factor, derating and firm capacity', () => {
    expect(loadFactor(demoNetwork, AUGUST_PEAK)).toBe(1)
    expect(loadFactor(demoNetwork, JANUARY_NORMAL)).toBeCloseTo(0.468, 9)
    expect(loadFactor(demoNetwork, { period: 'forecast', scenario: 'peak' })).toBeCloseTo(1.05, 9)
    expect(derating(demoNetwork, AUGUST_PEAK)).toBe(0.87)
    expect(derating(demoNetwork, JANUARY_NORMAL)).toBe(1)
    expect(firmCapacity({ ...demoNetwork.substations[0], transformersMva: [60, 60, 40] })).toBe(100)
  })
})
