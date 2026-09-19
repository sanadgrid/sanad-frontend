import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { Access } from '../../services/access'
import { signOutUser, type AuthUser } from '../../services/auth'
import { listSectors } from '../../services/sectors'
import { dataKind } from './backup/planNetwork'
import type { DataAction } from './components/DataMenu'
import { TopBar } from './components/TopBar'
import { Dashboard } from './Dashboard'
import { builtInSectors, DEFAULT_SECTOR_ID, sectorInfo, type SectorSummary } from './sectors'
import { useBackupPlans } from './useBackupPlans'
import { useBasemap } from './useBasemap'
import { useMapLayers } from './useMapLayers'
import { useTheme } from './useTheme'
import './RestorationPage.css'
import './PlansNetwork.css'

// Only admins ever open them, so the file reader and the clean-up are not part of everyone's download.
const ImportDialog = lazy(() => import('./components/ImportDialog').then((m) => ({ default: m.ImportDialog })))
const CleanupDialog = lazy(() => import('./components/CleanupDialog').then((m) => ({ default: m.CleanupDialog })))

interface Toast {
  kind: 'ok' | 'error' | 'notice'
  text: string
}

type AdminDialog = 'import' | 'cleanup' | null

const TOAST_MS = 6000
const PAGE_TITLE = 'قدرة استعادة الخدمة — SanadGrid'

// What people read when something fails. The technical reason (provider codes,
// rule denials) is for the console only.
const SIGN_OUT_FAILED = 'تعذّر تسجيل الخروج. حاول مرة أخرى.'
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
const PLANS_SAVED = 'تم حفظ الخطط'
const PLAN_DELETED = 'تم حذف الخطة'
const RATING_SAVED = 'تم حفظ سعة القاطع المعتمدة'
const PLAN_WRITE_FAILED = 'تعذّر حفظ التغيير. تأكد من صلاحياتك وحاول مرة أخرى.'
const PLANS_NOTICE = {
  stale: 'تعذّر تحديث الخطط الآن. تُعرض آخر نسخة محفوظة.',
  unavailable: 'تعذّر الوصول إلى الخطط الآن. حاول مرة أخرى بعد قليل.',
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
  const [sectorId, setSectorId] = useState((access.role === 'member' && access.sectors[0]) || DEFAULT_SECTOR_ID)
  const [sectors, setSectors] = useState<SectorSummary[]>(builtInSectors)
  const [dialog, setDialog] = useState<AdminDialog>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [theme, toggleTheme] = useTheme()
  const [basemap, setBasemap] = useBasemap()

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
      if (cancelled || list.length === 0) return
      setSectors(list)
      setSectorId((current) => (list.some((s) => s.id === current) ? current : list[0].id))
    })
    return () => {
      cancelled = true
    }
  }, [access, uid])

  // name, map centre and derating come with the page; the database may only rename the sector
  const sector = useMemo(() => sectorInfo(sectorId, sectors.find((s) => s.id === sectorId)), [sectorId, sectors])
  const mapLayers = useMapLayers(sectorId, uid)
  // The plans are what the page shows. Refused: whatever let this user in no longer
  // holds, and the gate asks again. Unreachable: said once, quietly.
  const backupPlans = useBackupPlans(sectorId, uid, (notice) => {
    if (notice === 'denied') onAccessLost()
    else setToast({ kind: 'notice', text: PLANS_NOTICE[notice] })
  })

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

  const dataActions: DataAction[] = isAdmin
    ? [
        { id: 'import', icon: 'layers', label: 'استيراد طبقات الخريطة', hint: 'ملفات Google Earth', onSelect: () => setDialog('import') },
        ...(backupPlans.available ? [{ id: 'bulk', icon: 'table' as const, label: 'إدخال جماعي للخطط', hint: 'لصق من جدول أو ملف CSV', onSelect: () => setBulkOpen(true) }] : []),
        { id: 'cleanup', icon: 'trash', label: 'حذف بيانات الشبكة التجريبية القديمة', hint: 'الشبكة المصطنعة السابقة فقط', danger: true, onSelect: () => setDialog('cleanup') },
      ]
    : []

  return (
    <div className="rc" data-theme={theme} data-basemap={basemap}>
      <TopBar
        dataKind={dataKind(backupPlans.plan?.cases ?? [])}
        sectors={sectors}
        sectorId={sectorId}
        user={user}
        busy={busy}
        dataActions={dataActions}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSectorChange={setSectorId}
        onSignOut={() => run(signOutUser, SIGN_OUT_FAILED)}
      />

      <main className="rc-main">
        {/* another sector starts from clean filters and no selection */}
        <Dashboard
          key={sectorId}
          sector={sector}
          theme={theme}
          imported={mapLayers}
          plans={backupPlans}
          basemap={basemap}
          isAdmin={isAdmin}
          busy={busy}
          bulkOpen={bulkOpen && isAdmin}
          onBulk={setBulkOpen}
          onBasemap={setBasemap}
          onDeleteLayer={(layerId) => run(() => mapLayers.remove(layerId), LAYER_DELETE_FAILED, LAYER_DELETED)}
          onDeleteLayers={deleteLayers}
          onSavePlan={(saved) => run(() => backupPlans.save(saved), PLAN_WRITE_FAILED, PLAN_SAVED)}
          onSavePlans={(saved) => run(() => backupPlans.saveMany(saved), PLAN_WRITE_FAILED, PLANS_SAVED)}
          onDeletePlan={(caseId) => run(() => backupPlans.remove(caseId), PLAN_WRITE_FAILED, PLAN_DELETED)}
          onPlanRating={(ratingA) => run(() => backupPlans.setRating(ratingA), PLAN_WRITE_FAILED, RATING_SAVED)}
        />
      </main>

      {dialog && isAdmin && (
        <Suspense fallback={null}>
          {dialog === 'import' ? (
            <ImportDialog sectorId={sector.id} sectorName={sector.nameAr} center={sector.center} onImported={mapLayers.refresh} onClose={() => setDialog(null)} />
          ) : (
            <CleanupDialog sectorId={sector.id} sectorName={sector.nameAr} onClose={() => setDialog(null)} />
          )}
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
