import { isFirebaseConfigured } from '../../lib/firebase'
import './HomePage.css'

export function HomePage() {
  return (
    <main className="home">
      <h1>سند</h1>
      <p className={isFirebaseConfigured ? 'status ok' : 'status warn'}>
        {isFirebaseConfigured
          ? 'Firebase متصل ✓'
          : 'إعدادات Firebase ناقصة — عبّي متغيرات VITE_FIREBASE_* في ‎.env.local'}
      </p>
    </main>
  )
}
