import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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
const app = initializeApp(isFirebaseConfigured ? firebaseConfig : { ...firebaseConfig, apiKey: 'unconfigured' })

export const auth = getAuth(app)
// The project's Firestore database is named `sanadgrid`, not `(default)`.
// Must match `firestore.database` in the backend repo's firebase.json.
export const db = getFirestore(app, 'sanadgrid')
