import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { buildDirectory, directoryBounds, placeOf, toLatLng } from './backup/directory'
import type { BackupCase } from './backup/model'
import { plansToCsv } from './backup/planCsv'
import { countActive, defaultPlanFilters, type PlanFilters } from './backup/planFilters'
import { isSupportOnly } from './backup/planNetwork'
import { AddPlanButton } from './components/AddPlanButton'
import { AssumptionChips, AssumptionsField } from './components/AssumptionsField'
import { BackupPlansPanel } from './components/BackupPlansPanel'
import { BottomSheet } from './components/BottomSheet'
import { EmptyState, UnplacedNotice } from './components/EmptyState'
import { FilterPanel } from './components/FilterPanel'
import { FiltersButton } from './components/FiltersButton'
import { ImportedLayersList } from './components/ImportedLayersList'
import { KpiCards } from './components/KpiCards'
import { MapControls } from './components/MapControls'
import { MapLegend } from './components/MapLegend'
import type { Place } from './components/mapView'
import { Methodology } from './components/Methodology'
import { NetworkMap } from './components/NetworkMap'
import { PhoneActions } from './components/PhoneActions'
import { PlanFiltersField } from './components/PlanFiltersField'
import { PriorityTable } from './components/PriorityTable'
import { SupportCard } from './components/SupportCard'
import { Toggle } from './components/Toggle'
import type { LayerActions, PlanActions } from './dataActions'
import { saveCsv } from './exportCsv'
import { MONTHS_AR } from './labels'
import { DESIGN_MONTH, type SectorInfo } from './sectors'
import type { LatLng } from './types'
import type { BackupPlans } from './useBackupPlans'
import type { Basemap } from './useBasemap'
import { useBaseStations } from './useBaseStations'
import type { ImportedLayers } from './useMapLayers'
import { usePanels } from './usePanels'
import { usePlanDrawings } from './usePlanDrawings'
import { usePlanEditor } from './usePlanEditor'
import { usePlanEntry } from './usePlanEntry'
import { usePlanNetwork, type Assumptions } from './usePlanNetwork'
import type { Theme } from './useTheme'

// Only admins ever open it, so the sheet reader is not part of everyone's download.
const BulkEntryDialog = lazy(() => import('./components/BulkEntryDialog').then((m) => ({ default: m.BulkEntryDialog })))

interface DashboardProps {
  sector: SectorInfo
  theme: Theme
  imported: ImportedLayers
  plans: BackupPlans
  basemap: Basemap
  isAdmin: boolean
  /** Something is being written; destructive buttons wait. */
  busy: boolean
  /** The bulk entry is asked for from the top bar as well as from here. */
  bulkOpen: boolean
  onBulk: (open: boolean) => void
  onBasemap: (basemap: Basemap) => void
  /** What an admin does to the plans and the layers; each resolves to whether the change was written. */
  planActions: PlanActions
  layerActions: LayerActions
}

// The page opens on the team's own sheet: ratings as written. The month is ready
// for the switch — August, when ratings are lowest.
const AS_WRITTEN: Assumptions = { deratingOn: false, month: DESIGN_MONTH, ratingA: null }
const PRIORITY_ROWS = 25
const DEFAULT_VOLTAGES = [13.8, 33]
const NO_CASES: BackupCase[] = []

