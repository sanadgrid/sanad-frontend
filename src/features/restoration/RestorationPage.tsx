import { lazy, Suspense, useEffect, useState } from 'react'
import { onAuthChange, signInWithGoogle, signOutUser, type AuthUser } from '../../services/auth'
import { isCurrentUserAdmin } from '../../services/mapLayers'
import { listSectors, loadNetwork, seedNetwork, type LoadedNetwork, type SectorSummary } from '../../services/restoration'
import { TopBar } from './components/TopBar'
import { Dashboard } from './Dashboard'
import { demoNetwork } from './demoData'
import { useMapLayers } from './useMapLayers'
import { useTheme } from './useTheme'
import './RestorationPage.css'

// Only admins ever open it, so the file reader is not part of everyone's download.
const ImportDialog = lazy(() => import('./components/ImportDialog').then((m) => ({ default: m.ImportDialog })))

interface Toast {
  kind: 'ok' | 'error'
  text: string
}

const TOAST_MS = 6000
const PAGE_TITLE = 'قدرة استعادة الخدمة — SanadGrid'

// What people read when something fails. The technical reason (provider codes,
// rule denials) is for the console only.
const SIGN_IN_FAILED = 'تعذّر تسجيل الدخول. حاول مرة أخرى.'
const SIGN_IN_CLOSED = 'أُغلقت نافذة تسجيل الدخول قبل إتمام العملية.'
const SIGN_OUT_FAILED = 'تعذّر تسجيل الخروج. حاول مرة أخرى.'
const PUBLISH_DONE = 'تم نشر البيانات'
const PUBLISH_FAILED = 'تعذّر نشر البيانات. تأكد من صلاحياتك وحاول مرة أخرى.'
const LAYER_DELETED = 'تم حذف الطبقة'
const LAYER_DELETE_FAILED = 'تعذّر حذف الطبقة. تأكد من صلاحياتك وحاول مرة أخرى.'

const CLOSED_POPUP_CODES = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']

function signInFailure(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  return CLOSED_POPUP_CODES.includes(code) ? SIGN_IN_CLOSED : SIGN_IN_FAILED
}

export function RestorationPage() {
  const [sectorId, setSectorId] = useState(demoNetwork.sector.id)
  const [sectors, setSectors] = useState<SectorSummary[]>([])
  const [loaded, setLoaded] = useState<LoadedNetwork | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [importing, setImporting] = useState(false)
  // bumped after an upload so the network is read again
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [theme, toggleTheme] = useTheme()

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
    let cancelled = false
    isCurrentUserAdmin().then((admin) => {
      if (!cancelled) setIsAdmin(admin)
    })
    return () => {
      cancelled = true
    }
  }, [uid])

  // the layers follow the network on screen, which is the demo sector when the chosen one has no data
  const sector = loaded?.network.sector
  const mapLayers = useMapLayers(sector?.id, uid)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const run = async (task: () => Promise<void>, failed: string | ((error: unknown) => string), done?: string) => {
    setBusy(true)
    try {
      await task()
      if (done) setToast({ kind: 'ok', text: done })
    } catch (error) {
      console.error('restoration:', error)
      setToast({ kind: 'error', text: typeof failed === 'string' ? failed : failed(error) })
    } finally {
      setBusy(false)
    }
  }

  const seed = () =>
    run(
      async () => {
        await seedNetwork(demoNetwork)
        setRevision((r) => r + 1)
      },
      PUBLISH_FAILED,
      PUBLISH_DONE,
    )

  return (
    <div className="rc" data-theme={theme}>
      <TopBar
        source={loaded?.source ?? null}
        sectors={sectors}
        sectorId={sectorId}
        user={user}
        busy={busy}
        isAdmin={isAdmin && Boolean(sector)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSectorChange={setSectorId}
        onSignIn={() => run(signInWithGoogle, signInFailure)}
        onSignOut={() => run(signOutUser, SIGN_OUT_FAILED)}
        onSeed={seed}
        onImport={() => setImporting(true)}
      />

      <main className="rc-main">
        {loaded ? (
          // a different network starts from clean filters and no selection
          <Dashboard
            key={`${loaded.network.sector.id}:${loaded.source}`}
            network={loaded.network}
            theme={theme}
            imported={mapLayers}
            isAdmin={isAdmin}
            busy={busy}
            onDeleteLayer={(layerId) => run(() => mapLayers.remove(layerId), LAYER_DELETE_FAILED, LAYER_DELETED)}
          />
        ) : (
          <p className="rc-loading" role="status">
            جارٍ تحميل بيانات الشبكة…
          </p>
        )}
      </main>

      {importing && sector && (
        <Suspense fallback={null}>
          <ImportDialog
            sectorId={sector.id}
            sectorName={sector.nameAr}
            center={sector.center}
            onImported={mapLayers.refresh}
            onClose={() => setImporting(false)}
          />
        </Suspense>
      )}

      {toast && (
        <div className={`rc-toast rc-toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
