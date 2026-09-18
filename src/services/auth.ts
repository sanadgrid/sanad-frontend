import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../lib/firebase'

/** The part of the Firebase user the UI needs — keeps SDK types out of features. */
export interface AuthUser {
  uid: string
  displayName: string | null
  email: string | null
}

export async function signInWithGoogle(): Promise<void> {
  if (!isFirebaseConfigured) throw new Error('Firebase غير مهيأ في هذه النسخة')
  await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}

/** Calls `cb` now and on every sign-in / sign-out; returns the unsubscribe function. */
export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  if (!isFirebaseConfigured) {
    cb(null)
    return () => {}
  }
  return onAuthStateChanged(auth, (user) =>
    cb(user ? { uid: user.uid, displayName: user.displayName, email: user.email } : null),
  )
}
