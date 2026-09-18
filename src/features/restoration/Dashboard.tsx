import { useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { BottomSheet } from './components/BottomSheet'
import { FilterPanel } from './components/FilterPanel'
import { FiltersButton } from './components/FiltersButton'
import { ImportedLayersList } from './components/ImportedLayersList'
import { KpiCards } from './components/KpiCards'
import { MapControls } from './components/MapControls'
import { MapLegend } from './components/MapLegend'
import type { MapView } from './components/mapView'
import { Methodology } from './components/Methodology'
import { NetworkMap } from './components/NetworkMap'
import type { MapStation, MapTie } from './components/networkLayers'
import { PriorityTable } from './components/PriorityTable'
import { StationDetail } from './components/StationDetail'
import { assessNetwork } from './engine'
import { downloadCsv } from './exportCsv'
import { boundsOf, countActive, defaultFilters, defaultLayers, matches, type Filters, type Layers, type StationRow } from './filters'
import { FORECAST_LABEL, MONTHS_AR } from './labels'
import { byPriority, summarize } from './summary'
import type { Conditions, Network } from './types'
import type { ImportedLayers } from './useMapLayers'
import { useMediaQuery, WIDE_SCREEN } from './useMediaQuery'
import { useRoom } from './useRoom'
import type { Theme } from './useTheme'

interface DashboardProps {
  network: Network
  theme: Theme
  imported: ImportedLayers
  isAdmin: boolean
  /** Something is being written; destructive buttons wait. */
  busy: boolean
  onDeleteLayer: (layerId: string) => void
}

// The design case of the sector: August at peak, when loads are highest and
// thermal ratings lowest — the page opens on the worst day of the year.
const DESIGN_CASE: Conditions = { period: 7, scenario: 'peak' }
const PRIORITY_ROWS = 8
// the clear area under which the open legend would crowd the map
const LEGEND_ROOM = { width: 720, height: 460 }

export function Dashboard({ network, theme, imported, isAdmin, busy, onDeleteLayer }: DashboardProps) {
  const [conditions, setConditions] = useState(DESIGN_CASE)
  const [filters, setFilters] = useState(defaultFilters)
  const [layers, setLayers] = useState(defaultLayers)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
  // open by itself only where the map is fitted around the panels; on a scrolling page it would sit on stations
  const roomy = useRoom(clearArea, LEGEND_ROOM.width, LEGEND_ROOM.height)
  const legendOpen = roomy && wide ? (legendChoice ?? true) : legendChoice === true

  const { sector } = network
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
  const visible = useMemo(() => rows.filter((row) => matches(row, filters)), [rows, filters])
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
  const areaName = sector.areas.find((a) => a.id === selected?.station.areaId)?.nameAr ?? selected?.station.areaId ?? ''
  const periodLabel = conditions.period === 'forecast' ? FORECAST_LABEL : MONTHS_AR[conditions.period]
  const scenarioLabel = conditions.scenario === 'peak' ? 'الحمل الذروي' : 'الحالة العادية'
  const activeFilters = countActive(filters)

  // A click on the map only moves it when the opening panel would hide the
  // station; a row of the table is far from the map, so it always brings it in.
  const select = (id: string, from: 'map' | 'table') => {
    if (id === selected?.station.id && detailOpen) return setSelectedId(null)
    setSelectedId(id)
    setDetailOpen(true)
    setView({ kind: 'station', id, whenCovered: from === 'map' })
  }

  // On a wide screen the panel is the selection. On a phone it is a sheet over
  // the map: closing it keeps the station marked, and a button brings it back.
  const closeDetail = () => {
    setDetailOpen(false)
    if (wide) setSelectedId(null)
  }

  const exportCsv = () => {
    const period = conditions.period === 'forecast' ? 'forecast' : String(conditions.period + 1).padStart(2, '0')
    downloadCsv(byPriority(visible), `restoration-${sector.id}-${period}-${conditions.scenario}.csv`)
  }

  return (
    <div className="rc-console">
      <section className="rc-map" aria-label="الخريطة">
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
          theme={theme}
          onSelect={(id) => select(id, 'map')}
        />
      </section>

      <KpiCards
        summary={summary}
        total={rows.length}
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
          importedLayers={
            imported.layers.length > 0 && (
              <ImportedLayersList
                imported={imported}
                canDelete={isAdmin}
                busy={busy}
                onZoom={(bbox) => setView({ kind: 'bbox', bbox })}
                onDelete={onDeleteLayer}
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
          <MapControls onZoom={(by) => setView({ kind: 'zoom', by })} onFitStations={() => setView({ kind: 'fit' })} />
        </div>
        <MapLegend layers={layers} theme={theme} open={legendOpen} onToggle={() => setLegendChoice(!legendOpen)} />
      </div>

      <StationDetail row={detail} areaName={areaName} onClose={closeDetail} />

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
      </div>
      {(filtersOpen || detail) && (
        <button
          className="rc-scrim"
          type="button"
          aria-label="إغلاق اللوحة"
          onClick={() => {
            setFiltersOpen(false)
            setDetailOpen(false)
          }}
        />
      )}

      <BottomSheet
        open={sheetOpen}
        onToggle={() => setSheetOpen(!sheetOpen)}
        listedCount={priority.length}
        visibleCount={visible.length}
        onExport={exportCsv}
        table={<PriorityTable rows={priority} selectedId={selected?.station.id ?? null} onSelect={(id) => select(id, 'table')} />}
        methodology={<Methodology />}
      />
    </div>
  )
}
