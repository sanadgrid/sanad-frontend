import { useMemo } from 'react'
import { baseStations } from './backup/directory'
import type { MapNode } from './components/planNetworkLayers'
import type { ImportedLayers } from './useMapLayers'
import { useStoredFlag } from './useStoredFlag'

const STORAGE_KEY = 'sanad.rc.stations'

/**
 * Every station of the sector as a quiet square under the plans: what the map
 * shows before there is any plan, and what stays when one is deleted. A station
 * the plans draw, or a ticked layer, is left to them. Reads nothing.
 */
export function useBaseStations(imported: ImportedLayers, nodes: MapNode[]) {
  const [on, setOn] = useStoredFlag(STORAGE_KEY, true)
  const { layers, visible } = imported
  const drawn = useMemo(() => new Set(nodes.map((node) => node.key)), [nodes])
  const shown = useMemo(() => new Set(visible.map((layer) => layer.id)), [visible])
  const points = useMemo(() => (on ? baseStations(layers, drawn, shown) : null), [on, layers, drawn, shown])
  return { on, setOn, points }
}
