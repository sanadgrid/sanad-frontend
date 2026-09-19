import { trashKey } from '../../services/backupPlanDoc'
import type { BackupCase } from './backup/model'
import type { BackupPlans } from './useBackupPlans'
import type { ImportedLayers } from './useMapLayers'
import type { ToastMessage } from './useToast'

// What an admin does to the plans and the layers, with what the page says
// afterwards. A deletion is always said with a way back: the plan or the layer
// waits in the trash, and the message itself can undo it.

/** Runs a task behind the page's busy flag; resolves to whether it went through. A failure has been said on screen by then. */
export type Run = (task: () => Promise<void>, failed: string | ((error: unknown) => string), done?: string | ToastMessage) => Promise<boolean>

export interface PlanActions {
  /** `another`: offered with the confirmation — the next plan, one click away. */
  save: (saved: BackupCase, another?: () => void) => Promise<boolean>
  saveMany: (saved: BackupCase[]) => Promise<boolean>
  /** Into the trash; the message offers to take it back. */
  remove: (caseId: string) => Promise<boolean>
  /** By `trashKey`. */
  restore: (key: string) => Promise<boolean>
  purge: (key: string) => Promise<boolean>
  setRating: (ratingA: number) => Promise<boolean>
}

export interface LayerActions {
  remove: (layerIds: string[]) => Promise<boolean>
  restore: (layerIds: string[]) => Promise<boolean>
  /** For good: the parts of the layers are deleted. */
  destroy: (layerIds: string[]) => Promise<boolean>
}

const PLAN_WRITE_FAILED = 'تعذّر حفظ التغيير. تأكد من صلاحياتك وحاول مرة أخرى.'
const LAYER_WRITE_FAILED = 'تعذّر حذف الطبقة. تأكد من صلاحياتك وحاول مرة أخرى.'
const LAYER_RESTORE_FAILED = 'تعذّرت استعادة الطبقة. تأكد من صلاحياتك وحاول مرة أخرى.'
const UNDO = 'تراجع'

export function planActions(plans: BackupPlans, run: Run): PlanActions {
  const restore = (key: string) => run(() => plans.restore(key), PLAN_WRITE_FAILED, 'تمت استعادة الخطة')
  return {
    save: (saved, another) =>
      run(() => plans.save(saved), PLAN_WRITE_FAILED, { kind: 'ok', text: 'تم حفظ الخطة', ...(another && { action: { label: 'إضافة خطة أخرى', run: another } }) }),
    saveMany: (saved) => run(() => plans.saveMany(saved), PLAN_WRITE_FAILED, 'تم حفظ الخطط'),
    remove: (caseId) => {
      const at = Date.now()
      const undo = { label: UNDO, run: () => void restore(trashKey(caseId, at)) }
      return run(() => plans.remove(caseId, at), PLAN_WRITE_FAILED, { kind: 'ok', text: 'حُذفت الخطة', action: undo })
    },
    restore,
    purge: (key) => run(() => plans.purge(key), PLAN_WRITE_FAILED, 'حُذفت الخطة نهائياً'),
    setRating: (ratingA) => run(() => plans.setRating(ratingA), PLAN_WRITE_FAILED, 'تم حفظ سعة القاطع المعتمدة'),
  }
}

/** A run of deletions that stopped half-way: what went is gone, and the message says where it stopped. */
class StoppedDeleting extends Error {
  text: string

  constructor(removed: number, total: number, name: string) {
    super('map layers: the deletion stopped half-way')
    this.text = `حُذفت ${removed} من ${total}، ثم تعذّر حذف «${name}». حاول مرة أخرى للباقي.`
  }
}

export function layerActions(layers: ImportedLayers, run: Run): LayerActions {
  const restore = (layerIds: string[]) => run(() => layers.restore(layerIds), LAYER_RESTORE_FAILED, layerIds.length > 1 ? 'تمت استعادة الطبقات' : 'تمت استعادة الطبقة')
  return {
    remove: (layerIds) =>
      run(() => layers.remove(layerIds), LAYER_WRITE_FAILED, {
        kind: 'ok',
        text: layerIds.length > 1 ? 'حُذفت الطبقات المكررة' : 'حُذفت الطبقة',
        action: { label: UNDO, run: () => void restore(layerIds) },
      }),
    restore,
    destroy: (layerIds) =>
      run(
        async () => {
          const { removed, failed } = await layers.destroy(layerIds)
          const name = layers.trashed.find((layer) => layer.id === failed)?.name
          if (failed) throw new StoppedDeleting(removed.length, layerIds.length, name ?? 'إحدى الطبقات')
        },
        (error) => (error instanceof StoppedDeleting ? error.text : LAYER_WRITE_FAILED),
        layerIds.length > 1 ? 'حُذفت الطبقات نهائياً' : 'حُذفت الطبقة نهائياً',
      ),
  }
}
