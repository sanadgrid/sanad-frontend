import { useMemo, useState } from 'react'
import type { StationDirectory } from './backup/directory'
import { parseStationRows } from './backup/stationParse'
import { canImport, importedByDefault, reviewStations, stationPins, type ReviewedStation, type StationBox, type StationState } from './backup/stationReview'

interface Choices {
  /** The sheet the choices were made on. */
  of: unknown
  /** Rows whose coordinates are read the other way round. */
  fixed: ReadonlySet<number>
  /** Rows ticked or unticked by hand. */
  picks: ReadonlyMap<number, boolean>
  outsideToo: boolean
}

const fresh = (of: unknown): Choices => ({ of, fixed: new Set(), picks: new Map(), outsideToo: false })

export type StationCounts = Record<StationState, number>

/** The rows of a stations sheet, reviewed and chosen from: what would be written, and where the plans' elements then stand. Reads nothing. */
export function useStationRows(matrix: readonly (readonly string[])[] | null, directory: StationDirectory, box: StationBox, sectorId: string) {
  const [choices, setChoices] = useState(() => fresh(matrix))
  // another sheet starts from fresh choices
  const current = choices.of === matrix ? choices : fresh(matrix)
  const change = (patch: Partial<Choices>) => setChoices({ ...current, ...patch })

  const parsed = useMemo(() => (matrix ? parseStationRows(matrix) : { rows: [], hadHeader: false }), [matrix])
  const reviewed = useMemo(() => reviewStations(parsed.rows, { directory, box, fixed: current.fixed }), [parsed, directory, box, current.fixed])
  const { picks, outsideToo } = current
  const selected = useMemo(
    () => reviewed.filter((r) => canImport(r.state) && (picks.get(r.row.line) ?? (importedByDefault(r.state) || (outsideToo && r.state === 'outside')))),
    [reviewed, picks, outsideToo],
  )
  const pins = useMemo(() => stationPins(selected, sectorId), [selected, sectorId])
  const counts = useMemo(() => {
    const totals: StationCounts = { new: 0, exists: 0, moved: 0, flocUpdate: 0, outside: 0, swapped: 0, bad: 0 }
    for (const r of reviewed) totals[r.state] += 1
    return totals
  }, [reviewed])

  return {
    reviewed,
    hadHeader: parsed.hadHeader,
    selected,
    pins,
    counts,
    outsideToo,
    isPicked: (r: ReviewedStation) => selected.includes(r),
    pick: (line: number, on: boolean) => change({ picks: new Map(picks).set(line, on) }),
    /** Reads the row's latitude and longitude the other way round. */
    fix: (line: number) => change({ fixed: new Set([...current.fixed, line]) }),
    setOutsideToo: (on: boolean) => change({ outsideToo: on }),
  }
}

export type StationRows = ReturnType<typeof useStationRows>
