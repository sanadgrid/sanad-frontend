import { placesOf, toPosition, type StationDirectory } from './backup/directory'
import type { BackupCase } from './backup/model'
import type { PlanNetwork } from './backup/planNetwork'
import { stationActionsOf } from './stationActions'
import type { LatLng } from './types'
import type { PlanEditor } from './usePlanEditor'

interface PlanEntryContext {
  directory: StationDirectory
  network: PlanNetwork
  editor: PlanEditor
  canAdd: boolean
  /** Opens the plans panel on a plan, or on nothing — where a new plan is written. */
  openPlan: (caseId: string | null) => void
}

/** A station to start from: its number, where it stands (if anywhere), and what it carries. */
export interface StartingPoint {
  no: string
  at: LatLng | null
  load?: string
}

/**
 * The ways into a new plan. It starts on the map, step by step, wherever there
 * are stations to click; a station given (`at`) is its main element and the
 * backups come next. Without stations on the map, the full form is the way in.
 */
export function usePlanEntry({ directory, network, editor, canAdd, openPlan }: PlanEntryContext) {
  const canPick = directory.size > 0

  const addPlan = (how: 'pick' | 'manual' = 'pick', from?: StartingPoint) => {
    openPlan(null)
    if (how === 'manual' || !canPick) {
      editor.open()
      if (from) editor.change((d) => ({ ...d, main: { ...d.main, no: from.no, load: from.load ?? '' } }))
      return
    }
    const place = from?.at && placesOf(directory, from.no).find((p) => p.at.lat === from.at?.lat && p.at.lng === from.at?.lng)
    editor.openGuided(from && { no: from.no, load: from.load ?? '', ...(from.at && { at: toPosition(from.at) }), ...(place && { layerId: place.layerId }) })
  }

  const stationActions = stationActionsOf({
    network,
    canEdit: canAdd,
    writing: Boolean(editor.draft),
    onOpen: openPlan,
    onEdit: (plan: BackupCase) => {
      openPlan(plan.id)
      editor.open(plan)
    },
    onStart: (station) => addPlan('pick', station),
  })

  return { canPick, addPlan, stationActions }
}
