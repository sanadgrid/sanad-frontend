import { collection, doc, query, serverTimestamp, setDoc, Timestamp, where, type DocumentData } from 'firebase/firestore'
import { byteLength, chunkFeatures } from '../features/restoration/import/chunks'
import { layerIdOf } from '../features/restoration/import/layerId'
import { stationDirectory, type StationEntry } from '../features/restoration/import/stations'
import type { Bbox, CompactFeature, LayerCounts } from '../features/restoration/import/types'
import type { Visibility } from '../features/restoration/types'
import { isFirebaseConfigured } from '../lib/firebase'
import { db } from '../lib/firestore'
import { currentUid, isCurrentUserAdmin } from './auth'
import { cache, layersKey, onDataCleared, stationsProgressKey } from './cache'
import { applyIndexChanges, fitIndex, sortLayers, type IndexChange } from './layerIndex'
import { isDenied, isUnreachable, serverDocs, shared, withTimeout } from './reads'
import { commit, WRITE_OVERHEAD_BYTES, type Write } from './writes'

/** `mapLayers/{id}` — the descriptor of an imported layer; its features live in `mapLayerChunks`. */
export interface MapLayer {
  id: string
  sectorId: string
  visibility: Visibility
  name: string
  /** Folder path in the source file. */
  path: string
  sourceFile: string
  /** Milliseconds since the epoch; `null` until the server has stamped the write. */
  importedAt: number | null
  counts: LayerCounts
  bbox: Bbox
  chunks: number
  style: { color: string }
  /** Its station points, so one can be found without reading the layer. Absent until worked out for an older import. */
  stations?: StationEntry[]
  /** Set while the layer waits in the trash: hidden everywhere, its parts untouched. Milliseconds since the epoch. */
  deletedAt?: number
  deletedBy?: string
}

export interface LayerUpload {
  name: string
  path: string
  sourceFile: string
  counts: LayerCounts
  bbox: Bbox
  color: string
  features: CompactFeature[]
}

const LAYERS = 'mapLayers'
const CHUNKS = 'mapLayerChunks'
// one document per sector listing its layers, so the list costs one read however long it is
const INDEX = 'mapLayerIndex'
// real data never becomes public by being imported
const RESTRICTED: Visibility = 'restricted'

// Features are immutable once read: a layer ticked off and on again costs nothing.
const features = new Map<string, Promise<CompactFeature[]>>()

function toMapLayer(id: string, data: DocumentData): MapLayer {
  return {
    ...(data as Omit<MapLayer, 'id' | 'importedAt'>),
    id,
    importedAt: data.importedAt instanceof Timestamp ? data.importedAt.toMillis() : null,
  }
}

const sectorFilter = (sectorId: string) => where('sectorId', '==', sectorId)

/**
 * The layers the index lists; `null` when the sector has no index yet. A query
 * rather than a read by id: the rules refuse to look up a document that does
 * not exist, and "refused" would hide "not built yet".
 */
async function readIndex(sectorId: string): Promise<MapLayer[] | null> {
  const snap = await serverDocs(INDEX, query(collection(db, INDEX), sectorFilter(sectorId)))
  return snap.empty ? null : sortLayers((snap.docs[0].data().layers ?? []) as MapLayer[])
}

// one read per layer — only to build an index that is missing
async function readDescriptors(sectorId: string): Promise<MapLayer[]> {
  const snap = await serverDocs(LAYERS, query(collection(db, LAYERS), sectorFilter(sectorId)))
  return snap.docs.map((d) => toMapLayer(d.id, d.data()))
}

interface IndexUpdate {
  changes: IndexChange[]
  written: Promise<MapLayer[]>
}

// Layers are imported a few at a time, and each import changes the same index
// document. Updates wait for one another, and the changes that arrive while one
// is being written go out together in the next.
const waiting = new Map<string, IndexUpdate>()
let lastUpdate: Promise<unknown> = Promise.resolve()

async function writeIndex(sectorId: string, changes: IndexChange[]): Promise<MapLayer[]> {
  // an index that does not exist yet starts from the layers themselves
  const current = (await readIndex(sectorId)) ?? (await readDescriptors(sectorId))
  const layers = fitIndex(applyIndexChanges(current, changes))
  // through JSON: a field that is `undefined` would be refused
  const plain = JSON.parse(JSON.stringify(layers)) as MapLayer[]
  await setDoc(doc(db, INDEX, sectorId), { sectorId, visibility: RESTRICTED, layers: plain, updatedAt: serverTimestamp() })
  cache.set(layersKey(sectorId), await currentUid(), layers)
  return layers
}

function updateIndex(sectorId: string, changes: IndexChange[]): Promise<MapLayer[]> {
  const queued = waiting.get(sectorId)
  if (queued) {
    queued.changes.push(...changes)
    return queued.written
  }
  const update: IndexUpdate = { changes: [...changes], written: Promise.resolve([]) }
  update.written = lastUpdate.then(() => {
    // from here on, new changes belong to the next update
    waiting.delete(sectorId)
    return writeIndex(sectorId, update.changes)
  })
  lastUpdate = update.written.catch(() => {})
  waiting.set(sectorId, update)
  return update.written
}

