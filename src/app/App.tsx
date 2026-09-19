import { lazy, Suspense } from 'react'
import { HomePage } from '../features/home/HomePage'

// Loaded on demand, so the landing page does not pay for the sign-in code. The
// gate is all this address gives anybody: the dashboard behind it is private,
// and is only downloaded once the gate has let somebody through.
const RestorationGate = lazy(() =>
  import('../features/restoration/RestorationGate').then((m) => ({ default: m.RestorationGate })),
)

// Two pages do not justify a router dependency; netlify.toml already serves
// index.html for every path.
function App() {
  if (location.pathname.startsWith('/restoration'))
    return (
      <Suspense fallback={null}>
        <RestorationGate />
      </Suspense>
    )

  return <HomePage />
}

export default App
