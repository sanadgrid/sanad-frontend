import { useEffect, useState } from 'react'
import { onAuthChange, signInWithGoogle, signOutUser, type AuthUser } from '../../services/auth'
import { listSectors, loadNetwork, seedNetwork, type LoadedNetwork, type SectorSummary } from '../../services/restoration'
import { TopBar } from './components/TopBar'
import { Dashboard } from './Dashboard'
import { demoNetwork } from './demoData'
import './RestorationPage.css'

interface Toast {
  kind: 'ok' | 'error'
  text: string
}

const TOAST_MS = 6000
const PAGE_TITLE = 'قدرة استعادة الخدمة — SanadGrid'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function RestorationPage() {
  const [sectorId, setSectorId] = useState(demoNetwork.sector.id)
  const [sectors, setSectors] = useState<SectorSummary[]>([])
  const [loaded, setLoaded] = useState<LoadedNetwork | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  // bumped after an upload so the network is read again
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => onAuthChange(setUser), [])

  useEffect(() => {
    const previous = document.title
    document.title = PAGE_TITLE
    return () => {
      document.title = previous
    }
  }, [])

  // what a visitor may read differs from what a member may read, so both reads
  // are repeated when the user changes
  const uid = user?.uid
  useEffect(() => {
    let cancelled = false
    listSectors().then((list) => {
      if (cancelled) return
      setSectors(list)
      setSectorId((current) => (list.some((s) => s.id === current) ? current : list[0].id))
    })
    return () => {
      cancelled = true
    }
  }, [uid, revision])

  useEffect(() => {
    let cancelled = false
    loadNetwork(sectorId).then((result) => {
      if (!cancelled) setLoaded(result)
    })
    return () => {
      cancelled = true
    }
  }, [sectorId, uid, revision])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const run = async (task: () => Promise<void>, done?: string) => {
    setBusy(true)
    try {
      await task()
      if (done) setToast({ kind: 'ok', text: done })
    } catch (error) {
      setToast({ kind: 'error', text: messageOf(error) })
    } finally {
      setBusy(false)
    }
  }

  const seed = () =>
    run(async () => {
      await seedNetwork(demoNetwork)
      setRevision((r) => r + 1)
    }, 'تم رفع البيانات التجريبية إلى Firestore.')

  return (
    <div className="rc">
      <TopBar
        source={loaded?.source ?? null}
        sectors={sectors}
        sectorId={sectorId}
        user={user}
        busy={busy}
        onSectorChange={setSectorId}
        onSignIn={() => run(signInWithGoogle)}
        onSignOut={() => run(signOutUser)}
        onSeed={seed}
      />

      <main className="rc-main">
        {loaded ? (
          // a different network starts from clean filters and no selection
          <Dashboard key={`${loaded.network.sector.id}:${loaded.source}`} network={loaded.network} />
        ) : (
          <p className="rc-loading" role="status">
            جارٍ تحميل بيانات الشبكة…
          </p>
        )}
      </main>

      {toast && (
        <div className={`rc-toast rc-toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
