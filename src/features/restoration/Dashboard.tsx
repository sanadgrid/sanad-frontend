import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { allPoints, buildDirectory, directoryBounds, locate, placeOf, toLatLng } from './backup/directory'
import { toCase } from './backup/draft'
import { feederCase, stationFeeders } from './backup/fromNetwork'
import { assessCase, type BackupCase } from './backup/model'
import { plansToCsv } from './backup/planCsv'
import { BackupPlansPanel, type PlanRow } from './components/BackupPlansPanel'
import { BottomSheet } from './components/BottomSheet'
import { FeederCard } from './components/FeederCard'
import { FilterPanel } from './components/FilterPanel'
import { FiltersButton } from './components/FiltersButton'
import { ImportedLayersList } from './components/ImportedLayersList'
import { KpiCards } from './components/KpiCards'
import { MapControls } from './components/MapControls'
import { MapLegend } from './components/MapLegend'
import type { MapView, Place } from './components/mapView'
import { Methodology } from './components/Methodology'
import { NetworkMap } from './components/NetworkMap'
import type { MapStation, MapTie } from './components/networkLayers'
import { pointKey } from './components/pickLayer'
import type { PlanDrawing } from './components/planLinks'
import { PriorityTable } from './components/PriorityTable'
import { StationDetail } from './components/StationDetail'
import { assessNetwork, derating } from './engine'
import { downloadCsv, saveCsv } from './exportCsv'
import { boundsOf, countActive, defaultFilters, defaultLayers, matches, type Filters, type Layers, type StationRow } from './filters'
import { FORECAST_LABEL, MONTHS_AR } from './labels'
import { byPriority, summarize } from './summary'
import type { Conditions, LatLng, Network } from './types'
import type { BackupPlans } from './useBackupPlans'
import type { Basemap } from './useBasemap'
import type { ImportedLayers } from './useMapLayers'
import { useMediaQuery, WIDE_SCREEN } from './useMediaQuery'
import { usePlanEditor } from './usePlanEditor'
import { useRoom } from './useRoom'
import type { Theme } from './useTheme'

interface DashboardProps {
  network: Network
  theme: Theme
  imported: ImportedLayers
  plans: BackupPlans
  basemap: Basemap
  /** Whether the synthetic training network is drawn; only asked of a network that is one. */
  demoNetwork: boolean
  isAdmin: boolean
  /** Something is being written; destructive buttons wait. */
  busy: boolean
  onBasemap: (basemap: Basemap) => void
  onDemoNetwork: (shown: boolean) => void
  onDeleteLayer: (layerId: string) => void
  onDeleteLayers: (layerIds: string[]) => void
  /** These resolve to whether the change was written. */
  onSavePlan: (saved: BackupCase) => Promise<boolean>
  onDeletePlan: (caseId: string) => Promise<boolean>
  onPlanRating: (ratingA: number) => Promise<boolean>
}

// The design case of the sector: August at peak, when loads are highest and
// thermal ratings lowest — the page opens on the worst day of the year.
const DESIGN_CASE: Conditions = { period: 7, scenario: 'peak' }
const PRIORITY_ROWS = 8
// the clear area under which the open legend would crowd the map
const LEGEND_ROOM = { width: 720, height: 460 }
const NO_TIES: ReadonlySet<string> = new Set()
const NO_PLANS: PlanDrawing[] = []
const NO_KEYS: string[] = []

