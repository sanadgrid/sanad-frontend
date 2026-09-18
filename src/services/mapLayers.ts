import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore'
import { byteLength, chunkFeatures } from '../features/restoration/import/chunks'
import { layerIdOf } from '../features/restoration/import/layerId'
import type { Bbox, CompactFeature, LayerCounts } from '../features/restoration/import/types'
import type { Visibility } from '../features/restoration/types'
import { auth, db, isFirebaseConfigured } from '../lib/firebase'
import { withTimeout } from './restoration'

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
// real data never becomes public by being imported
const RESTRICTED: Visibility = 'restricted'
// A commit takes at most 500 writes and 10 MiB; stay clear of both.
const BATCH_OPS = 400
const BATCH_BYTES = 8_000_000
// field names, ids and the fixed fields of a write, generously
const WRITE_OVERHEAD_BYTES = 2_000

interface Write {
  ref: DocumentReference
  /** `null` deletes the document. */
  data: DocumentData | null
  bytes: number
}

// Features are immutable once read: a layer ticked off and on again costs nothing.
const cache = new Map<string, Promise<CompactFeature[]>>()

/** An admin is a user with a document in `admins/`; each user may read only their own. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  if (!isFirebaseConfigured) return false
  try {
    await auth.authStateReady()
    const uid = auth.currentUser?.uid
    return uid ? (await withTimeout(getDoc(doc(db, 'admins', uid)))).exists() : false
  } catch {
    return false
  }
}

function toMapLayer(id: string, data: DocumentData): MapLayer {
  return {
    ...(data as Omit<MapLayer, 'id' | 'importedAt'>),
    id,
    importedAt: data.importedAt instanceof Timestamp ? data.importedAt.toMillis() : null,
  }
}

/**
 * Never throws. Imported layers are restricted, so a visitor has none, and a
 * signed-in user who is not a member of the sector is refused the query — both
 * simply see no imported layers.
 */
export async function listMapLayers(sectorId: string): Promise<MapLayer[]> {
  if (!isFirebaseConfigured) return []
  try {
    await auth.authStateReady()
    if (!auth.currentUser) {
      // nothing read by the previous user outlives their session
      cache.clear()
      return []
    }
    const snap = await withTimeout(getDocs(query(collection(db, LAYERS), where('sectorId', '==', sectorId))))
    return snap.docs.map((d) => toMapLayer(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  } catch {
    return []
  }
}

const chunksOf = (sectorId: string, layerId: string) =>
  getDocs(query(collection(db, CHUNKS), where('sectorId', '==', sectorId), where('layerId', '==', layerId)))

async function readFeatures(sectorId: string, layerId: string): Promise<CompactFeature[]> {
  const snap = await chunksOf(sectorId, layerId)
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => a.index - b.index)
    .flatMap((chunk) => JSON.parse(chunk.features) as CompactFeature[])
}

export function loadLayerFeatures(sectorId: string, layerId: string): Promise<CompactFeature[]> {
  const cached = cache.get(layerId)
  if (cached) return cached
  const pending = readFeatures(sectorId, layerId)
  cache.set(layerId, pending)
  // a failed read is not remembered, so ticking the layer again retries it
  pending.catch(() => cache.delete(layerId))
  return pending
}

async function commit(writes: Write[], onCommitted: (count: number) => void) {
  let start = 0
  while (start < writes.length) {
    const batch = writeBatch(db)
    let end = start
    let bytes = 0
    while (end < writes.length && end - start < BATCH_OPS && (end === start || bytes + writes[end].bytes <= BATCH_BYTES)) {
      const { ref, data } = writes[end]
      if (data) batch.set(ref, data)
      else batch.delete(ref)
      bytes += writes[end].bytes
      end += 1
    }
    await batch.commit()
    onCommitted(end - start)
    start = end
  }
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

  const removals = await removalsOf(sectorId, layerId)
  const additions: Write[] = [
    ...chunks.map((features, index) => ({
      ref: doc(db, CHUNKS, `${layerId}_${index}`),
      data: { ...scope, layerId, index, features },
      bytes: byteLength(features) + WRITE_OVERHEAD_BYTES,
    })),
    // last, so a descriptor never announces chunks that were not written
    {
      ref: doc(db, LAYERS, layerId),
      data: { ...scope, name, path, sourceFile, importedAt: serverTimestamp(), counts, bbox, chunks: chunks.length, style: { color } },
      bytes: WRITE_OVERHEAD_BYTES,
    },
  ]

  const total = removals.length + additions.length
  let done = 0
  const report = (count: number) => onProgress((done += count) / total)
  // the old chunks go first, in their own commits: a new import may have fewer of them
  await commit(removals, report)
  await commit(additions, report)
  cache.delete(layerId)
  return layerId
}

export async function deleteMapLayer(sectorId: string, layerId: string): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('map layers: the database is not configured')
  const descriptor: Write = { ref: doc(db, LAYERS, layerId), data: null, bytes: WRITE_OVERHEAD_BYTES }
  // the descriptor goes last: if this fails half-way the layer is still listed and can be deleted again
  await commit([...(await removalsOf(sectorId, layerId)), descriptor], () => {})
  cache.delete(layerId)
}
