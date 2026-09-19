import {
  collection,
  doc,
  GeoPoint,
  getDocFromServer,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore'
import { demoNetwork } from '../features/restoration/demoData'
import type { Feeder, LatLng, Network, Sector, Substation, Tie, Visibility } from '../features/restoration/types'
import { isFirebaseConfigured } from '../lib/firebase'
import { db } from '../lib/firestore'
import type { Access } from './access'
import { currentUid, isCurrentUserAdmin } from './auth'
import { cache, networkKey, sectorsKey } from './cache'
import { bundlePartId, joinBundle, mergeNetworks, partitionByVisibility, splitBundle, type BundlePart } from './networkBundle'
import { countReads, isDenied, isUnreachable, serverDocs, shared, withTimeout } from './reads'
import { commit, WRITE_OVERHEAD_BYTES, type Write } from './writes'

export type NetworkSource = 'firestore' | 'demo'
export type SectorSummary = Pick<Sector, 'id' | 'nameAr' | 'nameEn'>

export interface LoadedNetwork {
  network: Network
  /** A saved copy of the live network still counts as live. */
  source: NetworkSource
  /**
   * Set when the database could not answer: `stale` — the network on screen is
   * the copy saved earlier; `unavailable` — there was none, this is the demo.
   */
  notice?: 'stale' | 'unavailable'
}

/**
 * `denied` — the database refused this user, or nobody is signed in. Whatever
 * let them in no longer holds, and they are shown nothing: not even the demo.
 */
export type LoadResult = LoadedNetwork | 'denied'

const BUNDLES = 'networkBundles'
const VISIBILITIES: Visibility[] = ['public', 'restricted']

/** When each bundle the network was built from was published; `null` — there is no such bundle. */
type Versions = Record<Visibility, number | null>

interface CachedNetwork {
  network: Network
  versions: Versions
}

const demo: LoadedNetwork = { network: demoNetwork, source: 'demo' }
const demoSectors: SectorSummary[] = [
  { id: demoNetwork.sector.id, nameAr: demoNetwork.sector.nameAr, nameEn: demoNetwork.sector.nameEn },
]
const live = (network: Network): LoadedNetwork => ({ network, source: 'firestore' })

// Firestore stores positions as GeoPoint; the app works with plain { lat, lng }.
const toLatLng = (point: GeoPoint): LatLng => ({ lat: point.latitude, lng: point.longitude })
const toGeoPoint = ({ lat, lng }: LatLng) => new GeoPoint(lat, lng)

/**
 * The parts of one bundle — or only its first part, which carries the version
 * and, for all but a very large sector, the whole network. A query rather than
 * a read by id: the rules refuse to look up a document that does not exist, and
 * "refused" would hide "not published yet". The rules answer an admin or a
 * member of the sector, which is why `sectorId` is part of the query.
 */
async function readParts(sectorId: string, visibility: Visibility, firstOnly: boolean): Promise<BundlePart[]> {
  const filters = [where('sectorId', '==', sectorId), where('visibility', '==', visibility)]
  const snap = await serverDocs(BUNDLES, query(collection(db, BUNDLES), ...filters, ...(firstOnly ? [where('index', '==', 0)] : [])))
  return snap.docs.map((d) => {
    const { index, count, version, payload } = d.data()
    return { index, count, version, payload }
  })
}

/**
 * The published network — the demo bundle and the real one, merged; `null` when
 * nothing is published. With `known` versions it first asks whether anything
 * changed — one document per bundle — and answers `unchanged` without reading further.
 */
async function readBundles(sectorId: string, known: Versions | null): Promise<CachedNetwork | 'unchanged' | null> {
  const scopes = VISIBILITIES
  const firsts = known ? await Promise.all(scopes.map((v) => readParts(sectorId, v, true))) : null
  if (known && firsts?.every((parts, i) => (parts[0]?.version ?? null) === known[scopes[i]])) return 'unchanged'

  const [open, restricted] = await Promise.all(
    scopes.map(async (visibility, i) => {
      const first = firsts?.[i]
      const whole = first && (first.length === 0 || first[0].count === 1)
      const parts = whole ? first : await readParts(sectorId, visibility, false)
      return parts.length > 0 ? joinBundle(parts) : null
    }),
  )
  const network = mergeNetworks(open?.network ?? null, restricted?.network ?? null)
  if (!network || network.substations.length === 0) return null
  return { network, versions: { public: open?.version ?? null, restricted: restricted?.version ?? null } }
}

/** The network document by document — what an admin edits, and what the bundles are built from. */
async function readGranular(sectorId: string): Promise<Network | null> {
  const sectorSnap = await getDocFromServer(doc(db, 'sectors', sectorId)).catch((error) => {
    if (isDenied(error)) return null
    throw error
  })
  countReads('sectors', 1)
  if (!sectorSnap?.exists()) return null

  const scoped = (name: string) => serverDocs(name, query(collection(db, name), where('sectorId', '==', sectorId)))
  const [substations, feeders, ties] = await Promise.all([scoped('substations'), scoped('feeders'), scoped('ties')])
  if (substations.empty) return null

  const sector = sectorSnap.data()
  return {
    sector: { ...sector, id: sectorSnap.id, center: toLatLng(sector.center) } as Sector,
    substations: substations.docs.map((d) => {
      const data = d.data()
      return { ...data, id: d.id, location: toLatLng(data.location) } as Substation
    }),
    feeders: feeders.docs.map((d) => ({ ...d.data(), id: d.id }) as Feeder),
    ties: ties.docs.map((d) => ({ ...d.data(), id: d.id }) as Tie),
  }
}

/**
 * Writes the bundles of a network under a fresh version and removes the parts a
 * larger, earlier bundle left behind. `whole` — the network is everything the
 * sector has, so a visibility without documents loses its bundle.
 */
async function writeBundles(network: Network, whole: boolean): Promise<Versions> {
  const sectorId = network.sector.id
  const version = Date.now()
  const bundles = partitionByVisibility(network)
  const versions: Versions = { public: null, restricted: null }
  const writes: Write[] = []

  for (const visibility of VISIBILITIES) {
    const bundle = bundles[visibility]
    if (!bundle && !whole) continue
    const payloads = bundle ? splitBundle(bundle) : []
    const [previous] = await readParts(sectorId, visibility, true)
    payloads.forEach((payload, index) =>
      writes.push({
        ref: doc(db, BUNDLES, bundlePartId(sectorId, visibility, index)),
        data: { sectorId, visibility, index, count: payloads.length, version, payload },
        bytes: payload.length * 3 + WRITE_OVERHEAD_BYTES,
      }),
    )
    for (let index = payloads.length; index < (previous?.count ?? 0); index += 1) {
      writes.push({ ref: doc(db, BUNDLES, bundlePartId(sectorId, visibility, index)), data: null, bytes: WRITE_OVERHEAD_BYTES })
    }
    if (bundle) versions[visibility] = version
  }

  await commit(writes)
  return versions
}

// what was saved for this sector no longer matches the database
function forgetSector(sectorId: string) {
  cache.remove(networkKey(sectorId))
  cache.remove(sectorsKey())
}

/**
 * Rebuilds the bundles of a sector from its documents — how a database filled
 * before bundles existed gets its first one. The rules only accept this from an
 * admin. Returns the network it published, `null` when the sector has none.
 */
export async function publishBundle(sectorId: string): Promise<Network | null> {
  if (!isFirebaseConfigured) throw new Error('Firebase غير مهيأ في هذه النسخة')
  const network = await readGranular(sectorId)
  if (!network) return null
  await writeBundles(network, true)
  forgetSector(sectorId)
  return network
}

// Nothing is published, and an admin is looking: read the documents one by one,
// as the page used to, and publish them in passing so nobody has to again.
async function bootstrap(sectorId: string, uid: string, key: string): Promise<Network | null> {
  const network = await withTimeout(readGranular(sectorId))
  if (!network) return null
  writeBundles(network, true)
    .then((versions) => cache.set<CachedNetwork>(key, uid, { network, versions }))
    .catch((error) => console.warn('restoration: the network could not be published as a bundle —', error))
  return network
}

async function refresh(
  sectorId: string,
  uid: string,
  key: string,
  saved: CachedNetwork | null,
  shown: LoadedNetwork | null,
): Promise<LoadResult> {
  try {
    const read = await withTimeout(readBundles(sectorId, saved?.versions ?? null))
    if (read === 'unchanged' && shown) {
      cache.touch(key)
      return shown
    }
    if (read && read !== 'unchanged') {
      cache.set<CachedNetwork>(key, uid, read)
      return live(read.network)
    }
    cache.remove(key)
    const network = (await isCurrentUserAdmin()) ? await bootstrap(sectorId, uid, key) : null
    return network ? live(network) : demo
  } catch (error) {
    console.warn('restoration: the network could not be read —', error)
    if (isDenied(error)) {
      // not theirs to see any more, so the saved copy goes too
      cache.remove(key)
      return 'denied'
    }
    if (shown) return isUnreachable(error) ? { ...shown, notice: 'stale' } : shown
    return isUnreachable(error) ? { ...demo, notice: 'unavailable' } : demo
  }
}

interface Load {
  /** What the saved copy lets the page show straight away. */
  first: LoadedNetwork | null
  final: Promise<LoadResult>
}

const loads = new Map<string, Load>()

function startLoad(sectorId: string, uid: string): Load {
  const key = networkKey(sectorId)
  const saved = cache.get<CachedNetwork>(key, uid)
  const first = saved ? live(saved.value.network) : null
  if (saved && first && cache.isFresh(saved)) return { first, final: Promise.resolve(first) }
  return { first, final: refresh(sectorId, uid, key, saved?.value ?? null, first) }
}

/**
 * For whoever the gate let in; never throws. For them, anything short of a
 * complete published network yields the bundled demo network — a sector that
 * was never published has to show something for an admin to publish. A saved
 * copy is returned at once; when the database then turns out to hold something
 * newer — or cannot be reached, or refuses — `onRefresh` receives the result
 * that replaces it.
 */
export async function loadNetwork(sectorId: string, onRefresh: (result: LoadResult) => void = () => {}): Promise<LoadResult> {
  // only the test build gets this far without a project behind it (see RestorationGate.tsx)
  if (!isFirebaseConfigured) return demo
  const uid = await currentUid()
  if (!uid) return 'denied'

  // one load per sector and user at a time, however many callers ask
  const loadKey = `${sectorId}:${uid}`
  let load = loads.get(loadKey)
  if (!load) {
    const started = startLoad(sectorId, uid)
    load = started
    loads.set(loadKey, started)
    void started.final.finally(() => {
      if (loads.get(loadKey) === started) loads.delete(loadKey)
    })
  }

  const { first, final } = load
  if (!first) return final
  void final.then((result) => {
    if (result !== first) onRefresh(result)
  })
  return first
}

// a sector the user belongs to but nobody has described yet still needs a line in the list
const unnamed = (id: string): SectorSummary => demoSectors.find((s) => s.id === id) ?? { id, nameAr: id, nameEn: id }

async function readSectors(access: Access): Promise<SectorSummary[]> {
  const summary = (id: string, data: DocumentData): SectorSummary => ({ id, nameAr: data.nameAr, nameEn: data.nameEn })
  if (access.role === 'admin') {
    const snap = await serverDocs('sectors', collection(db, 'sectors'))
    return snap.docs.map((d) => summary(d.id, d.data()))
  }
  // The rules refuse a member the whole collection, but answer for each sector
  // they belong to — one read each, and the list is theirs alone.
  const snaps = await Promise.all(access.sectors.map((id) => getDocFromServer(doc(db, 'sectors', id))))
  countReads('sectors', snaps.length)
  return snaps.map((snap) => (snap.exists() ? summary(snap.id, snap.data()) : unnamed(snap.id)))
}

const sameSectors = (list: SectorSummary[], ids: string[]) => list.length === ids.length && list.every((s) => ids.includes(s.id))

/** The sectors this user may choose from: all of them for an admin, their own for a member. Never throws, never empty. */
export async function listSectors(access: Access): Promise<SectorSummary[]> {
  if (!isFirebaseConfigured) return demoSectors
  const uid = await currentUid()
  const fallback = access.role === 'admin' ? demoSectors : access.sectors.map(unnamed)
  if (!uid) return fallback
  return shared(`sectors:${uid}`, async () => {
    const key = sectorsKey()
    const found = cache.get<SectorSummary[]>(key, uid)
    // a member whose sectors changed since the list was saved reads it again
    const saved = found && (access.role === 'admin' || sameSectors(found.value, access.sectors)) ? found : null
    if (saved && cache.isFresh(saved)) return saved.value
    try {
      const list = await withTimeout(readSectors(access))
      if (list.length === 0) return fallback
      cache.set(key, uid, list)
      return list
    } catch (error) {
      console.warn('restoration: the sectors could not be read —', error)
      return saved?.value ?? fallback
    }
  })
}

/**
 * Writes a whole network: its documents, which stay the source of truth for
 * editing, and the bundle the page reads. The rules only accept this from a
 * signed-in admin.
 */
export async function seedNetwork(network: Network): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('Firebase غير مهيأ في هذه النسخة')

  // the document id carries `id`, so it is not repeated inside the document
  const { id: sectorId, center, ...sector } = network.sector
  const write = (name: string, id: string, data: DocumentData): Write => ({ ref: doc(db, name, id), data, bytes: WRITE_OVERHEAD_BYTES })
  const writes = [
    write('sectors', sectorId, { ...sector, center: toGeoPoint(center) }),
    ...network.substations.map(({ id, location, ...rest }) => write('substations', id, { ...rest, location: toGeoPoint(location) })),
    ...network.feeders.map(({ id, ...rest }) => write('feeders', id, rest)),
    ...network.ties.map(({ id, ...rest }) => write('ties', id, rest)),
  ]

  try {
    await commit(writes)
    // last, so a bundle never announces documents that were not written
    await writeBundles(network, false)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`تعذّر رفع البيانات: ${reason}`, { cause: error })
  } finally {
    forgetSector(sectorId)
  }
}
