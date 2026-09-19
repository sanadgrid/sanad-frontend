import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BackupPlan } from '../../services/backupPlanDoc'
import { deleteBackupCase, loadBackupPlan, saveBackupCase, setDefaultRating, type LoadedPlan } from '../../services/backupPlans'
import type { BackupCase } from './backup/model'

/** Where the plans are kept. The page uses the database; anything with the same four functions will do. */
export interface PlanStore {
  load: (sectorId: string) => Promise<LoadedPlan | null>
  saveCase: (sectorId: string, saved: BackupCase) => Promise<BackupPlan>
  deleteCase: (sectorId: string, caseId: string) => Promise<BackupPlan>
  setRating: (sectorId: string, ratingA: number) => Promise<BackupPlan>
}

const database: PlanStore = { load: loadBackupPlan, saveCase: saveBackupCase, deleteCase: deleteBackupCase, setRating: setDefaultRating }

export interface BackupPlans {
  /** Signed in: a visitor never sees the feature. */
  available: boolean
  loading: boolean
  /** Asks for the plans. Nothing is read before the panel is first opened, so a visit that never opens it costs nothing. */
  request: () => void
  plan: BackupPlan | null
  notice: LoadedPlan['notice']
  /** These reject when the change could not be written. */
  save: (saved: BackupCase) => Promise<void>
  remove: (caseId: string) => Promise<void>
  setRating: (ratingA: number) => Promise<void>
}

/**
 * The backup plans of a sector, for a signed-in user. They live above the
 * dashboard so they survive a reload of the network; what the user may read or
 * write is decided by the database rules.
 */
export function useBackupPlans(sectorId: string | undefined, uid: string | undefined, store: PlanStore = database): BackupPlans {
  const [loaded, setLoaded] = useState<{ for: string; result: LoadedPlan | null } | null>(null)
  const [requested, setRequested] = useState(false)
  const wanted = sectorId && uid ? `${sectorId}:${uid}` : null

  useEffect(() => {
    if (!requested || !wanted || !sectorId) return
    let cancelled = false
    store.load(sectorId).then((result) => {
      if (!cancelled) setLoaded({ for: wanted, result })
    })
    return () => {
      cancelled = true
    }
  }, [requested, wanted, sectorId, store])

  const request = useCallback(() => setRequested(true), [])

  // what was read for another sector or another user is never shown
  const current = loaded && loaded.for === wanted ? loaded : null

  const write = useCallback(
    async (change: (sectorId: string) => Promise<BackupPlan>) => {
      if (!sectorId || !wanted) return
      const plan = await change(sectorId)
      setLoaded({ for: wanted, result: { plan } })
    },
    [sectorId, wanted],
  )

  return useMemo(
    () => ({
      available: Boolean(wanted) && (!current || current.result !== null),
      loading: Boolean(wanted) && requested && !current,
      request,
      plan: current?.result?.plan ?? null,
      notice: current?.result?.notice,
      save: (saved) => write((id) => store.saveCase(id, saved)),
      remove: (caseId) => write((id) => store.deleteCase(id, caseId)),
      setRating: (ratingA) => write((id) => store.setRating(id, ratingA)),
    }),
    [wanted, requested, current, request, write, store],
  )
}
