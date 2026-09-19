import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { expiredLayers, liveLayers, trashedLayers } from '../../services/layerIndex'
import {
  backfillStationDirectories,
  canPurgeLayers,
  deleteMapLayers,
  listMapLayers,
  loadLayerFeatures,
  restoreMapLayers,
  trashMapLayers,
  type MapLayer,
  type RemovedLayers,
} from '../../services/mapLayers'
import { featureCount, type CompactFeature } from './import/types'

/** Where the layers are kept. The page uses the database; anything with the same functions will do. */
export interface LayerSource {
  /** Every layer of the index, those waiting in the trash included. */
  list: (sectorId: string) => Promise<MapLayer[]>
  load: (sectorId: string, layerId: string) => Promise<CompactFeature[]>
  /** Into the trash and out of it: the list alone changes. Both resolve with the whole list. */
  trash: (sectorId: string, layerIds: string[]) => Promise<MapLayer[]>
  restore: (sectorId: string, layerIds: string[]) => Promise<MapLayer[]>
  /** For good: the parts of the layers are deleted. */
  removeMany: typeof deleteMapLayers
  canPurge: () => Promise<boolean>
  backfill: typeof backfillStationDirectories
}

const database: LayerSource = {
  list: listMapLayers,
  load: loadLayerFeatures,
  trash: trashMapLayers,
  restore: restoreMapLayers,
  removeMany: deleteMapLayers,
  canPurge: canPurgeLayers,
  backfill: backfillStationDirectories,
}

// Every part of a layer is a billed read and a download: a hundred layers ticked
// at once are fetched a few at a time, so the page stays responsive and the rest
// can still be called off.
const PARALLEL_LOADS = 4

/** A ticked layer whose features have arrived — what the map draws. */
export interface VisibleLayer {
  id: string
  /** The stored colour; the map translates it to the current theme. */
  color: string
  features: CompactFeature[]
}

export interface ImportedLayers {
  /** The layers in use. One waiting in the trash is not among them, so nothing built on this list knows it. */
  layers: MapLayer[]
  /** Deleted within the last thirty days, the latest first. */
  trashed: MapLayer[]
  active: ReadonlySet<string>
  /** Asked for, and still on their way. */
  loading: ReadonlySet<string>
  failed: ReadonlySet<string>
  visible: VisibleLayer[]
  /** The features that have arrived, by layer — of ticked layers and of those whose contents were opened. */
  contents: ReadonlyMap<string, CompactFeature[]>
  /** Set while the station lists of older layers are being worked out. */
  indexing: boolean
  toggle: (layerId: string, on: boolean) => void
  /** Many at once — the master checkbox. Layers with nothing to draw are left out; those already fetched show at once. */
  showMany: (layerIds: string[]) => void
  /** Hides them, and calls off those still waiting to be fetched. */
  hideMany: (layerIds: string[]) => void
  /** While layers shown together are still arriving: how many of them have. */
  bulk: { done: number; total: number } | null
  /** Fetches a layer's features without showing it: its contents are being listed. */
  request: (layerId: string) => void
  hideAll: () => void
  /** Into the trash: hidden at once, restorable for thirty days. Rejects when the list could not be written. */
  remove: (layerIds: string[]) => Promise<void>
  restore: (layerIds: string[]) => Promise<void>
  /** For good, one after the other, stopping at the first that fails; resolves with what went. */
  destroy: (layerIds: string[]) => Promise<RemovedLayers>
  /** What has waited in the trash for more than thirty days goes for good — an admin's visit to the list does it. */
  purgeExpired: () => void
  /** While several layers are being deleted for good: how many are gone. */
  removing: { done: number; total: number } | null
  /** After an import: the list is read again and the given layers are fetched afresh. */
  refresh: (changed: string[]) => void
}

const without = <T>(set: ReadonlySet<T>, ...items: T[]) => new Set([...set].filter((item) => !items.includes(item)))

/**
 * The imported layers of a sector. Features are only fetched for a layer once it
 * is ticked or its contents are opened. The state lives above the dashboard so it survives a reload of the
 * network; what the signed-in user may see is decided by the database rules.
 */
