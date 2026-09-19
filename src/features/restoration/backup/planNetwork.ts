import type { Status } from '../engine'
import { normalizeQuery } from '../import/stations'
import type { LatLng } from '../types'
import { locate, placeOf, placesOf, type StationDirectory } from './directory'
import { assessCase, statusOf, type BackupCase, type BackupElement, type CaseResult, type LoadingLevel, type ModelOptions } from './model'
import { ampsToMva, mvaToMw } from './units'

// The network the dashboard shows is the backup plans themselves: every element a
// plan names is a station on the map, every (backup → main) pair a link. One case
// at a time — a backup shared by two mains is judged against each of them alone,
// never against both failing together. Pure: the places come from the station
// directory the page already holds.

/** One backup standing behind one main element, with what the case would move onto it. */
export interface SupportLink {
  id: string
  caseId: string
  /** Its place in the plan: 0 = first backup. */
  order: number
  /** Node keys: the backup, and the main element it would feed. */
  from: string
  to: string
  backupNo: string
  mainNo: string
  loadA: number
  /** The rating the backup was held to, after derating. */
  ratingA: number
  transferA: number
  finalLoadA: number
  finalLoadingPct: number
  level: LoadingLevel
}

export interface CaseRow {
  plan: BackupCase
  result: CaseResult
  mainKey: string
  links: SupportLink[]
  /** The highest loading any of its backups ends at; `null` without backups. */
  worstBackupPct: number | null
}

export interface PlanNode {
  key: string
  no: string
  /** `null`: the number is not in the imported stations and the plan names no point — listed, not drawn. */
  at: LatLng | null
  name: string | null
  /** The cases it is the main element of, weakest first: the node carries the first one's result. Empty = support only. */
  rows: CaseRow[]
  /** What it would take as a backup: one link per main element it stands behind. */
  supports: SupportLink[]
  loadA: number
  voltageKv: number
  loadMva: number
  /** Its loading today, against the rating it is held to as a backup; `null` for an element that backs nothing up. */
  nowPct: number | null
  /** The worst single case: the highest loading it would end at. */
  worstPct: number | null
  worstLevel: LoadingLevel | null
}

export interface Coverage {
  /** Imported stations that are the main element of at least one plan. */
  planned: number
  imported: number
}

export interface PlanNetwork {
  rows: CaseRow[]
  nodes: ReadonlyMap<string, PlanNode>
  links: SupportLink[]
  coverage: Coverage
  /** Numbers that stand nowhere on the map. */
  unplaced: string[]
  /** Numbers that stand at several places and whose plan does not say which. */
  ambiguous: string[]
}

export interface PlanKpis {
  cases: number
  loadA: number
  loadMva: number
  spareA: number
  restorableA: number
  unrestorableA: number
  unrestorableMva: number
  unrestorableMw: number
  /** Load-weighted: Σ restorable / Σ load. */
  ratio: number
  status: Status
  below100: number
  /** Backups that would stand above their rating, each counted once however many cases call on it. */
  overRated: number
  byStatus: Record<Status, number>
}

const loadingPct = (loadA: number, ratingA: number) => (ratingA > 0 ? (loadA / ratingA) * 100 : loadA > 0 ? Infinity : 0)

export const isSupportOnly = (node: PlanNode) => node.rows.length === 0

/** Weakest restoration first; among equals, the one leaving the most load dark. */
export const byPriority = (rows: CaseRow[]): CaseRow[] =>
  [...rows].sort((a, b) => a.result.ratio - b.result.ratio || b.result.unrestorableA - a.result.unrestorableA)

