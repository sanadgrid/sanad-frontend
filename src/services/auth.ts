import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from '../lib/firebase'
import { clearMemberCache } from './cache'
import { countReads, withTimeout } from './reads'

/** The part of the Firebase user the UI needs — keeps SDK types out of features. */
export interface AuthUser {
  uid: string
  displayName: string | null
  email: string | null
}

const adminKey = (uid: string) => `sanad.rc.admin.${uid}`
// One check per user and page: repeated calls (and the ones still in flight) share it.
const adminChecks = new Map<string, Promise<boolean>>()

function forgetUser(uid: string | undefined) {
  clearMemberCache()
  adminChecks.clear()
  try {
    if (uid) sessionStorage.removeItem(adminKey(uid))
  } catch {
    // blocked site data: there was nothing stored either
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('Firebase غير مهيأ في هذه النسخة')
  await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function signOutUser(): Promise<void> {
  const uid = auth.currentUser?.uid
  await signOut(auth)
  forgetUser(uid)
}

/** Calls `cb` now and on every sign-in / sign-out; returns the unsubscribe function. */
export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  if (!isFirebaseConfigured) {
    cb(null)
    return () => {}
  }
  return onAuthStateChanged(auth, (user) => {
    // a session that ended on its own leaves nothing behind either
    if (!user) clearMemberCache()
    cb(user ? { uid: user.uid, displayName: user.displayName, email: user.email } : null)
  })
}

/** Settles once the stored session, if any, has been restored. Never throws. */
export async function currentUid(): Promise<string | null> {
  if (!isFirebaseConfigured) return null
  try {
    await auth.authStateReady()
    return auth.currentUser?.uid ?? null
  } catch {
    return null
  }
}

async function checkAdmin(uid: string): Promise<boolean> {
  try {
    if (sessionStorage.getItem(adminKey(uid)) === '1') return true
  } catch {
    // blocked site data: ask the database
  }
  const snap = await withTimeout(getDoc(doc(db, 'admins', uid)))
  countReads('admins', 1)
  if (!snap.exists()) return false
  try {
    // Only a "yes" is kept, and only for the session. It decides which buttons
    // show; what an admin may write is decided by the database rules.
    sessionStorage.setItem(adminKey(uid), '1')
  } catch {
    // the answer still holds for this page
  }
  return true
}

/**
 * An admin is a user with a document in `admins/`; each user may read only their
 * own. Never throws. A "no" is remembered until the page is closed; a check that
 * failed is not remembered at all.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const uid = await currentUid()
  if (!uid) return false
  let check = adminChecks.get(uid)
  if (!check) {
    check = checkAdmin(uid)
    adminChecks.set(uid, check)
    check.catch(() => adminChecks.delete(uid))
  }
  return check.catch(() => false)
}
