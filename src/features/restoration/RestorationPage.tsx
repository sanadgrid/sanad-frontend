import { lazy, Suspense, useEffect, useState } from 'react'
import type { Access } from '../../services/access'
import { signOutUser, type AuthUser } from '../../services/auth'
import { listSectors, loadNetwork, seedNetwork, type LoadedNetwork, type LoadResult, type SectorSummary } from '../../services/restoration'
import { TopBar } from './components/TopBar'
import { Dashboard } from './Dashboard'
import { demoNetwork } from './demoData'
import { useBackupPlans } from './useBackupPlans'
import { useBasemap } from './useBasemap'
import { useDemoNetwork } from './useDemoNetwork'
import { useMapLayers } from './useMapLayers'
import { useTheme } from './useTheme'
import './RestorationPage.css'

// Only admins ever open it, so the file reader is not part of everyone's download.
const ImportDialog = lazy(() => import('./components/ImportDialog').then((m) => ({ default: m.ImportDialog })))

interface Toast {
  kind: 'ok' | 'error' | 'notice'
  text: string
}

const TOAST_MS = 6000
const PAGE_TITLE = 'قدرة استعادة الخدمة — SanadGrid'

// What people read when something fails. The technical reason (provider codes,
// rule denials) is for the console only.
const SIGN_OUT_FAILED = 'تعذّر تسجيل الخروج. حاول مرة أخرى.'
const PUBLISH_DONE = 'تم نشر البيانات'
const PUBLISH_FAILED = 'تعذّر نشر البيانات. تأكد من صلاحياتك وحاول مرة أخرى.'
const LAYER_DELETED = 'تم حذف الطبقة'
const LAYER_DELETE_FAILED = 'تعذّر حذف الطبقة. تأكد من صلاحياتك وحاول مرة أخرى.'
const TWINS_DELETED = 'تم حذف الطبقات المكررة'

/** A run of deletions that stopped half-way: what went is gone, and the message says where it stopped. */
class StoppedDeleting extends Error {
  text: string

  constructor(removed: number, total: number, name: string) {
    super('map layers: the deletion stopped half-way')
    this.text = `حُذفت ${removed} من ${total}، ثم تعذّر حذف «${name}». حاول مرة أخرى للباقي.`
  }
}
const PLAN_SAVED = 'تم حفظ الخطة'
const PLAN_DELETED = 'تم حذف الخطة'
const RATING_SAVED = 'تم حفظ سعة القاطع المعتمدة'
const PLAN_WRITE_FAILED = 'تعذّر حفظ التغيير. تأكد من صلاحياتك وحاول مرة أخرى.'
const LOAD_NOTICE: Record<NonNullable<LoadedNetwork['notice']>, string> = {
  stale: 'تعذّر تحديث البيانات الآن. تُعرض آخر نسخة محفوظة.',
  unavailable: 'تعذّر الوصول إلى البيانات الآن. تُعرض بيانات تجريبية مؤقتاً.',
}

interface RestorationPageProps {
  /** Who the gate let in; `null` only in the test build that has nobody to sign in. */
  user: AuthUser | null
  access: Access
  /** The database refused what the gate had allowed: back to the gate, which asks again. */
  onAccessLost: () => void
}

/** Mounted by RestorationGate only, once the user is known to be an admin or a member of a sector. */
export function RestorationPage({ user, access, onAccessLost }: RestorationPageProps) {
  const isAdmin = access.role === 'admin'
  // a member starts in a sector of their own: asking for any other one would be refused
  const [sectorId, setSectorId] = useState((access.role === 'member' && access.sectors[0]) || demoNetwork.sector.id)
  const [sectors, setSectors] = useState<SectorSummary[]>([])
  const [loaded, setLoaded] = useState<LoadedNetwork | null>(null)
  const [importing, setImporting] = useState(false)
  // bumped after an upload so the network is read again
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [theme, toggleTheme] = useTheme()
  const [basemap, setBasemap] = useBasemap()
  const [demoNetworkShown, showDemoNetwork] = useDemoNetwork()

  useEffect(() => {
    const previous = document.title
    document.title = PAGE_TITLE
    return () => {
      document.title = previous
    }
  }, [])

  const uid = user?.uid
  useEffect(() => {
    let cancelled = false
    listSectors(access).then((list) => {
      if (cancelled) return
      setSectors(list)
      setSectorId((current) => (list.some((s) => s.id === current) ? current : list[0].id))
    })
    return () => {
      cancelled = true
    }
  }, [access, uid, revision])

  useEffect(() => {
    let cancelled = false
    // called once with what can be shown at once, and again if the database holds something newer
    const show = (result: LoadResult) => {
      if (cancelled) return
      if (result === 'denied') return onAccessLost()
      setLoaded(result)
      if (result.notice) setToast({ kind: 'notice', text: LOAD_NOTICE[result.notice] })
    }
    loadNetwork(sectorId, show).then(show)
    return () => {
      cancelled = true
    }
  }, [sectorId, uid, revision, onAccessLost])

  // the layers follow the network on screen, which is the demo sector when the chosen one has no data
  const sector = loaded?.network.sector
  const mapLayers = useMapLayers(sector?.id, uid)
  const backupPlans = useBackupPlans(sector?.id, uid)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  /** Resolves to whether the task went through; a failure has been said on screen by then. */
  const run = async (task: () => Promise<void>, failed: string | ((error: unknown) => string), done?: string) => {
    setBusy(true)
    try {
      await task()
      if (done) setToast({ kind: 'ok', text: done })
      return true
    } catch (error) {
      console.error('restoration:', error)
      setToast({ kind: 'error', text: typeof failed === 'string' ? failed : failed(error) })
      return false
    } finally {
      setBusy(false)
    }
  }

  const deleteLayers = (layerIds: string[]) =>
    run(
      async () => {
        const { removed, failed } = await mapLayers.removeMany(layerIds)
        const name = mapLayers.layers.find((layer) => layer.id === failed)?.name
        if (failed) throw new StoppedDeleting(removed.length, layerIds.length, name ?? 'إحدى الطبقات')
      },
      (error) => (error instanceof StoppedDeleting ? error.text : LAYER_DELETE_FAILED),
      TWINS_DELETED,
    )

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
    <div className="rc" data-theme={theme} data-basemap={basemap}>
      <TopBar
        source={loaded?.source ?? null}
        synthetic={demoNetworkShown && sector?.visibility === 'public'}
        sectors={sectors}
        sectorId={sectorId}
        user={user}
        busy={busy}
        canImport={isAdmin && Boolean(sector)}
        canPublish={isAdmin}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSectorChange={setSectorId}
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
            plans={backupPlans}
            basemap={basemap}
            demoNetwork={demoNetworkShown}
            isAdmin={isAdmin}
            busy={busy}
            onBasemap={setBasemap}
            onDemoNetwork={showDemoNetwork}
            onDeleteLayer={(layerId) => run(() => mapLayers.remove(layerId), LAYER_DELETE_FAILED, LAYER_DELETED)}
            onDeleteLayers={deleteLayers}
            onSavePlan={(saved) => run(() => backupPlans.save(saved), PLAN_WRITE_FAILED, PLAN_SAVED)}
            onDeletePlan={(caseId) => run(() => backupPlans.remove(caseId), PLAN_WRITE_FAILED, PLAN_DELETED)}
            onPlanRating={(ratingA) => run(() => backupPlans.setRating(ratingA), PLAN_WRITE_FAILED, RATING_SAVED)}
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
