import { placeKey } from './backup/directory'
import type { BackupCase } from './backup/model'
import type { PlanNetwork } from './backup/planNetwork'
import type { StationAction } from './components/stationPopup'
import type { LatLng } from './types'

interface StationActionsContext {
  network: PlanNetwork
  /** May add and change plans. */
  canEdit: boolean
  /** A plan is being written: a click on a station must not interrupt it. */
  writing: boolean
  onOpen: (caseId: string) => void
  onEdit: (plan: BackupCase) => void
  onStart: (station: { no: string; at: LatLng }) => void
}

/**
 * What the popup of a station offers. A station with a plan opens it (and an
 * admin may go straight to changing it); one without starts its plan, with the
 * station as the main element and its backups next. Pure.
 */
export function stationActionsOf({ network, canEdit, writing, onOpen, onEdit, onStart }: StationActionsContext) {
  return (station: { no: string; at: LatLng }): StationAction[] => {
    if (writing) return []
    const plan = network.nodes.get(placeKey(station))?.rows[0]?.plan
    if (!plan) return canEdit ? [{ label: 'بدء خطة لهذه المحطة', primary: true, run: () => onStart(station) }] : []
    const open: StationAction = { label: 'فتح الخطة', primary: true, run: () => onOpen(plan.id) }
    return canEdit ? [open, { label: 'تعديل الخطة', run: () => onEdit(plan) }] : [open]
  }
}
