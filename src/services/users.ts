import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firestore'

export interface UserProfile {
  displayName: string
  email: string
}

// Matches the `users/{uid}` rule in the backend repo: a user can only touch their own doc.
const userRef = (uid: string) => doc(db, 'users', uid)

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(userRef(uid))
  return snap.exists() ? (snap.data() as UserProfile) : null
}

export async function saveUserProfile(uid: string, profile: UserProfile): Promise<void> {
  await setDoc(userRef(uid), { ...profile, updatedAt: serverTimestamp() }, { merge: true })
}
