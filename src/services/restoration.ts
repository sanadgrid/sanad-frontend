import {
  collection,
  doc,
  GeoPoint,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore'
import { demoNetwork } from '../features/restoration/demoData'
import type { Feeder, LatLng, Network, Sector, Substation, Tie } from '../features/restoration/types'
import { auth, db, isFirebaseConfigured } from '../lib/firebase'

export type NetworkSource = 'firestore' | 'demo'
export type SectorSummary = Pick<Sector, 'id' | 'nameAr' | 'nameEn'>

export interface LoadedNetwork {
  network: Network
  source: NetworkSource
}

// Firestore caps a batch at 500 writes; stay clear of the limit.
const BATCH_LIMIT = 450
// A blocked or offline Firestore can keep a read pending for a long time —
// the page should fall back to the demo data instead of spinning.
const READ_TIMEOUT_MS = 8000

const demo: LoadedNetwork = { network: demoNetwork, source: 'demo' }
const demoSectors: SectorSummary[] = [
  { id: demoNetwork.sector.id, nameAr: demoNetwork.sector.nameAr, nameEn: demoNetwork.sector.nameEn },
]

// Firestore stores positions as GeoPoint; the app works with plain { lat, lng }.
const toLatLng = (point: GeoPoint): LatLng => ({ lat: point.latitude, lng: point.longitude })
const toGeoPoint = ({ lat, lng }: LatLng) => new GeoPoint(lat, lng)

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Firestore read timed out')), READ_TIMEOUT_MS)),
  ])
}

// Matches the network rules in the backend repo: a visitor may only read public
// documents, and a query that could return anything else is rejected as a whole —
// so the visibility filter is part of the query, not applied afterwards.
const visibilityFilter = (publicOnly: boolean) => (publicOnly ? [where('visibility', '==', 'public')] : [])

async function readNetwork(sectorId: string, publicOnly: boolean): Promise<Network | null> {
  const sectorSnap = await getDoc(doc(db, 'sectors', sectorId))
  if (!sectorSnap.exists()) return null

  const scoped = (name: string) =>
    getDocs(query(collection(db, name), where('sectorId', '==', sectorId), ...visibilityFilter(publicOnly)))
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

// A signed-in user who is not a member of the sector is refused the unfiltered
// query, but can still see what any visitor sees.
async function asMemberThenVisitor<T>(read: (publicOnly: boolean) => Promise<T>): Promise<T> {
  await auth.authStateReady()
  if (!auth.currentUser) return read(true)
  try {
    return await read(false)
  } catch {
    return read(true)
  }
}

/** Never throws: anything short of a complete Firestore network yields the bundled demo network. */
export async function loadNetwork(sectorId: string): Promise<LoadedNetwork> {
  if (!isFirebaseConfigured) return demo
  try {
    const network = await withTimeout(asMemberThenVisitor((publicOnly) => readNetwork(sectorId, publicOnly)))
    if (network) return { network, source: 'firestore' }
  } catch (error) {
    console.warn('restoration: falling back to demo data —', error)
  }
  return demo
}

export async function listSectors(): Promise<SectorSummary[]> {
  if (!isFirebaseConfigured) return demoSectors
  try {
    const snap = await withTimeout(
      asMemberThenVisitor((publicOnly) => getDocs(query(collection(db, 'sectors'), ...visibilityFilter(publicOnly)))),
    )
    if (snap.empty) return demoSectors
    return snap.docs.map((d) => ({ id: d.id, nameAr: d.data().nameAr, nameEn: d.data().nameEn }))
  } catch {
    return demoSectors
  }
}

/** Writes a whole network. The rules only accept this from a signed-in admin. */
export async function seedNetwork(network: Network): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('Firebase غير مهيأ في هذه النسخة')

  // the document id carries `id`, so it is not repeated inside the document
  const { id: sectorId, center, ...sector } = network.sector
  const writes: [DocumentReference, DocumentData][] = [
    [doc(db, 'sectors', sectorId), { ...sector, center: toGeoPoint(center) }],
    ...network.substations.map(({ id, location, ...rest }): [DocumentReference, DocumentData] => [
      doc(db, 'substations', id),
      { ...rest, location: toGeoPoint(location) },
    ]),
    ...network.feeders.map(({ id, ...rest }): [DocumentReference, DocumentData] => [doc(db, 'feeders', id), rest]),
    ...network.ties.map(({ id, ...rest }): [DocumentReference, DocumentData] => [doc(db, 'ties', id), rest]),
  ]

  try {
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db)
      for (const [ref, data] of writes.slice(i, i + BATCH_LIMIT)) batch.set(ref, data)
      await batch.commit()
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`تعذّر رفع البيانات: ${reason}`, { cause: error })
  }
}
