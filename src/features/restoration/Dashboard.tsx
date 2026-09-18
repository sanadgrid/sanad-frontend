import { useCallback, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { FilterPanel } from './components/FilterPanel'
import { ImportedLayersList } from './components/ImportedLayersList'
import { KpiCards } from './components/KpiCards'
import { MapLegend } from './components/MapLegend'
import { Methodology } from './components/Methodology'
import { NetworkMap, type MapStation, type MapTie } from './components/NetworkMap'
import { PriorityTable } from './components/PriorityTable'
import { StationDetail } from './components/StationDetail'
import { assessNetwork } from './engine'
import { downloadCsv } from './exportCsv'
import { boundsOf, defaultFilters, defaultLayers, matches, type Filters, type Layers, type StationRow } from './filters'
import type { Bbox } from './import/types'
import { FORECAST_LABEL, MONTHS_AR } from './labels'
import { byPriority, summarize } from './summary'
import type { Conditions, Network } from './types'
import type { ImportedLayers } from './useMapLayers'
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

export function Dashboard({ network, theme, imported, isAdmin, busy, onDeleteLayer }: DashboardProps) {
  const [conditions, setConditions] = useState(DESIGN_CASE)
  const [filters, setFilters] = useState(defaultFilters)
  const [layers, setLayers] = useState(defaultLayers)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // a fresh object every time, so asking for the same layer twice moves the map twice
  const [focus, setFocus] = useState<{ bbox: Bbox } | null>(null)

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
  const areaName = sector.areas.find((a) => a.id === selected?.station.areaId)?.nameAr ?? selected?.station.areaId ?? ''
  const periodLabel = conditions.period === 'forecast' ? FORECAST_LABEL : MONTHS_AR[conditions.period]
  const scenarioLabel = conditions.scenario === 'peak' ? 'الحمل الذروي' : 'الحالة العادية'

  const select = useCallback((id: string) => setSelectedId((current) => (current === id ? null : id)), [])

  const exportCsv = () => {
    const period = conditions.period === 'forecast' ? 'forecast' : String(conditions.period + 1).padStart(2, '0')
    downloadCsv(byPriority(visible), `restoration-${sector.id}-${period}-${conditions.scenario}.csv`)
  }

  return (
    <>
      <header className="rc-head">
        <div>
          <h1 className="rc-title">قدرة شبكة التوزيع على استعادة الخدمة</h1>
          <p>
            {sector.nameAr} · {periodLabel} · {scenarioLabel} — ماذا يحدث لو فُقدت المحطة بالكامل؟
          </p>
        </div>
        <button
          className="rc-btn rc-filters-toggle"
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="rc-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <Icon name="sliders" size={15} />
          خيارات التصفية
        </button>
      </header>

      <KpiCards summary={summary} total={rows.length} />

      <div className="rc-grid">
        <div className={`rc-filters-wrap${filtersOpen ? ' is-open' : ''}`} id="rc-filters">
          <FilterPanel
            sector={sector}
            activeDepartments={activeDepartments}
            conditions={conditions}
            filters={filters}
            layers={layers}
            bounds={bounds}
            importedLayers={
              imported.layers.length > 0 && (
                <ImportedLayersList
                  imported={imported}
                  canDelete={isAdmin}
                  busy={busy}
                  onZoom={(bbox) => setFocus({ bbox })}
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
          />
        </div>

        <section className="rc-panel rc-map" aria-label="الخريطة">
          <NetworkMap
            center={sector.center}
            zoom={sector.zoom}
            stations={stations}
            ties={ties}
            layers={layers}
            imported={imported.visible}
            focus={focus}
            selectedId={selected?.station.id ?? null}
            theme={theme}
            onSelect={select}
          />
          <MapLegend layers={layers} theme={theme} />
        </section>

        <StationDetail row={selected} areaName={areaName} onClose={() => setSelectedId(null)} />
      </div>

      <PriorityTable
        rows={priority}
        visibleCount={visible.length}
        selectedId={selected?.station.id ?? null}
        onSelect={select}
        onExport={exportCsv}
      />

      <Methodology />
    </>
  )
}
