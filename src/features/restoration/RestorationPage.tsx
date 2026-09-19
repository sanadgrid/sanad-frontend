import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { Access } from '../../services/access'
import { signOutUser, type AuthUser } from '../../services/auth'
import { listSectors } from '../../services/sectors'
import { buildDirectory } from './backup/directory'
import type { BackupCase } from './backup/model'
import { dataKind } from './backup/planNetwork'
import { sectorBox, type ReviewedStation } from './backup/stationReview'
import type { DataAction } from './components/DataMenu'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { Dashboard } from './Dashboard'
import { layerActions, planActions, type Run } from './dataActions'
import { builtInSectors, DEFAULT_SECTOR_ID, sectorInfo, type SectorSummary } from './sectors'
import { PlansNotSaved, saveStations, saveStationsThenPlans, StationsNotSaved } from './stationSave'
import { useBackupPlans } from './useBackupPlans'
import { useBasemap } from './useBasemap'
import { useMapLayers } from './useMapLayers'
import { useTheme } from './useTheme'
import { useToast } from './useToast'
import './RestorationPage.css'
import './PlansNetwork.css'
import './PlanEntry.css'

// Only admins ever open them, so the file reader and the clean-up are not part of everyone's download.
const ImportDialog = lazy(() => import('./components/ImportDialog').then((m) => ({ default: m.ImportDialog })))
const CleanupDialog = lazy(() => import('./components/CleanupDialog').then((m) => ({ default: m.CleanupDialog })))
const StationImportDialog = lazy(() => import('./components/StationImportDialog').then((m) => ({ default: m.StationImportDialog })))

type AdminDialog = 'import' | 'stations' | 'cleanup' | null

const PAGE_TITLE = 'قدرة استعادة الخدمة — SanadGrid'

// What people read when something fails. The technical reason (provider codes,
// rule denials) is for the console only.
const SIGN_OUT_FAILED = 'تعذّر تسجيل الخروج. حاول مرة أخرى.'
// The stations-with-plans bulk save is not covered by dataActions.ts's generic
// PlanActions (its saveMany takes no stations), so it keeps its own wiring here.
const PLANS_SAVED = 'تم حفظ الخطط'
const PLAN_WRITE_FAILED = 'تعذّر حفظ التغيير. تأكد من صلاحياتك وحاول مرة أخرى.'
const STATIONS_SAVED = 'تم حفظ المحطات'
const STATIONS_AND_PLANS_SAVED = 'تم حفظ المحطات والخطط'
const STATIONS_FAILED = 'تعذّر حفظ المحطات، ولم تُحفظ الخطط. تأكد من صلاحياتك وحاول مرة أخرى.'
const PLANS_FAILED_AFTER_STATIONS = 'حُفظت المحطات، وتعذّر حفظ الخطط. حاول مرة أخرى.'
const STATIONS_FILE = 'محطات'
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
  const { toast, show: setToast, dismiss } = useToast()
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

  /** Resolves to whether the task went through; a failure has been said on screen by then. */
  const run: Run = async (task, failed, done) => {
    setBusy(true)
    try {
      await task()
      if (done) setToast(typeof done === 'string' ? { kind: 'ok', text: done } : done)
      return true
    } catch (error) {
      console.error('restoration:', error)
      setToast({ kind: 'error', text: typeof failed === 'string' ? failed : failed(error) })
      return false
    } finally {
      setBusy(false)
    }
  }

  // the stations of the imported layers, as the dashboard also derives them: reads nothing
  const directory = useMemo(() => buildDirectory(mapLayers.layers), [mapLayers.layers])
  const box = useMemo(() => sectorBox(sector.center, directory), [sector.center, directory])
  const cases = backupPlans.plan?.cases ?? []
  const ratingA = backupPlans.plan?.ratingA ?? sector.ratingA

  // what writes a workbook is fetched when one is asked for, not with the page
  const exportStations = () =>
    import('./exportXlsx')
      .then((m) => m.saveStationsXlsx(directory, cases, { ratingA }, `${STATIONS_FILE}-${sector.id}.xlsx`))
      .catch((error) => console.warn('stations export:', error))

  // written stations are listed afresh and switched on, so they show at once
  const showLayers = (layerIds: string[]) => {
    if (layerIds.length === 0) return
    mapLayers.refresh(layerIds)
    for (const id of layerIds) mapLayers.toggle(id, true)
  }
  const writeStations = (stations: ReviewedStation[]) => (stations.length > 0 ? saveStations(sector.id, stations, mapLayers.layers) : Promise.resolve([]))
  const savePlans = (saved: BackupCase[], stations: ReviewedStation[]) =>
    run(
      async () => showLayers(await saveStationsThenPlans(() => writeStations(stations), () => (saved.length > 0 ? backupPlans.saveMany(saved) : Promise.resolve()))),
      (error) => (error instanceof StationsNotSaved ? STATIONS_FAILED : error instanceof PlansNotSaved && error.stationsWritten ? PLANS_FAILED_AFTER_STATIONS : PLAN_WRITE_FAILED),
      stations.length === 0 ? PLANS_SAVED : saved.length === 0 ? STATIONS_SAVED : STATIONS_AND_PLANS_SAVED,
    )

  const dataActions: DataAction[] = isAdmin
    ? [
        { id: 'import', icon: 'layers', label: 'استيراد طبقات الخريطة', hint: 'ملفات Google Earth', onSelect: () => setDialog('import') },
        { id: 'stations-import', icon: 'upload', label: 'استيراد محطات من Excel', hint: 'رقم المحطة وإحداثياتها من جدول', onSelect: () => setDialog('stations') },
        { id: 'stations-export', icon: 'download', label: 'تصدير المحطات إلى Excel', hint: 'كل محطات القطاع مع إحداثياتها', onSelect: () => void exportStations() },
        ...(backupPlans.available ? [{ id: 'bulk', icon: 'table' as const, label: 'إدخال جماعي للخطط', hint: 'قالب Excel أو لصق من الجدول', onSelect: () => setBulkOpen(true) }] : []),
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
          onSavePlans={savePlans}
          onExportStations={() => void exportStations()}
          planActions={planActions(backupPlans, run)}
          layerActions={layerActions(mapLayers, run)}
        />
      </main>

      {dialog && isAdmin && (
        <Suspense fallback={null}>
          {dialog === 'import' ? (
            <ImportDialog sectorId={sector.id} sectorName={sector.nameAr} center={sector.center} onImported={mapLayers.refresh} onClose={() => setDialog(null)} />
          ) : dialog === 'stations' ? (
            <StationImportDialog
              sectorId={sector.id}
              sectorName={sector.nameAr}
              directory={directory}
              box={box}
              busy={busy}
              onSave={(stations) => run(async () => showLayers(await writeStations(stations)), STATIONS_FAILED, STATIONS_SAVED)}
              onClose={() => setDialog(null)}
            />
          ) : (
            <CleanupDialog sectorId={sector.id} sectorName={sector.nameAr} onClose={() => setDialog(null)} />
          )}
        </Suspense>
      )}

      {toast && <Toast toast={toast} onDismiss={dismiss} />}
    </div>
  )
}
