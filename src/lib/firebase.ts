import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
)

// getAuth() throws on an empty apiKey, which would break every module importing
// this file. A placeholder keeps the imports safe; services check
// `isFirebaseConfigured` before making any call.
export const app = initializeApp(isFirebaseConfigured ? firebaseConfig : { ...firebaseConfig, apiKey: 'unconfigured' })

// The database lives in ./firestore.ts: whoever only needs to know who is signed
// in — the gate in front of the dashboard — must not download Firestore for it.
export const auth = getAuth(app)
