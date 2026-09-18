import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteMapLayer, listMapLayers, loadLayerFeatures, type MapLayer } from '../../services/mapLayers'
import type { CompactFeature } from './import/types'

/** A ticked layer whose features have arrived — what the map draws. */
export interface VisibleLayer {
  id: string
  /** The stored colour; the map translates it to the current theme. */
  color: string
  features: CompactFeature[]
}

export interface ImportedLayers {
  layers: MapLayer[]
  active: ReadonlySet<string>
  /** Ticked, and still on their way. */
  loading: ReadonlySet<string>
  failed: ReadonlySet<string>
  visible: VisibleLayer[]
  toggle: (layerId: string, on: boolean) => void
  hideAll: () => void
  /** Rejects when the layer could not be deleted. */
  remove: (layerId: string) => Promise<void>
  /** After an import: the list is read again and the given layers are fetched afresh. */
  refresh: (changed: string[]) => void
}

const without = <T>(set: ReadonlySet<T>, ...items: T[]) => new Set([...set].filter((item) => !items.includes(item)))

/**
 * The imported layers of a sector. Features are only fetched for a layer once it
 * is ticked. The state lives above the dashboard so it survives a reload of the
 * network; what the signed-in user may see is decided by the database rules.
 */
export function useMapLayers(sectorId: string | undefined, uid: string | undefined): ImportedLayers {
  const [layers, setLayers] = useState<MapLayer[]>([])
  const [active, setActive] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const [loaded, setLoaded] = useState<ReadonlyMap<string, CompactFeature[]>>(new Map())
  const [revision, setRevision] = useState(0)
  const pending = useRef(new Set<string>())

  useEffect(() => {
    if (!sectorId) return
    let cancelled = false
    listMapLayers(sectorId).then((list) => {
      if (cancelled) return
      // another sector or a signed-out user: what no longer exists is dropped
      const ids = new Set(list.map((layer) => layer.id))
      setLayers(list)
      setActive((current) => new Set([...current].filter((id) => ids.has(id))))
      setLoaded((current) => new Map([...current].filter(([id]) => ids.has(id))))
    })
    return () => {
      cancelled = true
    }
  }, [sectorId, uid, revision])

  useEffect(() => {
    if (!sectorId) return
    for (const id of active) {
      if (loaded.has(id) || failed.has(id) || pending.current.has(id)) continue
      pending.current.add(id)
      loadLayerFeatures(sectorId, id)
        .then((features) => setLoaded((current) => new Map(current).set(id, features)))
        .catch((error) => {
          console.error('map layers:', error)
          setFailed((current) => new Set(current).add(id))
        })
        .finally(() => pending.current.delete(id))
    }
  }, [sectorId, active, loaded, failed])

  const loading = useMemo(
    () => new Set([...active].filter((id) => !loaded.has(id) && !failed.has(id))),
    [active, loaded, failed],
  )

  const visible = useMemo(
    () =>
      layers.flatMap((layer): VisibleLayer[] => {
        const features = active.has(layer.id) && loaded.get(layer.id)
        return features ? [{ id: layer.id, color: layer.style.color, features }] : []
      }),
    [layers, active, loaded],
  )

  const toggle = useCallback((layerId: string, on: boolean) => {
    // ticking a layer that failed to load tries again
    setFailed((current) => without(current, layerId))
    setActive((current) => (on ? new Set(current).add(layerId) : without(current, layerId)))
  }, [])

  const hideAll = useCallback(() => setActive(new Set()), [])

  const remove = useCallback(
    async (layerId: string) => {
      if (!sectorId) return
      await deleteMapLayer(sectorId, layerId)
      setLayers((current) => current.filter((layer) => layer.id !== layerId))
      setActive((current) => without(current, layerId))
    },
    [sectorId],
  )

  const refresh = useCallback((changed: string[]) => {
    setFailed((current) => without(current, ...changed))
    setLoaded((current) => new Map([...current].filter(([id]) => !changed.includes(id))))
    setRevision((r) => r + 1)
  }, [])

  return { layers, active, loading, failed, visible, toggle, hideAll, remove, refresh }
}