export function Dashboard(props: DashboardProps) {
  const { network, theme, imported, plans, basemap, isAdmin, busy, onDeleteLayer } = props
  const [conditions, setConditions] = useState(DESIGN_CASE)
  const [filters, setFilters] = useState(defaultFilters)
  const [layers, setLayers] = useState(defaultLayers)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // the feeder whose loss is being looked at, inside the selected station's panel
  const [feederId, setFeederId] = useState<string | null>(null)
  const [plansOpen, setPlansOpen] = useState(false)
  const [planId, setPlanId] = useState<string | null>(null)
  const [showAllPlans, setShowAllPlans] = useState(false)
  const [plansDerated, setPlansDerated] = useState(false)
  // The map is the page: every panel over it can be folded away. On a phone the
  // table is part of the page below the map, so it starts open there.
  const wide = useMediaQuery(WIDE_SCREEN)
  const [kpisOpen, setKpisOpen] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(!wide)
  // the legend yields when the panels leave it little room, until the user decides otherwise
  const [legendChoice, setLegendChoice] = useState<boolean | null>(null)
  // a fresh object every time, so asking for the same view twice moves the map twice
  const [view, setView] = useState<MapView | null>(null)
  const clearArea = useRef<HTMLDivElement>(null)
  const mapSection = useRef<HTMLElement>(null)
  const editor = usePlanEditor()
  // open by itself only where the map is fitted around the panels; on a scrolling page it would sit on stations
  const roomy = useRoom(clearArea, LEGEND_ROOM.width, LEGEND_ROOM.height)
  // …and while a backup plan is on the map, whose colours are not the legend's
  const legendOpen = roomy && wide ? (legendChoice ?? !plansOpen) : legendChoice === true

  const { sector } = network
  // A public network is the synthetic one, kept for training: it is drawn only when
  // asked for. Without it the page is the imported layers and the backup plans.
  const synthetic = sector.visibility === 'public'
  const networkShown = !synthetic || props.demoNetwork
  const assessments = useMemo(() => assessNetwork(network, conditions), [network, conditions])
  const bounds = useMemo(() => boundsOf(network), [network])

  const rows = useMemo(
    () =>
      network.substations.flatMap((station): StationRow[] => {
        const assessment = assessments.get(station.id)
        return assessment ? [{ station, assessment }] : []
      }),
    [network, assessments],
  )
  const visible = useMemo(() => (networkShown ? rows.filter((row) => matches(row, filters)) : []), [networkShown, rows, filters])
  const summary = useMemo(() => summarize(visible), [visible])
  const priority = useMemo(() => byPriority(visible).slice(0, PRIORITY_ROWS), [visible])

  const { stations, ties } = useMemo(() => {
    const stations = new Map<string, MapStation>(
      visible.map(({ station: s, assessment: a }) => [
        s.id,
        {
          id: s.id,
          code: s.code,
          district: s.district,
          location: s.location,
          status: a.status,
          capacityPct: a.capacityPct,
          loadMva: a.loadMva,
          sensitive: s.sensitiveCustomers.length > 0,
          vip: s.vipCustomers.length > 0,
        },
      ]),
    )
    const feederById = new Map(network.feeders.map((f) => [f.id, f]))
    // a tie is drawn only when both of its stations passed the filters
    const ties = network.ties.flatMap((tie): MapTie[] => {
      const fromFeeder = feederById.get(tie.fromFeederId)
      const toFeeder = feederById.get(tie.toFeederId)
      const from = fromFeeder && stations.get(fromFeeder.stationId)
      const to = toFeeder && stations.get(toFeeder.stationId)
      if (!from || !to || from === to) return []
      return [{ ...tie, from, to, fromFeederCode: fromFeeder.code, toFeederCode: toFeeder.code }]
    })
    return { stations: [...stations.values()], ties }
  }, [network, visible])

  const activeDepartments = useMemo(
    () => new Set(network.substations.flatMap((s) => (s.department ? [s.department] : []))),
    [network],
  )

  const selected = visible.find((row) => row.station.id === selectedId) ?? null
  const detail = detailOpen ? selected : null
  const selectedStationId = selected?.station.id
  const feeders = useMemo(
    () => (selectedStationId ? stationFeeders(network, selectedStationId, conditions) : []),
    [network, selectedStationId, conditions],
  )
  const lostFeeder = useMemo(() => {
    const found = feederId && detailOpen ? feederCase(network, feederId, conditions) : null
    return found?.station.id === selectedStationId ? found : null
  }, [network, feederId, detailOpen, selectedStationId, conditions])
  const highlightTies = useMemo(() => (lostFeeder ? new Set(lostFeeder.backups.flatMap((b) => b.tieIds)) : NO_TIES), [lostFeeder])

  // Backup plans: numbers and loads come from the database, places from the
  // station lists of the imported layers — nothing here reads anything.
  const periodDerating = derating(network, conditions)
  const directory = useMemo(() => buildDirectory(imported.layers), [imported.layers])
  const planRating = plans.plan?.ratingA
  const planRows = useMemo(
    () =>
      (plans.plan?.cases ?? []).map(
        (plan): PlanRow => ({
          plan,
          plain: assessCase(plan, { ratingA: planRating }),
          derated: assessCase(plan, { ratingA: planRating, derating: periodDerating }),
        }),
      ),
    [plans.plan, planRating, periodDerating],
  )
  const plansShown = plans.available && (planId !== null || showAllPlans)
  // The plan being written is drawn as it is typed or clicked, alone. An element
  // stands at the place it names, else where the directory first finds its number.
  const draft = editor.draft
  const planDrawings = useMemo(() => {
    const drawing = (plan: BackupCase, result: PlanRow['plain'], selected: boolean, quiet = false): PlanDrawing[] => {
      const main = placeOf(directory, plan.main)
      if (!main) return []
      const links = plan.backups.flatMap((backup, order) => {
        const at = placeOf(directory, backup)
        const { transferA, level } = result.transfers[order]
        return at ? [{ order, no: backup.no, at, transferA, level }] : []
      })
      return [{ id: plan.id, main: { no: plan.main.no, at: main }, links, selected, quiet }]
    }
    if (draft) {
      const written = toCase(draft)
      return drawing(written, assessCase(written, { ratingA: planRating, derating: plansDerated ? periodDerating : 1 }), true, written.main.loadA === 0)
    }
    if (!plansShown) return NO_PLANS
    return planRows.flatMap(({ plan, plain, derated }) =>
      showAllPlans || plan.id === planId ? drawing(plan, plansDerated ? derated : plain, plan.id === planId) : [],
    )
  }, [draft, plansShown, planRows, showAllPlans, planId, directory, plansDerated, planRating, periodDerating])

  // while stations are clicked into the plan: every station of the directory, and which of them are its backups
  const pickable = useMemo(() => (editor.picking ? allPoints(directory) : null), [editor.picking, directory])
  const pickedBackups = useMemo(
    () => (draft && editor.picking ? draft.backups.flatMap((row) => (row.at ? [pointKey({ no: row.no.trim(), at: toLatLng(row.at) })] : [])) : NO_KEYS),
    [draft, editor.picking],
  )

  // What the map frames when the network is not on it: the plan being read, else
  // the imported stations — places the page already holds, so framing reads nothing.
  // Never the plan being written: the map must hold still while it is clicked on.
  const frame = useMemo(() => {
    const read = planRows.find((row) => row.plan.id === planId)?.plan
    const points = read ? [read.main, ...read.backups].flatMap((e) => placeOf(directory, e) ?? []) : []
    return points.length > 0 ? points : (directoryBounds(directory) ?? [])
  }, [planRows, planId, directory])
  const areaName = sector.areas.find((a) => a.id === selected?.station.areaId)?.nameAr ?? selected?.station.areaId ?? ''
  const periodLabel = conditions.period === 'forecast' ? FORECAST_LABEL : MONTHS_AR[conditions.period]
  const scenarioLabel = conditions.scenario === 'peak' ? 'الحمل الذروي' : 'الحالة العادية'
  const activeFilters = countActive(filters)

  // A click on the map only moves it when the opening panel would hide the
  // station; a row of the table is far from the map, so it always brings it in.
  // On a wide screen the panel is what the map shows: closing it clears the map of it.
  const closePlans = () => {
    setPlansOpen(false)
    editor.close()
    if (!wide) return
    setPlanId(null)
    setShowAllPlans(false)
  }

  const select = (id: string, from: 'map' | 'table') => {
    setFeederId(null)
    if (id === selected?.station.id && detailOpen) return setSelectedId(null)
    setSelectedId(id)
    setDetailOpen(true)
    closePlans()
    setView({ kind: 'station', id, whenCovered: from === 'map' })
  }

  // A station or a shape picked in the list of an imported layer: the layer is
  // switched on if it was not, and on a phone the sheet gives way to the map.
  const pointAt = (layerId: string, place: Place) => {
    if (!imported.active.has(layerId)) imported.toggle(layerId, true)
    setView({ kind: 'place', layerId, place })
    if (!wide) setFiltersOpen(false)
  }

  // On a wide screen the panel is the selection. On a phone it is a sheet over
  // the map: closing it keeps the station marked, and a button brings it back.
  const closeDetail = () => {
    setDetailOpen(false)
    setFeederId(null)
    if (wide) setSelectedId(null)
  }

  const openPlans = () => {
    plans.request()
    closeDetail()
    setPlansOpen(true)
    if (!wide) setFiltersOpen(false)
  }

  // Choosing a plan frames its stations and switches on a layer that shows each of them.
  const selectPlan = (id: string | null, saved?: BackupCase) => {
    setPlanId(id)
    const plan = saved ?? planRows.find((row) => row.plan.id === id)?.plan
    if (!plan) return
    const elements = [plan.main, ...plan.backups]
    // the layer an element was chosen in, while it exists; else every layer that lists its number
    const layersOf = (e: (typeof elements)[number]) =>
      e.layerId && imported.layers.some((layer) => layer.id === e.layerId) ? [e.layerId] : (locate(directory, e.no)?.layerIds ?? [])
    const hidden = elements.map(layersOf).filter((ids) => ids.length > 0 && !ids.some((layerId) => imported.active.has(layerId)))
    for (const layerId of new Set(hidden.map((ids) => ids[0]))) imported.toggle(layerId, true)
    const points = elements.flatMap((e) => placeOf(directory, e) ?? [])
    if (points.length > 0) setView({ kind: 'points', points })
  }

  // The form gives way to the map. Nothing on the map changes but the squares that
  // can be clicked; on a phone, where the page scrolls, the map is brought under the finger.
  const picking = editor.picking
  useEffect(() => {
    if (picking && !wide) mapSection.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [picking, wide])
  const framePicked = () => {
    const points = editor.draft ? [editor.draft.main, ...editor.draft.backups].flatMap((row): LatLng[] => (row.at ? [toLatLng(row.at)] : [])) : []
    if (points.length > 1) setView({ kind: 'points', points })
  }
  const pointOut = (at: LatLng | null) => {
    editor.setHover(at)
    if (at) setView({ kind: 'reveal', at })
  }

  // the form's editor; pointing a place out also brings it into view
  const planEditor = { ...editor, setHover: pointOut }

  const exportPlans = () =>
    saveCsv(
      plansToCsv(
        planRows.map((row) => row.plan),
        { ratingA: planRating },
        periodDerating,
      ),
      `backup-plans-${sector.id}.csv`,
    )

  const exportCsv = () => {
    const period = conditions.period === 'forecast' ? 'forecast' : String(conditions.period + 1).padStart(2, '0')
    downloadCsv(byPriority(visible), `restoration-${sector.id}-${period}-${conditions.scenario}.csv`)
  }

  return (
    <div className="rc-console">
      <section className="rc-map" aria-label="الخريطة" ref={mapSection}>
        <NetworkMap
          center={sector.center}
          zoom={sector.zoom}
          stations={stations}
          ties={ties}
          layers={layers}
          imported={imported.visible}
          view={view}
          clearArea={clearArea}
          selectedId={selected?.station.id ?? null}
          highlightTies={highlightTies}
          plans={planDrawings}
          frame={frame}
          pickable={pickable}
          pickedBackups={pickedBackups}
          pointedOut={editor.hover}
          theme={theme}
          onSelect={(id) => select(id, 'map')}
          onSelectPlan={(id) => {
            // the plan being written is not one to open
            if (editor.draft) return
            openPlans()
            selectPlan(id)
          }}
          onPick={editor.pick}
        />
      </section>

      <KpiCards
        summary={summary}
        total={rows.length}
        empty={!networkShown}
        sectorName={sector.nameAr}
        conditionsLabel={`${periodLabel} · ${scenarioLabel}`}
        open={kpisOpen}
        onToggle={() => setKpisOpen(!kpisOpen)}
      />

      {filtersOpen && (
        <FilterPanel
          sector={sector}
          activeDepartments={activeDepartments}
          conditions={conditions}
          filters={filters}
          layers={layers}
          bounds={bounds}
          activeCount={activeFilters}
          basemap={basemap}
          onBasemap={props.onBasemap}
          networkShown={networkShown}
          demoNetwork={synthetic ? props.demoNetwork : undefined}
          onDemoNetwork={props.onDemoNetwork}
          onPlans={plans.available ? openPlans : undefined}
          importedLayers={
            imported.layers.length > 0 && (
              <ImportedLayersList
                imported={imported}
                canDelete={isAdmin}
                busy={busy}
                onZoom={(bbox) => setView({ kind: 'bbox', bbox })}
                onPoint={pointAt}
                onDelete={onDeleteLayer}
                onDeleteMany={props.onDeleteLayers}
              />
            )
          }
          onConditions={(patch) => setConditions((c) => ({ ...c, ...patch }))}
          onFilters={(patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))}
          onLayers={(patch: Partial<Layers>) => setLayers((l) => ({ ...l, ...patch }))}
          onReset={() => {
            setConditions(DESIGN_CASE)
            setFilters(defaultFilters)
            setLayers(defaultLayers)
            imported.hideAll()
          }}
          onCollapse={() => setFiltersOpen(false)}
        />
      )}

      {/* what no panel covers: the map aims its views here, and the small controls sit in its corners */}
      <div className="rc-stage" ref={clearArea}>
        <div className="rc-stage__tools">
          {!filtersOpen && <FiltersButton className="rc-float rc-fab" count={activeFilters} onClick={() => setFiltersOpen(true)} />}
          <MapControls
            onZoom={(by) => setView({ kind: 'zoom', by })}
            onFitStations={() => setView({ kind: 'fit' })}
            onPlans={plans.available ? () => (plansOpen ? closePlans() : openPlans()) : undefined}
            plansOpen={plansOpen}
          />
        </div>
        {networkShown && <MapLegend layers={layers} theme={theme} open={legendOpen} onToggle={() => setLegendChoice(!legendOpen)} />}
      </div>

      <StationDetail
        row={detail}
        synthetic={synthetic}
        areaName={areaName}
        feeders={feeders}
        feederCard={
          lostFeeder && (
            <FeederCard
              key={lostFeeder.feeder.id}
              feederCase={lostFeeder}
              conditionsLabel={`${periodLabel} · ${scenarioLabel}`}
              periodLabel={periodLabel}
              onBack={() => setFeederId(null)}
            />
          )
        }
        onFeeder={setFeederId}
        onClose={closeDetail}
      />

      {plansOpen && plans.available && (
        <BackupPlansPanel
          plans={plans}
          rows={planRows}
          directory={directory}
          editor={planEditor}
          isAdmin={isAdmin}
          busy={busy}
          derating={periodDerating}
          periodLabel={periodLabel}
          deratingOn={plansDerated}
          selectedId={planId}
          showAll={showAllPlans}
          onDerating={setPlansDerated}
          onSelect={selectPlan}
          onShowAll={setShowAllPlans}
          onExport={exportPlans}
          onShowOnMap={() => setPlansOpen(false)}
          onPicked={framePicked}
          onSave={props.onSavePlan}
          onDelete={props.onDeletePlan}
          onRating={props.onPlanRating}
          onClose={closePlans}
        />
      )}

      {/* phones: the panels are sheets over the page, opened from under the map */}
      <div className="rc-actions">
        <FiltersButton className="rc-btn" count={activeFilters} onClick={() => setFiltersOpen(true)} />
        <button className="rc-btn" type="button" disabled={!selected} onClick={() => setDetailOpen(true)}>
          <Icon name="activity" size={15} />
          {selected ? (
            <>
              تفاصيل{' '}
              <span className="num" dir="ltr">
                {selected.station.code}
              </span>
            </>
          ) : (
            'اختر محطة لعرض تفاصيلها'
          )}
        </button>
        {plans.available && (
          <button className="rc-btn rc-actions__wide" type="button" onClick={openPlans}>
            <Icon name="swap" size={15} />
            خطط التغذية البديلة
          </button>
        )}
      </div>
      {(filtersOpen || detail || (plansOpen && plans.available && !editor.picking)) && (
        <button
          className="rc-scrim"
          type="button"
          aria-label="إغلاق اللوحة"
          onClick={() => {
            setFiltersOpen(false)
            setDetailOpen(false)
            setPlansOpen(false)
          }}
        />
      )}

      <BottomSheet
        open={sheetOpen}
        onToggle={() => setSheetOpen(!sheetOpen)}
        listedCount={priority.length}
        visibleCount={visible.length}
        empty={!networkShown}
        onExport={exportCsv}
        table={<PriorityTable rows={priority} selectedId={selected?.station.id ?? null} onSelect={(id) => select(id, 'table')} />}
        methodology={<Methodology />}
      />
    </div>
  )
}