/**
 * Never throws. Whoever is refused the query — not a member of this sector any
 * more — simply sees no imported layers, as does a session that just ended.
 */
export async function listMapLayers(sectorId: string): Promise<MapLayer[]> {
  if (!isFirebaseConfigured) return []
  const uid = await currentUid()
  if (!uid) return []
  return shared(`layers:${sectorId}:${uid}`, async () => {
    const key = layersKey(sectorId)
    const saved = cache.get<MapLayer[]>(key, uid)
    if (saved && cache.isFresh(saved)) return saved.value
    try {
      const listed = await withTimeout(readIndex(sectorId))
      // only an admin can write the index, so only an admin builds a missing one
      const layers = listed ?? ((await isCurrentUserAdmin()) ? await updateIndex(sectorId, []) : [])
      cache.set(key, uid, layers)
      return layers
    } catch (error) {
      console.warn('map layers: the list could not be read —', error)
      // a refusal is an answer too, and asking again on every load would cost a read each time
      if (isDenied(error)) cache.set(key, uid, [])
      return saved && isUnreachable(error) ? saved.value : []
    }
  })
}

const chunksOf = (sectorId: string, layerId: string) =>
  serverDocs(CHUNKS, query(collection(db, CHUNKS), sectorFilter(sectorId), where('layerId', '==', layerId)))

async function readFeatures(sectorId: string, layerId: string): Promise<CompactFeature[]> {
  const snap = await chunksOf(sectorId, layerId)
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => a.index - b.index)
    .flatMap((chunk) => JSON.parse(chunk.features) as CompactFeature[])
}

export function loadLayerFeatures(sectorId: string, layerId: string): Promise<CompactFeature[]> {
  const cached = features.get(layerId)
  if (cached) return cached
  const pending = readFeatures(sectorId, layerId)
  features.set(layerId, pending)
  // a failed read is not remembered, so ticking the layer again retries it
  pending.catch(() => features.delete(layerId))
  return pending
}

// one attempt per sector and page: a run that failed is not repeated until the page is opened again
const directoryRuns = new Map<string, DirectoryRun>()

// nothing read by one user outlives their session, in memory either
onDataCleared(() => {
  features.clear()
  directoryRuns.clear()
})
const PARALLEL_DIRECTORY_READS = 3

type Progress = (done: number, total: number) => void

interface DirectoryRun {
  finished: Promise<MapLayer[] | null>
  /** Everyone who asked while it runs is told how far it is. */
  watchers: Set<Progress>
  progress: [done: number, total: number] | null
}

async function buildStationDirectories(sectorId: string, uid: string, layers: MapLayer[], onProgress: Progress): Promise<MapLayer[]> {
  const queue = layers.filter((layer) => !layer.stations)
  const total = queue.length
  const key = stationsProgressKey(sectorId)
  const found = cache.get<Record<string, StationEntry[]>>(key, uid)?.value ?? {}
  let done = 0
  const worker = async () => {
    for (let layer = queue.shift(); layer; layer = queue.shift()) {
      // read for the list only: holding every layer of a sector in memory is not worth a later tick
      found[layer.id] ??= stationDirectory(await (features.get(layer.id) ?? readFeatures(sectorId, layer.id)))
      // nothing is left on the device of someone who signed out meanwhile
      if ((await currentUid()) !== uid) throw new Error('map layers: signed out while the station lists were read')
      cache.set(key, uid, found)
      onProgress((done += 1), total)
    }
  }
  onProgress(0, total)
  await Promise.all(Array.from({ length: PARALLEL_DIRECTORY_READS }, worker))
  // written once, at the end: until then the index is untouched, and what was found waits in the browser
  const updated = await updateIndex(sectorId, [{ stations: found }])
  cache.remove(key)
  return updated
}

/**
 * Layers imported before the index listed stations get their lists worked out
 * once, by the first admin who opens the page: every chunk of those layers is
 * read, and the index is written a single time. Never throws; `null` when
 * nothing was written (not an admin, or the run was cut short — it resumes on
 * the next visit from what it had found).
 */
export async function backfillStationDirectories(
  sectorId: string,
  layers: MapLayer[],
  onProgress: Progress = () => {},
): Promise<MapLayer[] | null> {
  if (!isFirebaseConfigured || layers.every((layer) => layer.stations)) return null
  const uid = await currentUid()
  // only an admin can write the index
  if (!uid || !(await isCurrentUserAdmin())) return null
  const running = directoryRuns.get(sectorId)
  if (running) {
    running.watchers.add(onProgress)
    if (running.progress) onProgress(...running.progress)
    return running.finished
  }
  const run: DirectoryRun = { finished: Promise.resolve(null), watchers: new Set([onProgress]), progress: null }
  const report: Progress = (done, total) => {
    run.progress = [done, total]
    for (const watcher of run.watchers) watcher(done, total)
  }
  run.finished = buildStationDirectories(sectorId, uid, layers, report)
    .catch((error) => {
      console.warn('map layers: the station lists could not be completed —', error)
      return null
    })
    .finally(() => {
      run.watchers.clear()
      run.progress = null
    })
  directoryRuns.set(sectorId, run)
  return run.finished
}

