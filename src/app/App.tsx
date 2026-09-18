import { lazy, Suspense } from 'react'
import { HomePage } from '../features/home/HomePage'

// Loaded on demand: the dashboard brings Leaflet and Firestore with it, and the
// landing page should not pay for them.
const RestorationPage = lazy(() =>
  import('../features/restoration/RestorationPage').then((m) => ({ default: m.RestorationPage })),
)

// Two pages do not justify a router dependency; netlify.toml already serves
// index.html for every path.
function App() {
  if (location.pathname.startsWith('/restoration'))
    return (
      <Suspense fallback={null}>
        <RestorationPage />
      </Suspense>
    )

  return <HomePage />
}

export default App
