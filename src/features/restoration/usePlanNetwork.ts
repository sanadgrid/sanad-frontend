import { useMemo } from 'react'
import type { BackupPlan } from '../../services/backupPlanDoc'
import type { StationDirectory } from './backup/directory'
import { loadingLabel, ratioLabel } from './backup/format'
import { assessCase, type BackupCase, type CaseResult } from './backup/model'
import { matchesRow, type PlanFilters } from './backup/planFilters'
import { byPriority, derivePlanNetwork, summarizeRows, visibleNetwork, type PlanNode, type SupportLink } from './backup/planNetwork'
import type { MapLink, MapNode } from './components/planNetworkLayers'
import { deratingOf, type SectorInfo } from './sectors'
import type { LatLng } from './types'

/** What every figure on the page rests on. One switch moves the whole picture. */
export interface Assumptions {
  deratingOn: boolean
  /** The month whose derating applies, 0 = January. */
  month: number
  /** A rating being tried out; `null` = the sector's own. */
  ratingA: number | null
}

/** A case with its result as the team works it out, and under the month's thermal derating. */
export interface PlanRow {
  plan: BackupCase
  plain: CaseResult
  derated: CaseResult
}

const NO_CASES: BackupCase[] = []

function mapNode(node: PlanNode): MapNode[] {
  if (!node.at) return []
  const row = node.rows[0]
  return [
    {
      key: node.key,
      no: node.no,
      name: node.name,
      floc: node.floc,
      at: node.at,
      status: row?.result.status ?? null,
      figure: row ? ratioLabel(row.result.ratio) : loadingLabel(node.worstPct ?? 0),
      worstLevel: node.worstLevel,
      loadA: node.loadA,
      loadMva: node.loadMva,
      nowPct: node.nowPct,
      worstPct: node.worstPct,
      demo: node.rows.length > 0 ? node.rows.every((r) => r.plan.demo) : false,
    },
  ]
}

function mapLink(link: SupportLink, places: ReadonlyMap<string, PlanNode>): MapLink[] {
  const from = places.get(link.from)?.at
  const to = places.get(link.to)?.at
  if (!from || !to) return []
  return [{ ...link, from, to, pair: [link.from, link.to].sort().join('|') }]
}

/** The backup plans as the network of the page: assessed under the assumptions, narrowed by the filters. Reads nothing. */
export function usePlanNetwork(plan: BackupPlan | null, directory: StationDirectory, sector: SectorInfo, assumptions: Assumptions, filters: PlanFilters) {
  const cases = plan?.cases ?? NO_CASES
  const savedRatingA = plan?.ratingA ?? sector.ratingA
  const ratingA = assumptions.ratingA ?? savedRatingA
  const monthDerating = deratingOf(sector, assumptions.month)
  const derating = assumptions.deratingOn ? monthDerating : 1

  const network = useMemo(() => derivePlanNetwork(cases, directory, { ratingA, derating }), [cases, directory, ratingA, derating])
  const planRows = useMemo(
    () => cases.map((c): PlanRow => ({ plan: c, plain: assessCase(c, { ratingA }), derated: assessCase(c, { ratingA, derating: monthDerating }) })),
    [cases, ratingA, monthDerating],
  )
  const visible = useMemo(() => byPriority(network.rows.filter((row) => matchesRow(row, filters))), [network, filters])
  const kpis = useMemo(() => summarizeRows(visible), [visible])
  const { nodes, links } = useMemo(() => {
    const shown = visibleNetwork(network, visible)
    return { nodes: shown.nodes.flatMap(mapNode), links: shown.links.flatMap((link) => mapLink(link, network.nodes)) }
  }, [network, visible])
  // every station of the plans, shown or not: a filter must not move the map
  // …nor may a switch that only changes figures: the same places are the same frame
  const placesKey = useMemo(() => JSON.stringify([...network.nodes.values()].flatMap((node): LatLng[] => (node.at ? [node.at] : []))), [network])
  const places = useMemo(() => JSON.parse(placesKey) as LatLng[], [placesKey])

  return { network, planRows, visible, kpis, nodes, links, places, ratingA, savedRatingA, monthDerating, derating }
}

export type PlanNetworkView = ReturnType<typeof usePlanNetwork>