export function Dashboard(props: DashboardProps) {
  const { sector, theme, imported, plans, basemap, isAdmin, busy, onBulk, planActions } = props
  const [assumptions, setAssumptions] = useState(AS_WRITTEN)
  const [filters, setFilters] = useState(defaultPlanFilters)
  const [planId, setPlanId] = useState<string | null>(null)
  // a station that only backs others up has a card of its own
  const [supportKey, setSupportKey] = useState<string | null>(null)
  const [supportOpen, setSupportOpen] = useState(false)
  const [emptyDismissed, setEmptyDismissed] = useState(false)
  const clearArea = useRef<HTMLDivElement>(null)
  const mapSection = useRef<HTMLElement>(null)
  const panels = usePanels(clearArea)
  const { wide, plansOpen, setPlansOpen, setFiltersOpen, setView } = panels
  const editor = usePlanEditor()

  // Numbers and loads come from the plans, places from the station lists of the
  // imported layers — deriving the network reads nothing.
  const directory = useMemo(() => buildDirectory(imported.layers), [imported.layers])
  const net = usePlanNetwork(plans.plan, directory, sector, assumptions, filters)
  const { network, ratingA, derating } = net
  const options = useMemo(() => ({ ratingA, derating }), [ratingA, derating])

  const selectedRow = network.rows.find((row) => row.plan.id === planId) ?? null
  const supportNode = (supportKey && network.nodes.get(supportKey)) || null
  const support = supportNode && isSupportOnly(supportNode) ? supportNode : null
  const selectedKey = selectedRow?.mainKey ?? support?.key ?? null
  const { drawings, pickable, pickedBackups } = usePlanDrawings(editor, selectedRow, directory, options)

  // What the map keeps in view until it is moved: the stations of the plans, else
  // the imported ones — places the page already holds, so framing reads nothing.
  const stations = useBaseStations(imported, net.nodes)
  const frame = useMemo(() => (net.places.length > 0 ? net.places : (directoryBounds(directory) ?? [])), [net.places, directory])
  const activeFilters = countActive(filters)
  const voltages = useMemo(() => [...new Set([...DEFAULT_VOLTAGES, ...network.rows.map((row) => row.plan.voltageKv)])].sort((a, b) => a - b), [network])
  const hasPlans = network.rows.length > 0

  // On a wide screen the panel is what the map shows: closing it clears the map of it.
  const closePlans = () => {
    setPlansOpen(false)
    editor.close()
    if (wide) setPlanId(null)
  }

  const closeSupport = () => {
    setSupportOpen(false)
    if (wide) setSupportKey(null)
  }

  const openPlans = () => {
    closeSupport()
    setPlansOpen(true)
    if (!wide) setFiltersOpen(false)
  }

  // Choosing a plan frames its stations. A click on the map only moves it when the
  // opening panel would hide the station; a row of the table is far from the map.
  const selectPlan = (id: string | null, from: 'map' | 'list' = 'list', saved?: BackupCase) => {
    setPlanId(id)
    const row = network.rows.find((r) => r.plan.id === id)
    if (from === 'map' && row) return setView({ kind: 'station', id: row.mainKey, whenCovered: true })
    // a case written a moment ago is not in the list yet: it comes along
    const plan = saved ?? row?.plan
    const points = plan ? [plan.main, ...plan.backups].flatMap((e) => placeOf(directory, e) ?? []) : []
    if (points.length > 0) setView({ kind: 'points', points })
  }

  const selectNode = (key: string) => {
    const node = network.nodes.get(key)
    // the plan being written is not interrupted by a click on a station
    if (!node || editor.draft) return
    if (isSupportOnly(node)) {
      if (key === supportKey && supportOpen) return closeSupport()
      closePlans()
      setSupportKey(key)
      setSupportOpen(true)
      return setView({ kind: 'station', id: key, whenCovered: true })
    }
    openPlans()
    selectPlan(node.rows[0].plan.id, 'map')
  }

  const openPlan = (caseId: string) => {
    openPlans()
    selectPlan(caseId)
  }

  // A station or a shape picked in the list of an imported layer: the layer is
  // switched on if it was not, and on a phone the sheet gives way to the map.
  const pointAt = (layerId: string, place: Place) => {
    if (!imported.active.has(layerId)) imported.toggle(layerId, true)
    setView({ kind: 'place', layerId, place })
    if (!wide) setFiltersOpen(false)
  }

  const canAdd = isAdmin && plans.available
  const { canPick, addPlan, stationActions } = usePlanEntry({ directory, network, editor, canAdd, openPlan: (id) => (id ? openPlan(id) : (openPlans(), setPlanId(null))) })

  // The form gives way to the map. Nothing on the map changes but the squares that
  // can be clicked; on a phone, where the page scrolls, the map is brought under the finger.
  const picking = editor.picking
  useEffect(() => {
    if (picking && !wide) mapSection.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [picking, wide, mapSection])
  const framePicked = () => {
    const points = editor.draft ? [editor.draft.main, ...editor.draft.backups].flatMap((row): LatLng[] => (row.at ? [toLatLng(row.at)] : [])) : []
    if (points.length > 1) setView({ kind: 'points', points })
  }
  // the form's editor; pointing a place out also brings it into view
  const planEditor = {
    ...editor,
    setHover: (at: LatLng | null) => {
      editor.setHover(at)
      if (at) setView({ kind: 'reveal', at })
    },
  }

  const exportCsv = (cases: BackupCase[], name: string) => saveCsv(plansToCsv(cases, { ratingA }, net.monthDerating), `${name}-${sector.id}.csv`)
  const assumed = { assumptions, ratingA, savedRatingA: net.savedRatingA, monthDerating: net.monthDerating }
  const covered = Boolean(panels.filtersOpen || (supportOpen && support) || (plansOpen && plans.available && !picking))
  const showEmpty = !hasPlans && !plans.loading && !emptyDismissed && !plansOpen && !editor.draft

  return (
    <div className="rc-console">
      <section className="rc-map" aria-label="الخريطة" ref={mapSection}>
        <NetworkMap
          center={sector.center}
          zoom={sector.zoom}
          nodes={net.nodes}
          links={net.links}
          imported={imported.visible}
          base={stations.points}
          stationActions={stationActions}
          view={panels.view}
          clearArea={clearArea}
          selectedKey={selectedKey}
          selectedCaseId={editor.draft ? null : planId}
          plans={drawings}
          frame={frame}
          pickable={pickable}
          pickedBackups={pickedBackups}
          pointedOut={editor.hover}
          theme={theme}
          onSelect={selectNode}
          onSelectPlan={(id) => !editor.draft && openPlan(id)}
          onPick={editor.pick}
        />
      </section>

      <KpiCards
        kpis={net.kpis}
        total={network.rows.length}
        coverage={network.coverage}
        sectorName={sector.nameAr}
        assumptions={hasPlans && <AssumptionChips {...assumed} onOpen={() => setFiltersOpen(true)} />}
        loading={plans.loading}
        open={panels.kpisOpen}
        onToggle={panels.toggleKpis}
      />

      {panels.filtersOpen && (
        <FilterPanel
          activeCount={activeFilters}
          assumptions={
            <AssumptionsField {...assumed} canSave={isAdmin} busy={busy} onChange={(patch) => setAssumptions((a) => ({ ...a, ...patch }))} onSaveRating={planActions.setRating} />
          }
          filters={hasPlans && <PlanFiltersField filters={filters} voltages={voltages} onFilters={(patch: Partial<PlanFilters>) => setFilters((f) => ({ ...f, ...patch }))} />}
          basemap={basemap}
          onBasemap={props.onBasemap}
          onPlans={plans.available ? openPlans : undefined}
          stations={directory.size > 0 && <Toggle label="محطات الشبكة" checked={stations.on} onChange={stations.setOn} />}
          importedLayers={
            imported.layers.length + imported.trashed.length > 0 && (
              <ImportedLayersList imported={imported} canDelete={isAdmin} busy={busy} onZoom={(bbox) => setView({ kind: 'bbox', bbox })} onPoint={pointAt} actions={props.layerActions} />
            )
          }
          onReset={() => {
            setAssumptions(AS_WRITTEN)
            setFilters(defaultPlanFilters)
            imported.hideAll()
            stations.setOn(true)
          }}
          onCollapse={() => setFiltersOpen(false)}
        />
      )}

      {/* what no panel covers: the map aims its views here, and the small controls sit in its corners */}
      <div className="rc-stage" ref={clearArea}>
        <div className="rc-stage__tools">
          {!panels.filtersOpen && <FiltersButton className="rc-float rc-fab" count={activeFilters} onClick={() => setFiltersOpen(true)} />}
          <MapControls
            onZoom={(by) => setView({ kind: 'zoom', by })}
            onFitStations={() => setView({ kind: 'fit' })}
            onPlans={plans.available ? () => (plansOpen ? closePlans() : openPlans()) : undefined}
            plansOpen={plansOpen}
          />
        </div>
        {canAdd && !plans.loading && !editor.draft && (wide || !covered) && (
          <AddPlanButton canPick={canPick} onPick={() => addPlan('pick')} onManual={() => addPlan('manual')} onBulk={() => onBulk(true)} />
        )}
        {showEmpty && (
          <EmptyState coverage={network.coverage} canAdd={canAdd} canPick={canPick} onPick={() => addPlan('pick')} onManual={() => addPlan('manual')} onBulk={() => onBulk(true)} onDismiss={() => setEmptyDismissed(true)} />
        )}
        {hasPlans && !picking && <UnplacedNotice unplaced={network.unplaced} ambiguous={network.ambiguous} />}
        {hasPlans && <MapLegend open={panels.legendOpen && !plansOpen} onToggle={panels.toggleLegend} />}
      </div>

      <SupportCard
        node={supportOpen ? support : null}
        canAdd={isAdmin}
        onPlan={openPlan}
        onAddPlan={() => support && addPlan('pick', { no: support.no, at: support.at, load: String(support.loadA) })}
        onClose={closeSupport}
      />

      {plansOpen && plans.available && (
        <BackupPlansPanel
          plans={plans}
          rows={net.planRows}
          directory={directory}
          editor={planEditor}
          isAdmin={isAdmin}
          busy={busy}
          ratingA={ratingA}
          derating={net.monthDerating}
          monthLabel={MONTHS_AR[assumptions.month]}
          deratingOn={assumptions.deratingOn}
          supports={(selectedRow && network.nodes.get(selectedRow.mainKey)?.supports) || []}
          selectedId={planId}
          onDerating={(deratingOn) => setAssumptions((a) => ({ ...a, deratingOn }))}
          onSelect={(id, saved) => selectPlan(id, 'list', saved)}
          onExport={() => exportCsv(net.planRows.map((row) => row.plan), 'backup-plans')}
          onAdd={() => addPlan('pick')}
          onBulk={() => onBulk(true)}
          onShowOnMap={() => setPlansOpen(false)}
          onPicked={framePicked}
          onSave={(saved) => planActions.save(saved, editor.isNew ? () => addPlan('pick') : undefined)}
          actions={planActions}
          onRating={async (value) => {
            const written = await planActions.setRating(value)
            if (written) setAssumptions((a) => ({ ...a, ratingA: null }))
            return written
          }}
          onClose={closePlans}
        />
      )}

      <PhoneActions
        activeFilters={activeFilters}
        supportNo={support?.no ?? null}
        covered={covered}
        onFilters={() => setFiltersOpen(true)}
        onSupport={() => setSupportOpen(true)}
        onPlans={plans.available ? openPlans : undefined}
        onUncover={() => {
          setFiltersOpen(false)
          setSupportOpen(false)
          setPlansOpen(false)
        }}
      />

      <BottomSheet
        open={panels.sheetOpen}
        onToggle={panels.toggleSheet}
        listedCount={Math.min(PRIORITY_ROWS, net.visible.length)}
        visibleCount={net.visible.length}
        empty={!hasPlans}
        onExport={() => exportCsv(net.visible.map((row) => row.plan), 'restoration-plans')}
        table={<PriorityTable rows={net.visible.slice(0, PRIORITY_ROWS)} selectedId={planId} onSelect={openPlan} />}
        methodology={<Methodology />}
      />

      {props.bulkOpen && (
        <Suspense fallback={null}>
          <BulkEntryDialog
            sectorName={sector.nameAr}
            existing={plans.plan?.cases ?? NO_CASES}
            directory={directory}
            options={options}
            busy={busy}
            onSave={planActions.saveMany}
            onClose={() => onBulk(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
