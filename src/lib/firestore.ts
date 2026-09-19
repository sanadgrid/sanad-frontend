import { getFirestore } from 'firebase/firestore'
import { app } from './firebase'

// The project's Firestore database is named `sanadgrid`, not `(default)`.
// Must match `firestore.database` in the backend repo's firebase.json.
export const db = getFirestore(app, 'sanadgrid')
