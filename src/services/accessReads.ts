import { doc, getDocFromServer } from 'firebase/firestore'
import { db } from '../lib/firestore'
import { sectorsOf, type AccessReads } from './access'
import { countReads, withTimeout } from './reads'

// The two reads behind the gate. They are loaded only once somebody is signed
// in, so a visitor who never signs in does not download Firestore. A user may
// read only their own document in each collection, and may ask for it even when
// it does not exist. Answered by the server or not at all: a cached "no such
// document" must never pass for an answer.
const own = async (name: string, uid: string) => {
  const snap = await withTimeout(getDocFromServer(doc(db, name, uid)))
  countReads(name, 1)
  return snap
}

export const accessReads: AccessReads = {
  isAdmin: async (uid) => (await own('admins', uid)).exists(),
  memberSectors: async (uid) => sectorsOf((await own('members', uid)).data()?.sectors),
}
