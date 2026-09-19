import { describe, expect, it } from 'vitest'
import { buildDirectory, locate, suggest } from './directory'

const layers = [
  { id: 'a', stations: [{ no: '7001', c: [46.7, 24.7] as [number, number] }, { no: '7002', n: 'S/S_7002 North', c: [46.8, 24.8] as [number, number] }] },
  { id: 'b', stations: [{ no: '7001', c: [46.71, 24.71] as [number, number] }, { no: '7100', c: [46.9, 24.9] as [number, number] }] },
  { id: 'old-import-without-a-list' },
]

describe('station directory of the imported layers', () => {
  const directory = buildDirectory(layers)

  it('keeps the first place of a station and every layer that lists it', () => {
    expect(locate(directory, '7001')).toEqual({ no: '7001', name: 'S/S 7001', at: { lat: 24.7, lng: 46.7 }, layerIds: ['a', 'b'] })
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
