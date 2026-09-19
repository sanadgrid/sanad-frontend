import { describe, expect, it } from 'vitest'
import { summarize } from '../../restoration/backup/model'
import { proof } from '../content'
import { pictureAt, RATING_MAX_A, RATING_MIN_A } from './assess'
import { feeders } from './dataset'

// The landing page's calculator must tell the same story as the model's own
// calibration — these are the three figures the page is built around.
describe('the proof calculator', () => {
  it.each([
    [400, '94.0', 525, { full: 9, high: 21, limited: 0, none: 0 }],
    [348, '60.3', 3475, { full: 0, high: 3, limited: 27, none: 0 }],
    [320, '41.1', 5155, { full: 0, high: 0, limited: 30, none: 0 }],
  ])('%i A → %s %% restored, %i A unrestored', (ratingA, percent, unrestorableA, byStatus) => {
    const p = pictureAt(ratingA)
    expect(p.percent.toFixed(1)).toBe(percent)
    expect(p.unrestorableA).toBe(unrestorableA)
    expect(p.byStatus).toEqual(byStatus)
    expect(p.loadA).toBe(8755)
    expect(p.cells).toHaveLength(30)
  })

  it('agrees with the model summary at every ampere of the slider', () => {
    for (let ratingA = RATING_MIN_A; ratingA <= RATING_MAX_A; ratingA += 1) {
      const { total } = summarize(feeders, () => '', { ratingA })
      const p = pictureAt(ratingA)
      expect(p.unrestorableA).toBe(total.unrestorableA)
      expect(p.byStatus).toEqual(total.byStatus)
    }
  })

  it('never restores less when the rating goes up', () => {
    let last = -1
    for (let ratingA = RATING_MIN_A; ratingA <= RATING_MAX_A; ratingA += 1) {
      const { percent } = pictureAt(ratingA)
      expect(percent).toBeGreaterThanOrEqual(last)
      last = percent
    }
  })

  it('names exactly the three stops, inside the slider range', () => {
    expect(proof.stops.map((s) => s.ratingA)).toEqual([400, 348, 320])
  })
})
