import { collection, doc, getDocFromServer, query, where, type DocumentReference } from 'firebase/firestore'
import { isFirebaseConfigured } from '../lib/firebase'
import { db } from '../lib/firestore'
import { cache, networkKey, sectorsKey } from './cache'
import { countReads, serverDocs, shared } from './reads'
import { commit, WRITE_OVERHEAD_BYTES } from './writes'

// The synthetic network an earlier release published into the database: documents
// flagged `visibility: 'public'`. The dashboard no longer shows it; an admin may
// remove it. Nothing restricted is ever touched, and a sector document that is
// not public stays — it may be the owner's own.

/** In the order they go: what is built from the documents first, the sector last. */
export const LEGACY_KINDS = ['networkBundles', 'ties', 'feeders', 'substations', 'sectors'] as const
export type LegacyKind = (typeof LEGACY_KINDS)[number]

export interface LegacyFound {
  counts: Record<LegacyKind, number>
  total: number
  /** The sector has a document of its own that is not public: it is left alone. */
  sectorKept: boolean
}

export interface LegacyStore {
  /** One read per document found (at least one per collection), plus one for the sector document. */
  find: (sectorId: string) => Promise<LegacyFound>
  /** Deletes what `find` last found, in batches; resolves with how many went. Rejects where it stopped — asking again carries on. */
  remove: (sectorId: string, onProgress: (done: number) => void) => Promise<number>
}

const found = new Map<string, DocumentReference[]>()

async function find(sectorId: string): Promise<LegacyFound> {
  if (!isFirebaseConfigured) throw new Error('legacy network: the database is not configured')
  const counts: Record<LegacyKind, number> = { networkBundles: 0, ties: 0, feeders: 0, substations: 0, sectors: 0 }
  const refs: DocumentReference[] = []
  for (const kind of LEGACY_KINDS) {
    if (kind === 'sectors') continue
    const snap = await serverDocs(kind, query(collection(db, kind), where('sectorId', '==', sectorId), where('visibility', '==', 'public')))
    counts[kind] = snap.size
    refs.push(...snap.docs.map((d) => d.ref))
  }
  const sector = await getDocFromServer(doc(db, 'sectors', sectorId))
  countReads('sectors', 1)
  const isPublic = sector.exists() && sector.data().visibility === 'public'
  if (isPublic) {
    counts.sectors = 1
    refs.push(sector.ref)
  }
  found.set(sectorId, refs)
  return { counts, total: refs.length, sectorKept: sector.exists() && !isPublic }
}

async function remove(sectorId: string, onProgress: (done: number) => void): Promise<number> {
  const refs = found.get(sectorId) ?? []
  let done = 0
  try {
    // `commit` keeps every batch to 400 deletions
    await commit(
      refs.map((ref) => ({ ref, data: null, bytes: WRITE_OVERHEAD_BYTES })),
      (count) => onProgress((done += count)),
    )
  } finally {
    // what went is gone whatever happened next: the next look starts from the database
    found.delete(sectorId)
    cache.remove(networkKey(sectorId))
    cache.remove(sectorsKey())
  }
  return done
}

// asked twice at once — a dialog mounted twice — it is still counted once
export const legacyNetwork: LegacyStore = { find: (sectorId) => shared(`legacy:${sectorId}`, () => find(sectorId)), remove }
