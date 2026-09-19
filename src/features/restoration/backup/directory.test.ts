import { describe, expect, it } from 'vitest'
import type { Position } from '../import/types'
import { allPoints, buildDirectory, directoryBounds, distanceKm, locate, placeOf, placesOf, suggest } from './directory'

const at = (lng: number, lat: number): Position => [lng, lat]

const layers = [
  { id: 'a', name: 'Layer A', stations: [{ no: '7001', c: at(46.7, 24.7) }, { no: '7002', n: 'S/S_7002 North', c: at(46.8, 24.8) }] },
  { id: 'b', name: 'Layer B', stations: [{ no: '7001', c: at(46.71, 24.71) }, { no: '7100', c: at(46.9, 24.9) }] },
  { id: 'old-import-without-a-list' },
]

describe('station directory of the imported layers', () => {
  const directory = buildDirectory(layers)

  it('keeps the first place of a station and every layer that lists it', () => {
    expect(locate(directory, '7001')).toMatchObject({ no: '7001', name: 'S/S 7001', at: { lat: 24.7, lng: 46.7 }, layerId: 'a', layerIds: ['a', 'b'] })
    expect(locate(directory, '7002')?.name).toBe('S/S_7002 North')
  })

  it('finds a feeder where its station stands, and digits typed on an Arabic keyboard', () => {
    expect(locate(directory, '7001/F3')?.no).toBe('7001')
    expect(locate(directory, ' ٧١٠٠ ')?.no).toBe('7100')
    expect(locate(directory, '7999')).toBeNull()
    expect(locate(directory, '')).toBeNull()
  })

  it('suggests numbers that start with what was typed, then those that contain it', () => {
    expect(suggest(directory, '70', 5).map((s) => s.no)).toEqual(['7001', '7002'])
    expect(suggest(directory, '00', 5).map((s) => s.no)).toEqual(['7001', '7002', '7100'])
    expect(suggest(directory, '7', 2)).toHaveLength(2)
    expect(suggest(directory, 'abc', 5)).toEqual([])
  })
})

describe('one number at several places', () => {
  // 7005 stands at three points of one layer; a second layer lists one of them again, and a fourth
  const directory = buildDirectory([
    { id: 'a', name: 'Layer A', stations: [{ no: '7005', c: at(46.7, 24.7) }, { no: '7005', n: '7005 T2', c: at(46.72, 24.7) }, { no: '7005', c: at(46.7, 24.73) }, { no: '7006', c: at(46.75, 24.75) }] },
    { id: 'b', name: 'Layer B', stations: [{ no: '7005', c: at(46.7, 24.7) }, { no: '7005', c: at(46.8, 24.8) }] },
  ])

  it('keeps every distinct place, and counts a place listed twice once', () => {
    const places = placesOf(directory, '7005')
    expect(places.map((p) => [p.at.lng, p.at.lat, p.layerId])).toEqual([[46.7, 24.7, 'a'], [46.72, 24.7, 'a'], [46.7, 24.73, 'a'], [46.8, 24.8, 'b']])
    expect(places[1]).toMatchObject({ name: '7005 T2', layerName: 'Layer A' })
    expect(locate(directory, '7005')?.layerIds).toEqual(['a', 'b'])
    expect(placesOf(directory, '7006')).toHaveLength(1)
    expect(placesOf(directory, '7999')).toEqual([])
    expect(placesOf(directory, '7005/F2')).toHaveLength(4)
  })

  it('lists every place for picking on the map, and frames them all', () => {
    expect(allPoints(directory)).toHaveLength(5)
    expect(directoryBounds(directory)).toEqual([{ lat: 24.7, lng: 46.7 }, { lat: 24.8, lng: 46.8 }])
    expect(directoryBounds(buildDirectory([]))).toBeNull()
  })

  it('draws an element at the place it names, else at the first place of its number', () => {
    expect(placeOf(directory, { no: '7005', at: at(46.7, 24.73) })).toEqual({ lat: 24.73, lng: 46.7 })
    expect(placeOf(directory, { no: '7005' })).toEqual({ lat: 24.7, lng: 46.7 })
    // a named place stands even when the layers no longer know the number
    expect(placeOf(directory, { no: '7999', at: at(46.5, 24.5) })).toEqual({ lat: 24.5, lng: 46.5 })
    expect(placeOf(directory, { no: '7999' })).toBeNull()
  })

  it('measures how far one place is from another', () => {
    // one hundredth of a degree of latitude is about 1.11 km anywhere
    expect(distanceKm({ lat: 24.7, lng: 46.7 }, { lat: 24.71, lng: 46.7 })).toBeCloseTo(1.112, 2)
    expect(distanceKm({ lat: 24.7, lng: 46.7 }, { lat: 24.7, lng: 46.7 })).toBe(0)
  })
})
