import { collection, doc, query, serverTimestamp, setDoc, Timestamp, where, type DocumentData } from 'firebase/firestore'
import { byteLength, chunkFeatures } from '../features/restoration/import/chunks'
import { layerIdOf } from '../features/restoration/import/layerId'
import type { Bbox, CompactFeature, LayerCounts } from '../features/restoration/import/types'
import type { Visibility } from '../features/restoration/types'
import { db, isFirebaseConfigured } from '../lib/firebase'
import { currentUid, isCurrentUserAdmin } from './auth'
import { cache, layersKey } from './cache'
import { applyIndexChanges, sortLayers, type IndexChange } from './layerIndex'
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
  const layers = applyIndexChanges(current, changes)
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
 * Never throws. Imported layers are restricted, so a visitor has none — and is
 * not worth a read — and a signed-in user who is not a member of the sector is
 * refused the query: both simply see no imported layers.
 */
export async function listMapLayers(sectorId: string): Promise<MapLayer[]> {
  if (!isFirebaseConfigured) return []
  const uid = await currentUid()
  if (!uid) {
    // nothing read by the previous user outlives their session
    features.clear()
    return []
  }
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
  const descriptor = { ...scope, name, path, sourceFile, counts, bbox, chunks: chunks.length, style: { color } }

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

export async function deleteMapLayer(sectorId: string, layerId: string): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('map layers: the database is not configured')
  const descriptor: Write = { ref: doc(db, LAYERS, layerId), data: null, bytes: WRITE_OVERHEAD_BYTES }
  // the descriptor goes last: if this fails half-way the layer is still listed and can be deleted again
  await commit([...(await removalsOf(sectorId, layerId)), descriptor])
  features.delete(layerId)
  await updateIndex(sectorId, [{ remove: layerId }])
}
