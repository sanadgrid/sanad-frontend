import { collection, doc, getDocFromServer, type DocumentData } from 'firebase/firestore'
import { builtInSectors, mergeSectors, sectorInfo, type SectorSummary } from '../features/restoration/sectors'
import { isFirebaseConfigured } from '../lib/firebase'
import { db } from '../lib/firestore'
import type { Access } from './access'
import { currentUid } from './auth'
import { cache, sectorsKey } from './cache'
import { countReads, serverDocs, shared, withTimeout } from './reads'

// The sectors a user may choose from. The page stands on the built-in registry;
// the `sectors` collection only adds sectors the registry does not know and
// names that were changed in the database.

// a name the database does not give is the registry's, else the id
const summaryOf = (id: string, data?: DocumentData): SectorSummary => {
  const { nameAr, nameEn } = sectorInfo(id, { nameAr: data?.nameAr, nameEn: data?.nameEn })
  return { id, nameAr, nameEn }
}

async function readSectors(access: Access): Promise<SectorSummary[]> {
  if (access.role === 'admin') {
    const snap = await serverDocs('sectors', collection(db, 'sectors'))
    return mergeSectors(snap.docs.map((d) => summaryOf(d.id, d.data())))
  }
  // The rules refuse a member the whole collection, but answer for each sector
  // they belong to — one read each, and the list is theirs alone.
  const snaps = await Promise.all(access.sectors.map((id) => getDocFromServer(doc(db, 'sectors', id))))
  countReads('sectors', snaps.length)
  return snaps.map((snap) => summaryOf(snap.id, snap.data()))
}

const sameSectors = (list: SectorSummary[], ids: string[]) => list.length === ids.length && list.every((s) => ids.includes(s.id))

/** All of them for an admin, their own for a member. Never throws, never empty for an admin. */
export async function listSectors(access: Access): Promise<SectorSummary[]> {
  const fallback = access.role === 'admin' ? builtInSectors() : access.sectors.map((id) => summaryOf(id))
  if (!isFirebaseConfigured) return builtInSectors()
  const uid = await currentUid()
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