const removalsOf = async (sectorId: string, layerId: string): Promise<Write[]> =>
  (await chunksOf(sectorId, layerId)).docs.map((d) => ({ ref: d.ref, data: null, bytes: WRITE_OVERHEAD_BYTES }))

/**
 * Writes one layer, replacing an earlier import of the same folder. The rules
 * only accept this from an admin. Imported data is always restricted.
 * `onProgress` receives the fraction written so far, 0 → 1.
 */
export async function saveMapLayer(
  sectorId: string,
  layer: LayerUpload,
  onProgress: (fraction: number) => void = () => {},
): Promise<string> {
  if (!isFirebaseConfigured) throw new Error('map layers: the database is not configured')

  const layerId = layerIdOf(sectorId, layer.name, layer.path)
  const scope = { sectorId, visibility: RESTRICTED }
  const chunks = chunkFeatures(layer.features)
  const { name, path, sourceFile, counts, bbox, color } = layer
  const stations = stationDirectory(layer.features)
  const descriptor = { ...scope, name, path, sourceFile, counts, bbox, chunks: chunks.length, style: { color }, stations }

  const removals = await removalsOf(sectorId, layerId)
  const additions: Write[] = [
    ...chunks.map((features, index) => ({
      ref: doc(db, CHUNKS, `${layerId}_${index}`),
      data: { ...scope, layerId, index, features },
      bytes: byteLength(features) + WRITE_OVERHEAD_BYTES,
    })),
    // last, so a descriptor never announces chunks that were not written
    { ref: doc(db, LAYERS, layerId), data: { ...descriptor, importedAt: serverTimestamp() }, bytes: WRITE_OVERHEAD_BYTES },
  ]

  const total = removals.length + additions.length
  let done = 0
  const report = (count: number) => onProgress((done += count) / total)
  // the old chunks go first, in their own commits: a new import may have fewer of them
  await commit(removals, report)
  await commit(additions, report)
  features.delete(layerId)
  // the server's stamp cannot go inside a list; the browser's clock is close enough for the index
  await updateIndex(sectorId, [{ upsert: { ...descriptor, id: layerId, importedAt: Date.now() } }])
  return layerId
}

/** The parts of a layer, then its descriptor; the index is the caller's to update. */
async function removeLayerDocs(sectorId: string, layerId: string): Promise<void> {
  const descriptor: Write = { ref: doc(db, LAYERS, layerId), data: null, bytes: WRITE_OVERHEAD_BYTES }
  // the descriptor goes last: if this fails half-way the layer is still listed and can be deleted again
  await commit([...(await removalsOf(sectorId, layerId)), descriptor])
  features.delete(layerId)
}

/**
 * Into the trash, or out of it: the index alone changes — one read and one write
 * however many layers, and not one of their parts is read or deleted. Resolves
 * with the whole list, the trashed layers included.
 */
export async function trashMapLayers(sectorId: string, layerIds: string[]): Promise<MapLayer[]> {
  if (!isFirebaseConfigured) throw new Error('map layers: the database is not configured')
  return updateIndex(sectorId, [{ trash: layerIds, at: Date.now(), by: (await currentUid()) ?? undefined }])
}

export async function restoreMapLayers(sectorId: string, layerIds: string[]): Promise<MapLayer[]> {
  if (!isFirebaseConfigured) throw new Error('map layers: the database is not configured')
  return updateIndex(sectorId, [{ restore: layerIds }])
}

/** Only an admin can delete anything: for anyone else the expired layers simply stay hidden. */
export const canPurgeLayers = async () => isFirebaseConfigured && Boolean(await currentUid()) && isCurrentUserAdmin()

export interface RemovedLayers {
  removed: string[]
  /** The layer that could not be deleted; the ones after it were not tried. */
  failed: string | null
}

/**
 * For good — what `حذف نهائي` and the thirty days do, never a first deletion.
 * Several layers, one after the other, stopping at the first that fails. The
 * index is written once, at the end, for those that went — so a run cut short
 * still leaves the list true. Rejects only when that one write fails: the
 * layers are then gone but still listed, and deleting them again clears them.
 */
export async function deleteMapLayers(
  sectorId: string,
  layerIds: string[],
  onProgress: (done: number, total: number) => void = () => {},
): Promise<RemovedLayers> {
  if (!isFirebaseConfigured) throw new Error('map layers: the database is not configured')
  const removed: string[] = []
  let failed: string | null = null
  for (const layerId of layerIds) {
    try {
      await removeLayerDocs(sectorId, layerId)
    } catch (error) {
      console.error('map layers: a layer could not be deleted —', error)
      failed = layerId
      break
    }
    removed.push(layerId)
    onProgress(removed.length, layerIds.length)
  }
  if (removed.length > 0) await updateIndex(sectorId, removed.map((layerId) => ({ remove: layerId })))
  return { removed, failed }
}
