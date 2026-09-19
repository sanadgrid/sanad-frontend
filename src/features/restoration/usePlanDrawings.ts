import { useMemo } from 'react'
import { allPoints, placeOf, toLatLng, type StationDirectory } from './backup/directory'
import { toCase } from './backup/draft'
import { assessCase, type BackupCase, type CaseResult, type ModelOptions } from './backup/model'
import type { CaseRow } from './backup/planNetwork'
import { pointKey } from './components/pickLayer'
import type { PlanDrawing } from './components/planLinks'
import type { PlanEditor } from './usePlanEditor'

const NO_PLANS: PlanDrawing[] = []
const NO_KEYS: string[] = []

// An element stands at the place it names, else where the directory first finds its number.
function drawingOf(plan: BackupCase, result: CaseResult, directory: StationDirectory, quiet: boolean): PlanDrawing[] {
  const main = placeOf(directory, plan.main)
  if (!main) return []
  const links = plan.backups.flatMap((backup, order) => {
    const at = placeOf(directory, backup)
    const { transferA, level } = result.transfers[order]
    return at ? [{ order, no: backup.no, at, transferA, level }] : []
  })
  return [{ id: plan.id, main: { no: plan.main.no, at: main }, links, selected: true, quiet }]
}

/**
 * What the plan layer draws over the network: the plan being written, as it is
 * typed or clicked — else the plan being read, with the flow toward its main
 * element and the amperes on its links. And, while stations are clicked into a
 * plan, every station that can be. Reads nothing.
 */
export function usePlanDrawings(editor: PlanEditor, selected: CaseRow | null, directory: StationDirectory, options: ModelOptions) {
  const { draft, picking } = editor

  const drawings = useMemo(() => {
    if (draft) {
      const written = toCase(draft)
      return drawingOf(written, assessCase(written, options), directory, written.main.loadA === 0)
    }
    return selected ? drawingOf(selected.plan, selected.result, directory, false) : NO_PLANS
  }, [draft, selected, directory, options])

  const pickable = useMemo(() => (picking ? allPoints(directory) : null), [picking, directory])
  const pickedBackups = useMemo(
    () => (draft && picking ? draft.backups.flatMap((row) => (row.at ? [pointKey({ no: row.no.trim(), at: toLatLng(row.at) })] : [])) : NO_KEYS),
    [draft, picking],
  )

  return { drawings, pickable, pickedBackups }
}
