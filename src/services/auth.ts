import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../lib/firebase'
import { createAccessCheck, type Verdict } from './access'
import { clearDataCache } from './cache'

// No Firestore in this file: it is part of what a signed-out visitor downloads.

/** The part of the Firebase user the UI needs — keeps SDK types out of features. */
export interface AuthUser {
  uid: string
  displayName: string | null
  email: string | null
}

/** `false` in a build without a project behind it: nobody can sign in there. */
export const canSignIn = isFirebaseConfigured

function sessionStore() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    // private windows and blocked site data throw on access
    return null
  }
}

// The reads bring Firestore with them, so they are fetched when the first
// signed-in user is checked. A download that fails is a check that failed.
const accessCheck = createAccessCheck(
  {
    isAdmin: async (uid) => (await import('./accessReads')).accessReads.isAdmin(uid),
    memberSectors: async (uid) => (await import('./accessReads')).accessReads.memberSectors(uid),
  },
  sessionStore(),
)

/** Whoever leaves — by choice or because the session ended — leaves nothing behind. */
function forgetUser() {
  accessCheck.forget()
  clearDataCache()
}

/** `chooseAccount` — always ask which account, for somebody who wants a different one than last time. */
export async function signInWithGoogle(chooseAccount = false): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('Firebase غير مهيأ في هذه النسخة')
  const provider = new GoogleAuthProvider()
  if (chooseAccount) provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(auth, provider)
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
  forgetUser()
}

let lastUid: string | null = null

/** Calls `cb` now and on every sign-in / sign-out; returns the unsubscribe function. */
export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  if (!isFirebaseConfigured) {
    cb(null)
    return () => {}
  }
  return onAuthStateChanged(auth, (user) => {
    // a session that ended on its own, or one account replaced by another, leaves nothing behind either
    if (!user || (lastUid && lastUid !== user.uid)) forgetUser()
    lastUid = user?.uid ?? null
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

/**
 * Whether the signed-in user may open the dashboard: an admin (`admins/{uid}`
 * exists) or a member of at least one sector (`members/{uid}.sectors`). Never
 * throws, and never says yes without an answer from the database. One or two
 * reads per session; see access.ts for what is remembered.
 */
export async function checkAccess(uid: string): Promise<Verdict> {
  if (!isFirebaseConfigured) return { status: 'unverified' }
  return accessCheck.check(uid)
}

/** The access that was granted turned out not to hold: the next check asks the database again. */
export const forgetAccess = () => accessCheck.forget()

/**
 * Shares the gate's check, so it costs nothing more. Never throws. It decides
 * which buttons show; what an admin may write is decided by the database rules.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const uid = await currentUid()
  if (!uid) return false
  const verdict = await checkAccess(uid)
  return verdict.status === 'granted' && verdict.access.role === 'admin'
}