export function derivePlanNetwork(cases: BackupCase[], directory: StationDirectory, options: ModelOptions = {}): PlanNetwork {
  const nodes = new Map<string, PlanNode>()
  const unplaced = new Set<string>()
  const ambiguous = new Set<string>()

  const nodeOf = (element: BackupElement, voltageKv: number): PlanNode => {
    const no = normalizeQuery(element.no)
    const at = placeOf(directory, element)
    const key = at ? `${no}@${at.lng},${at.lat}` : `${no}@`
    if (!at) unplaced.add(no)
    else if (!element.at && placesOf(directory, no).length > 1) ambiguous.add(no)
    const known = nodes.get(key)
    if (known) return known
    const point = at && locate(directory, no)?.points.find((p) => p.at.lat === at.lat && p.at.lng === at.lng)
    const name = point && point.name !== `S/S ${point.no}` ? point.name : null
    const node: PlanNode = { key, no, at, name, rows: [], supports: [], loadA: 0, voltageKv, loadMva: 0, nowPct: null, worstPct: null, worstLevel: null }
    nodes.set(key, node)
    return node
  }

  const rows = cases.map((plan): CaseRow => {
    const result = assessCase(plan, options)
    const main = nodeOf(plan.main, plan.voltageKv)
    const links = plan.backups.map((backup, order): SupportLink => {
      const t = result.transfers[order]
      const node = nodeOf(backup, plan.voltageKv)
      const link: SupportLink = {
        id: `${plan.id}:${order}`,
        caseId: plan.id,
        order,
        from: node.key,
        to: main.key,
        backupNo: node.no,
        mainNo: main.no,
        loadA: t.loadA,
        ratingA: t.ratingA,
        transferA: t.transferA,
        finalLoadA: t.finalLoadA,
        finalLoadingPct: t.finalLoadingPct,
        level: t.level,
      }
      node.supports.push(link)
      return link
    })
    const row: CaseRow = { plan, result, mainKey: main.key, links, worstBackupPct: links.length > 0 ? Math.max(...links.map((l) => l.finalLoadingPct)) : null }
    main.rows.push(row)
    return row
  })

  for (const node of nodes.values()) {
    node.rows = byPriority(node.rows)
    const worst = node.supports.reduce<SupportLink | null>((max, link) => (!max || link.finalLoadingPct > max.finalLoadingPct ? link : max), null)
    // its own load: what its plan says, else the highest figure a plan that calls on it gives
    node.loadA = node.rows[0]?.result.loadA ?? Math.max(0, ...node.supports.map((link) => link.loadA))
    node.voltageKv = node.rows[0]?.plan.voltageKv ?? node.voltageKv
    node.loadMva = ampsToMva(node.loadA, node.voltageKv)
    if (!worst) continue
    node.nowPct = loadingPct(worst.loadA, worst.ratingA)
    node.worstPct = worst.finalLoadingPct
    node.worstLevel = worst.level
  }

  const planned = new Set(cases.flatMap((plan) => locate(directory, plan.main.no)?.no ?? []))
  return {
    rows,
    nodes,
    links: rows.flatMap((row) => row.links),
    coverage: { planned: planned.size, imported: directory.size },
    unplaced: [...unplaced].sort(),
    ambiguous: [...ambiguous].sort(),
  }
}

/** The figures of the strip, for the cases that passed the filters. */
export function summarizeRows(rows: CaseRow[]): PlanKpis {
  const byStatus: Record<Status, number> = { full: 0, high: 0, limited: 0, none: 0 }
  const kpis = { loadA: 0, loadMva: 0, spareA: 0, restorableA: 0, unrestorableA: 0, unrestorableMva: 0, below100: 0 }
  const over = new Set<string>()
  for (const { result: r, links } of rows) {
    byStatus[r.status] += 1
    kpis.loadA += r.loadA
    kpis.loadMva += r.loadMva
    kpis.spareA += r.totalSpareA
    kpis.restorableA += r.restorableA
    kpis.unrestorableA += r.unrestorableA
    kpis.unrestorableMva += r.unrestorableMva
    if (r.status !== 'full') kpis.below100 += 1
    for (const link of links) if (link.level === 'over') over.add(link.from)
  }
  const ratio = kpis.loadA === 0 ? 1 : kpis.restorableA / kpis.loadA
  return { ...kpis, cases: rows.length, unrestorableMw: mvaToMw(kpis.unrestorableMva), ratio, status: statusOf(ratio), overRated: over.size, byStatus }
}

/** What the map draws for the cases that passed the filters: their links, and the stations at either end. */
export function visibleNetwork(network: PlanNetwork, rows: CaseRow[]): { nodes: PlanNode[]; links: SupportLink[] } {
  const links = rows.flatMap((row) => row.links)
  const keys = new Set([...rows.map((row) => row.mainKey), ...links.map((link) => link.from)])
  return { nodes: [...keys].flatMap((key) => network.nodes.get(key) ?? []), links }
}

/** `real` as soon as one case is not a demonstration; `null` without cases. */
export const dataKind = (cases: BackupCase[]): 'real' | 'demo' | null =>
  cases.length === 0 ? null : cases.every((c) => c.demo) ? 'demo' : 'real'
