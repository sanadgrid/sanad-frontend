import { describe, expect, it } from 'vitest'
import type { Bbox } from './import/types'
import { findDuplicateLayers } from './layerDuplicates'

const BOX: Bbox = [46.6, 24.6, 46.8, 24.8]
const layer = (id: string, name: string, importedAt: number | null, patch: Record<string, unknown> = {}) => ({
  id,
  sectorId: 'central',
  name,
  importedAt,
  counts: { point: 12, line: 40, polygon: 1 },
  bbox: BOX,
  stations: [{ no: '7001' }, { no: '7002' }],
  ...patch,
})
const ids = (groups: ReturnType<typeof findDuplicateLayers>) => groups.map((g) => [g.keep.id, g.remove.map((l) => l.id)])

describe('twin layers of one imported file', () => {
  it('pairs identical twins and keeps the earlier import', () => {
    const found = findDuplicateLayers([layer('a', 'Zone A', 100), layer('b', 'Zone A (2)', 200), layer('c', 'Zone B', 100)])
    expect(ids(found)).toEqual([['a', ['b']]])
    // the earlier one stays even when it is the one that carries the suffix
    expect(ids(findDuplicateLayers([layer('a', 'Zone A', 300), layer('b', 'Zone A (2)', 200)]))).toEqual([['b', ['a']]])
  })

  it('keeps the plain name of two imported at the same moment, or never stamped', () => {
    expect(ids(findDuplicateLayers([layer('b', 'Zone A (2)', 100), layer('a', 'Zone A', 100)]))).toEqual([['a', ['b']]])
    expect(ids(findDuplicateLayers([layer('b', 'Zone A (2)', null), layer('a', 'Zone A', null)]))).toEqual([['a', ['b']]])
  })

  it('leaves alone layers that share a name but not their contents', () => {
    const base = layer('a', 'Zone A', 100)
    const others = [
      layer('b', 'Zone A (2)', 200, { counts: { point: 12, line: 41, polygon: 1 } }),
      layer('c', 'Zone A (3)', 200, { bbox: [46.6, 24.6, 46.8, 24.80002] }),
      layer('d', 'Zone A (4)', 200, { stations: [{ no: '7001' }] }),
    ]
    expect(findDuplicateLayers([base, ...others])).toEqual([])
    // a difference below a metre is the same extent, and a missing list is an empty one
    expect(ids(findDuplicateLayers([base, layer('e', 'Zone A (2)', 200, { bbox: [46.6, 24.6, 46.8, 24.800001] })]))).toEqual([['a', ['e']]])
    expect(ids(findDuplicateLayers([layer('f', 'Zone C', 1, { stations: undefined }), layer('g', 'Zone C (2)', 2, { stations: [] })]))).toEqual([['f', ['g']]])
  })

  it('groups three copies under the one that stays', () => {
    const found = findDuplicateLayers([layer('c', 'Zone A (3)', 300), layer('a', 'Zone A', 100), layer('b', 'Zone A (2)', 200)])
    expect(ids(found)).toEqual([['a', ['b', 'c']]])
  })

  it('reads the name without its copy suffix, its case or the space around it', () => {
    expect(ids(findDuplicateLayers([layer('a', ' zone a ', 100), layer('b', 'ZONE A (12)', 200)]))).toEqual([['a', ['b']]])
    expect(ids(findDuplicateLayers([layer('a', 'Zone A', 100), layer('b', 'Zone A(2)', 200)]))).toEqual([['a', ['b']]])
    // a number that is part of the name is not a copy suffix
    expect(findDuplicateLayers([layer('a', 'Zone 2', 100), layer('b', 'Zone 3', 200), layer('c', 'Zone (A)', 300)])).toEqual([])
    expect(findDuplicateLayers([layer('a', 'Phase (2) North', 100), layer('b', 'Phase North', 200)])).toEqual([])
  })

  it('never groups layers of different sectors', () => {
    expect(findDuplicateLayers([layer('a', 'Zone A', 100), layer('b', 'Zone A (2)', 200, { sectorId: 'eastern' })])).toEqual([])
  })
})
