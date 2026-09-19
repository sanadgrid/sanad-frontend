import { describe, expect, it } from 'vitest'
import { buildDirectory } from '../features/restoration/backup/directory'
import { derivePlanNetwork } from '../features/restoration/backup/planNetwork'
import { searchStations } from '../features/restoration/import/stations'
import { findDuplicateLayers } from '../features/restoration/layerDuplicates'
import { applyIndexChanges, expiredLayers, LAYER_TRASH_DAYS, liveLayers, trashedLayers } from './layerIndex'
import type { MapLayer } from './mapLayers'

const DAY = 24 * 60 * 60_000
const NOW = 400 * DAY

const layer = (id: string, name: string, stations: string[], importedAt = 100): MapLayer => ({
  id,
  sectorId: 'central',
  visibility: 'restricted',
  name,
  path: id,
  sourceFile: 'synthetic.kmz',
  importedAt,
  counts: { point: stations.length, line: 0, polygon: 0 },
  bbox: [46.6, 24.6, 46.8, 24.8],
  chunks: 1,
  style: { color: '#123456' },
  stations: stations.map((no, i) => ({ no, c: [46.6 + i / 100, 24.6 + i / 100] })),
})

const listed = [layer('a', 'Zone A', ['7001', '7002']), layer('b', 'Zone A (2)', ['7001', '7002'], 200), layer('c', 'Zone C', ['7003'])]

describe('a deleted layer waits in the index', () => {
  const deleted = applyIndexChanges(listed, [{ trash: ['c'], at: NOW, by: 'admin-1' }])

  it('is marked, not removed — and nothing else about it changes', () => {
    expect(deleted).toHaveLength(3)
    const { deletedAt, deletedBy, ...rest } = deleted.find((l) => l.id === 'c') as MapLayer
    expect([deletedAt, deletedBy]).toEqual([NOW, 'admin-1'])
    expect(rest).toEqual(listed[2])
    // a second deletion does not restart its thirty days
    expect(applyIndexChanges(deleted, [{ trash: ['c'], at: NOW + DAY }]).find((l) => l.id === 'c')?.deletedAt).toBe(NOW)
  })

  it('is hidden from everything built on the list: the directory, the coverage, the search, the twins', () => {
    const live = liveLayers(deleted)
    expect(live.map((l) => l.id)).toEqual(['a', 'b'])
    expect(trashedLayers(deleted).map((l) => l.id)).toEqual(['c'])

    const directory = buildDirectory(live)
    expect(directory.has('7003')).toBe(false)
    expect(directory.size).toBe(2)
    const plan = { id: 'p', level: 'station' as const, voltageKv: 13.8, main: { no: '7003', loadA: 300 }, backups: [{ no: '7001', loadA: 200 }] }
    expect(derivePlanNetwork([plan], buildDirectory(listed)).coverage).toEqual({ planned: 1, imported: 3 })
    expect(derivePlanNetwork([plan], directory).coverage).toEqual({ planned: 0, imported: 2 })
    expect(searchStations(live, '7003', 10).total).toBe(0)

    // a twin in the trash is no twin: there is nothing left to clear
    expect(findDuplicateLayers(live).flatMap((g) => g.remove.map((l) => l.id))).toEqual(['b'])
    expect(findDuplicateLayers(liveLayers(applyIndexChanges(listed, [{ trash: ['b'], at: NOW }])))).toEqual([])
  })

  it('comes back exactly as it was', () => {
    expect(applyIndexChanges(deleted, [{ restore: ['c', 'never-listed'] }])).toEqual(applyIndexChanges(listed, []))
  })

  it('comes back, too, when it is imported again', () => {
    const again = applyIndexChanges(deleted, [{ upsert: layer('c', 'Zone C', ['7003', '7004']) }])
    expect(liveLayers(again).map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })

  it('is due for good after thirty days, and not a moment before', () => {
    const both = applyIndexChanges(deleted, [{ trash: ['a'], at: NOW + 10 * DAY }])
    expect(expiredLayers(both, NOW + LAYER_TRASH_DAYS * DAY - 1)).toEqual([])
    expect(expiredLayers(both, NOW + LAYER_TRASH_DAYS * DAY).map((l) => l.id)).toEqual(['c'])
    // the latest deletion first, as the list of the trash shows them
    expect(trashedLayers(both).map((l) => l.id)).toEqual(['a', 'c'])
    expect(applyIndexChanges(both, [{ remove: 'c' }]).map((l) => l.id)).toEqual(['a', 'b'])
  })
})
