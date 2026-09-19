import { describe, expect, it } from 'vitest'
import { demoNetwork } from '../demoData'
import type { Conditions } from '../types'
import { assessFeederCase, feederCase, stationFeeders } from './fromNetwork'
import { ampsToMva } from './units'

const AUGUST_PEAK: Conditions = { period: 7, scenario: 'peak' }
const JANUARY_NORMAL: Conditions = { period: 0, scenario: 'normal' }
const idOf = (ref: string) => {
  const [station, feeder] = ref.split('/')
  return `central-${station.toLowerCase()}-${feeder.toLowerCase()}`
}

describe('feeders of the demo network as backup cases', () => {
  it('lists a station’s feeders in amperes and MVA', () => {
    const rows = stationFeeders(demoNetwork, 'central-mdn-214', AUGUST_PEAK)
    expect(rows.map((r) => r.feeder.code)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5'])
    for (const r of rows) {
      expect(ampsToMva(r.loadA, 13.8)).toBeCloseTo(r.loadMva, 9)
      expect(r.loadingPct).toBeCloseTo((r.loadA / r.ratingA) * 100, 9)
      expect(r.backups).toBe(1)
    }
    const january = stationFeeders(demoNetwork, 'central-mdn-214', JANUARY_NORMAL)
    expect(january[0].loadA).toBeCloseTo(rows[0].loadA * 0.468, 9)
  })

  it('the backups of a feeder are the far ends of its ties', () => {
    const fc = feederCase(demoNetwork, idOf('MDN-217/F3'), AUGUST_PEAK)!
    expect(fc.case.main.no).toBe('MDN-217/F3')
    expect(fc.case.backups.map((b) => b.no).sort()).toEqual(['MDN-216/F1', 'MDN-218/F3'])
    expect(fc.case).toMatchObject({ level: 'feeder', voltageKv: 13.8 })
    expect(fc.backups.every((b) => b.tieIds.length === 1)).toBe(true)
    expect(fc.derating).toBe(0.87)
  })

  it('a feeder without ties restores nothing; an unknown feeder is no case', () => {
    const lonely = feederCase(demoNetwork, idOf('NG-107/F1'), AUGUST_PEAK)!
    expect(lonely.backups).toEqual([])
    expect(assessFeederCase(lonely)).toMatchObject({ ratio: 0, status: 'none' })
    expect(feederCase(demoNetwork, 'nowhere', AUGUST_PEAK)).toBeNull()
  })

  it('totals are consistent, and every assumption can only lower the result', () => {
    for (const feeder of demoNetwork.feeders) {
      const fc = feederCase(demoNetwork, feeder.id, AUGUST_PEAK)!
      const sheet = assessFeederCase(fc)
      const derated = assessFeederCase(fc, { derated: true, firmCapacity: false })
      const firm = assessFeederCase(fc, { derated: false, firmCapacity: true })
      const both = assessFeederCase(fc, { derated: true, firmCapacity: true })
      for (const r of [sheet, derated, firm, both]) {
        expect(r.restorableA + r.unrestorableA).toBeCloseTo(r.loadA, 9)
        expect(r.transfers.reduce((sum, t) => sum + t.transferA, 0)).toBeCloseTo(r.restorableA, 9)
        for (const t of r.transfers) expect(t.transferA).toBeLessThanOrEqual(t.spareA + 1e-9)
      }
      expect(derated.restorableA).toBeLessThanOrEqual(sheet.restorableA + 1e-9)
      expect(firm.restorableA).toBeLessThanOrEqual(sheet.restorableA + 1e-9)
      expect(both.restorableA).toBeLessThanOrEqual(Math.min(derated.restorableA, firm.restorableA) + 1e-9)
    }
  })

  it('derating is felt in August and not in January', () => {
    const changed = (conditions: Conditions) =>
      demoNetwork.feeders.filter((f) => {
        const fc = feederCase(demoNetwork, f.id, conditions)!
        return assessFeederCase(fc, { derated: true, firmCapacity: false }).totalSpareA < assessFeederCase(fc).totalSpareA
      }).length
    expect(changed(AUGUST_PEAK)).toBeGreaterThan(0)
    expect(changed(JANUARY_NORMAL)).toBe(0)
  })

  it('a receiving station’s firm capacity is never handed out twice', () => {
    for (const feeder of demoNetwork.feeders) {
      const fc = feederCase(demoNetwork, feeder.id, AUGUST_PEAK)!
      const r = assessFeederCase(fc, { derated: false, firmCapacity: true })
      const into = new Map<string, number>()
      fc.backups.forEach((b, i) => into.set(b.station.id, (into.get(b.station.id) ?? 0) + r.transfers[i].transferA))
      for (const b of fc.backups) expect(into.get(b.station.id)!).toBeLessThanOrEqual(b.stationSpareA + 1e-9)
    }
  })
})