export function useMapLayers(sectorId: string | undefined, uid: string | undefined, source: LayerSource = database): ImportedLayers {
  const [listed, setListed] = useState<MapLayer[]>([])
  const [active, setActive] = useState<ReadonlySet<string>>(new Set())
  const [requested, setRequested] = useState<ReadonlySet<string>>(new Set())
  const [indexing, setIndexing] = useState(false)
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const [loaded, setLoaded] = useState<ReadonlyMap<string, CompactFeature[]>>(new Map())
  const [revision, setRevision] = useState(0)
  // the layers of the last "show all" that had to be fetched
  const [bulkIds, setBulkIds] = useState<string[]>([])
  const [removing, setRemoving] = useState<{ done: number; total: number } | null>(null)
  const pending = useRef(new Set<string>())

  useEffect(() => {
    if (!sectorId) return
    let cancelled = false
    source.list(sectorId).then((list) => {
      if (cancelled) return
      // another sector or a signed-out user: what no longer exists is dropped
      const ids = new Set(list.map((layer) => layer.id))
      setListed(list)
      setActive((current) => new Set([...current].filter((id) => ids.has(id))))
      setRequested((current) => new Set([...current].filter((id) => ids.has(id))))
      setLoaded((current) => new Map([...current].filter(([id]) => ids.has(id))))
    })
    return () => {
      cancelled = true
    }
  }, [sectorId, uid, revision, source])

  const layers = useMemo(() => liveLayers(listed), [listed])
  const trashed = useMemo(() => trashedLayers(listed), [listed])

  // Older layers do not list their stations yet. An admin's visit works the lists
  // out once; for anyone else this settles at once and changes nothing.
  useEffect(() => {
    if (!sectorId || layers.every((layer) => layer.stations)) return
    let cancelled = false
    source.backfill(sectorId, layers, () => !cancelled && setIndexing(true)).then((updated) => {
      if (cancelled) return
      setIndexing(false)
      if (updated) setListed(updated)
    })
    return () => {
      cancelled = true
      // a run that is still going says so again at its next step
      setIndexing(false)
    }
  }, [sectorId, layers, source])

  const wanted = useMemo(() => new Set([...active, ...requested]), [active, requested])

  useEffect(() => {
    if (!sectorId) return
    for (const id of wanted) {
      // the next ones start when one of these arrives: this runs again with every arrival
      if (pending.current.size >= PARALLEL_LOADS) break
      if (loaded.has(id) || failed.has(id) || pending.current.has(id)) continue
      pending.current.add(id)
      source
        .load(sectorId, id)
        .then((features) => {
          pending.current.delete(id)
          setLoaded((current) => new Map(current).set(id, features))
        })
        .catch((error) => {
          console.error('map layers:', error)
          pending.current.delete(id)
          setFailed((current) => new Set(current).add(id))
        })
    }
  }, [sectorId, wanted, loaded, failed, source])

  const loading = useMemo(
    () => new Set([...wanted].filter((id) => !loaded.has(id) && !failed.has(id))),
    [wanted, loaded, failed],
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

  const request = useCallback((layerId: string) => {
    setFailed((current) => without(current, layerId))
    setRequested((current) => new Set(current).add(layerId))
  }, [])

  const hideAll = useCallback(() => setActive(new Set()), [])

  const showMany = useCallback(
    (layerIds: string[]) => {
      const drawable = new Set(layers.filter((layer) => featureCount(layer.counts) > 0).map((layer) => layer.id))
      const ids = layerIds.filter((id) => drawable.has(id))
      setFailed((current) => without(current, ...ids))
      setActive((current) => new Set([...current, ...ids]))
      setBulkIds(ids.filter((id) => !loaded.has(id)))
    },
    [layers, loaded],
  )

  // a layer already on its way arrives anyway and is kept for later; the others are never asked for
  const hideMany = useCallback((layerIds: string[]) => {
    setActive((current) => without(current, ...layerIds))
    setBulkIds([])
  }, [])

  const bulk = useMemo(() => {
    const asked = bulkIds.filter((id) => active.has(id))
    const done = asked.filter((id) => loaded.has(id) || failed.has(id)).length
    return done < asked.length ? { done, total: asked.length } : null
  }, [bulkIds, active, loaded, failed])

  const remove = useCallback(
    async (layerIds: string[]) => {
      if (!sectorId) return
      setListed(await source.trash(sectorId, layerIds))
      setActive((current) => without(current, ...layerIds))
    },
    [sectorId, source],
  )

  const restore = useCallback(
    async (layerIds: string[]) => {
      if (sectorId) setListed(await source.restore(sectorId, layerIds))
    },
    [sectorId, source],
  )

  const destroy = useCallback(
    async (layerIds: string[]): Promise<RemovedLayers> => {
      if (!sectorId) return { removed: [], failed: null }
      setRemoving({ done: 0, total: layerIds.length })
      try {
        const result = await source.removeMany(sectorId, layerIds, (done, total) => setRemoving({ done, total }))
        // what is gone leaves the list, also when a later one stopped the run
        setListed((current) => current.filter((layer) => !result.removed.includes(layer.id)))
        setActive((current) => without(current, ...result.removed))
        return result
      } finally {
        setRemoving(null)
      }
    },
    [sectorId, source],
  )

  // once per list: a run that stopped half-way leaves the rest listed, and the next visit goes on from there
  const purged = useRef<MapLayer[] | null>(null)
  const purgeExpired = useCallback(() => {
    const expired = expiredLayers(listed, Date.now()).map((layer) => layer.id)
    if (expired.length === 0 || purged.current === listed) return
    purged.current = listed
    source
      .canPurge()
      .then((allowed) => (allowed ? destroy(expired) : null))
      .catch((error) => console.warn('map layers: the expired layers could not be cleared —', error))
  }, [listed, source, destroy])

  const refresh = useCallback((changed: string[]) => {
    setFailed((current) => without(current, ...changed))
    setLoaded((current) => new Map([...current].filter(([id]) => !changed.includes(id))))
    setRevision((r) => r + 1)
  }, [])

  return { layers, trashed, active, loading, failed, visible, contents: loaded, indexing, bulk, removing, toggle, showMany, hideMany, request, hideAll, remove, restore, destroy, purgeExpired, refresh }
}
