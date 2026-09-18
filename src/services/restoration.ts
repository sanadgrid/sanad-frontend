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
import { db, isFirebaseConfigured } from '../lib/firebase'
import { currentUid, isCurrentUserAdmin } from './auth'
import { cache, networkKey, scopeOf, sectorsKey } from './cache'
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

// Matches the network rules in the backend repo: a visitor may only read public
// documents, and a query that could return anything else is rejected as a whole —
// so the visibility filter is part of the query, not applied afterwards.
const visibilityFilter = (publicOnly: boolean) => (publicOnly ? [where('visibility', '==', 'public')] : [])

/**
 * The parts of one bundle — or only its first part, which carries the version
 * and, for all but a very large sector, the whole network. A query rather than
 * a read by id: the rules refuse to look up a document that does not exist, and
 * "refused" would hide "not published yet".
 */
async function readParts(sectorId: string, visibility: Visibility, firstOnly: boolean): Promise<BundlePart[]> {
  const filters = [where('sectorId', '==', sectorId), where('visibility', '==', visibility)]
  try {
    const snap = await serverDocs(BUNDLES, query(collection(db, BUNDLES), ...filters, ...(firstOnly ? [where('index', '==', 0)] : [])))
    return snap.docs.map((d) => {
      const { index, count, version, payload } = d.data()
      return { index, count, version, payload }
    })
  } catch (error) {
    // signed in, but not a member of this sector: to them it has no restricted bundle
    if (visibility === 'restricted' && isDenied(error)) return []
    throw error
  }
}

/**
 * The published network as this user may see it; `null` when nothing is
 * published. With `known` versions it first asks whether anything changed —
 * one document per bundle — and answers `unchanged` without reading further.
 */
async function readBundles(sectorId: string, signedIn: boolean, known: Versions | null): Promise<CachedNetwork | 'unchanged' | null> {
  const scopes = signedIn ? VISIBILITIES : VISIBILITIES.slice(0, 1)
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
  for (const scope of ['public', 'member'] as const) {
    cache.remove(networkKey(sectorId, scope))
    cache.remove(sectorsKey(scope))
  }
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
  uid: string | null,
  key: string,
  saved: CachedNetwork | null,
  shown: LoadedNetwork | null,
): Promise<LoadedNetwork> {
  try {
    const read = await withTimeout(readBundles(sectorId, Boolean(uid), saved?.versions ?? null))
    if (read === 'unchanged' && shown) {
      cache.touch(key)
      return shown
    }
    if (read && read !== 'unchanged') {
      cache.set<CachedNetwork>(key, uid, read)
      return live(read.network)
    }
    cache.remove(key)
    const network = uid && (await isCurrentUserAdmin()) ? await bootstrap(sectorId, uid, key) : null
    return network ? live(network) : demo
  } catch (error) {
    console.warn('restoration: the network could not be read —', error)
    if (shown) return isUnreachable(error) ? { ...shown, notice: 'stale' } : shown
    return isUnreachable(error) ? { ...demo, notice: 'unavailable' } : demo
  }
}

interface Load {
  /** What the saved copy lets the page show straight away. */
  first: LoadedNetwork | null
  final: Promise<LoadedNetwork>
}

const loads = new Map<string, Load>()

function startLoad(sectorId: string, uid: string | null): Load {
  const key = networkKey(sectorId, scopeOf(uid))
  const saved = cache.get<CachedNetwork>(key, uid)
  const first = saved ? live(saved.value.network) : null
  if (saved && first && cache.isFresh(saved)) return { first, final: Promise.resolve(first) }
  return { first, final: refresh(sectorId, uid, key, saved?.value ?? null, first) }
}

/**
 * Never throws: anything short of a complete published network yields the
 * bundled demo network. A saved copy is returned at once; when the database
 * then turns out to hold something newer — or cannot be reached — `onRefresh`
 * receives the result that replaces it.
 */
export async function loadNetwork(sectorId: string, onRefresh: (result: LoadedNetwork) => void = () => {}): Promise<LoadedNetwork> {
  if (!isFirebaseConfigured) return demo
  const uid = await currentUid()

  // one load per sector and user at a time, however many callers ask
  const loadKey = `${sectorId}:${uid ?? ''}`
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

export async function listSectors(): Promise<SectorSummary[]> {
  if (!isFirebaseConfigured) return demoSectors
  const uid = await currentUid()
  return shared(`sectors:${uid ?? ''}`, async () => {
    const key = sectorsKey(scopeOf(uid))
    const saved = cache.get<SectorSummary[]>(key, uid)
    if (saved && cache.isFresh(saved)) return saved.value
    const read = (publicOnly: boolean) => serverDocs('sectors', query(collection(db, 'sectors'), ...visibilityFilter(publicOnly)))
    try {
      // A signed-in user who is not a member of every sector is refused the
      // unfiltered query, but can still see what any visitor sees.
      const snap = await withTimeout(
        uid
          ? read(false).catch((error) => {
              if (isDenied(error)) return read(true)
              throw error
            })
          : read(true),
      )
      if (snap.empty) return demoSectors
      const list: SectorSummary[] = snap.docs.map((d) => ({ id: d.id, nameAr: d.data().nameAr, nameEn: d.data().nameEn }))
      cache.set(key, uid, list)
      return list
    } catch (error) {
      console.warn('restoration: the sectors could not be read —', error)
      return saved?.value ?? demoSectors
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
