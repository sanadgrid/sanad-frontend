import { describe, expect, it } from 'vitest'
import { baseStations, buildDirectory, placeKey } from './backup/directory'
import type { BackupCase } from './backup/model'
import { derivePlanNetwork } from './backup/planNetwork'
import { stationActionsOf } from './stationActions'

const layers = [
  { id: 'a', name: 'Layer A', stations: [{ no: '7001', c: [46.7, 24.7] as [number, number] }, { no: '7002', c: [46.71, 24.7] as [number, number] }, { no: '7003', c: [46.72, 24.7] as [number, number] }] },
  // the same 7003 again, and a 7002 that stands somewhere else
  { id: 'b', name: 'Layer B', stations: [{ no: '7003', c: [46.72, 24.7] as [number, number] }, { no: '7002', c: [46.8, 24.8] as [number, number] }, { no: '7100', c: [46.9, 24.9] as [number, number] }] },
]
const plan: BackupCase = { id: 'p1', level: 'station', voltageKv: 13.8, main: { no: '7001', loadA: 300, at: [46.7, 24.7] }, backups: [{ no: '7002', loadA: 200, at: [46.71, 24.7] }] }
const network = derivePlanNetwork([plan], buildDirectory(layers))
const drawn = new Set(network.nodes.keys())
const none = new Set<string>()
const numbers = (points: { no: string; layerId: string }[]) => points.map((p) => `${p.no}/${p.layerId}`)

describe('every station of the sector, as quiet squares', () => {
  it('marks each place once, whatever layers list it', () => {
    expect(numbers(baseStations(layers, none, none))).toEqual(['7001/a', '7002/a', '7003/a', '7002/b', '7100/b'])
    expect(baseStations([{ id: 'old-import-without-a-list' }], none, none)).toEqual([])
  })

  it('leaves a station of the plans to the plans — the main element and its backups alike', () => {
    expect(numbers(baseStations(layers, drawn, none))).toEqual(['7003/a', '7002/b', '7100/b'])
  })

  it('shows the station again as soon as its plan is deleted', () => {
    const after = derivePlanNetwork([], buildDirectory(layers))
    expect(numbers(baseStations(layers, new Set(after.nodes.keys()), none))).toContain('7001/a')
  })

  it('leaves the stations of a ticked layer to that layer, also where another layer lists the same place', () => {
    expect(numbers(baseStations(layers, none, new Set(['b'])))).toEqual(['7001/a', '7002/a'])
  })
})

describe('what the popup of a station offers', () => {
  const said: string[] = []
  const context = {
    network,
    canEdit: true,
    writing: false,
    onOpen: (id: string) => said.push(`open ${id}`),
    onEdit: (p: BackupCase) => said.push(`edit ${p.id}`),
    onStart: (s: { no: string }) => said.push(`start ${s.no}`),
  }
  const main = { no: '7001', at: { lat: 24.7, lng: 46.7 } }
  const backup = { no: '7002', at: { lat: 24.7, lng: 46.71 } }
  const free = { no: '7100', at: { lat: 24.9, lng: 46.9 } }

  it('starts a plan for a station that has none — a backup of another plan included', () => {
    expect(stationActionsOf(context)(free).map((a) => a.label)).toEqual(['بدء خطة لهذه المحطة'])
    expect(stationActionsOf(context)(backup).map((a) => a.label)).toEqual(['بدء خطة لهذه المحطة'])
    stationActionsOf(context)(free)[0].run()
    expect(said.pop()).toBe('start 7100')
  })

  it('opens the plan of a station that has one, and lets an admin change it', () => {
    expect(network.nodes.has(placeKey(main))).toBe(true)
    const actions = stationActionsOf(context)(main)
    expect(actions.map((a) => a.label)).toEqual(['فتح الخطة', 'تعديل الخطة'])
    actions.forEach((a) => a.run())
    expect(said.splice(0)).toEqual(['open p1', 'edit p1'])
  })

  it('offers a member nothing but to open a plan, and nobody anything while a plan is being written', () => {
    const member = stationActionsOf({ ...context, canEdit: false })
    expect(member(free)).toEqual([])
    expect(member(main).map((a) => a.label)).toEqual(['فتح الخطة'])
    expect(stationActionsOf({ ...context, writing: true })(main)).toEqual([])
  })
})
