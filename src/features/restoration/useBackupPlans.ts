import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackupPlan } from '../../services/backupPlanDoc'
import { deleteBackupCase, loadBackupPlan, purgeBackupCase, restoreBackupCase, saveBackupCase, saveBackupCases, setDefaultRating, type LoadedPlan } from '../../services/backupPlans'
import type { BackupCase } from './backup/model'

/** Where the plans are kept. The page uses the database; anything with the same functions will do. */
export interface PlanStore {
  load: (sectorId: string) => Promise<LoadedPlan | null>
  saveCase: (sectorId: string, saved: BackupCase) => Promise<BackupPlan>
  saveCases: (sectorId: string, saved: BackupCase[]) => Promise<BackupPlan>
  /** Into the trash; `at` is the moment of deletion, which names the trashed case. */
  deleteCase: (sectorId: string, caseId: string, at: number) => Promise<BackupPlan>
  restoreCase: (sectorId: string, key: string) => Promise<BackupPlan>
  purgeCase: (sectorId: string, key: string) => Promise<BackupPlan>
  setRating: (sectorId: string, ratingA: number) => Promise<BackupPlan>
}

const database: PlanStore = {
  load: loadBackupPlan,
  saveCase: saveBackupCase,
  saveCases: saveBackupCases,
  deleteCase: deleteBackupCase,
  restoreCase: restoreBackupCase,
  purgeCase: purgeBackupCase,
  setRating: setDefaultRating,
}

export interface BackupPlans {
  /** Signed in, and the build has a database: without either there are no plans to show. */
  available: boolean
  loading: boolean
  plan: BackupPlan | null
  notice: LoadedPlan['notice']
  /** These reject when the change could not be written. */
  save: (saved: BackupCase) => Promise<void>
  saveMany: (saved: BackupCase[]) => Promise<void>
  /** Moves the case to the trash, where `trashKey(caseId, at)` finds it. */
  remove: (caseId: string, at: number) => Promise<void>
  /** By `trashKey`: back among the plans, or gone for good. */
  restore: (key: string) => Promise<void>
  purge: (key: string) => Promise<void>
  setRating: (ratingA: number) => Promise<void>
}

/**
 * The backup plans of a sector, for a signed-in user. They are the network the
 * dashboard shows, so they are read as the page opens: one read, then none for
 * ten minutes. What the user may read or write is decided by the database rules.
 */
export function useBackupPlans(
  sectorId: string | undefined,
  uid: string | undefined,
  /** Told once per load that came back short: the plans were refused, or the database could not answer. */
  onNotice: (notice: NonNullable<LoadedPlan['notice']>) => void = () => {},
  store: PlanStore = database,
): BackupPlans {
  const [loaded, setLoaded] = useState<{ for: string; result: LoadedPlan | null } | null>(null)
  const wanted = sectorId && uid ? `${sectorId}:${uid}` : null
  const notify = useRef(onNotice)
  useEffect(() => {
    notify.current = onNotice
  }, [onNotice])

  useEffect(() => {
    if (!wanted || !sectorId) return
    let cancelled = false
    store.load(sectorId).then((result) => {
      if (cancelled) return
      setLoaded({ for: wanted, result })
      if (result?.notice) notify.current(result.notice)
    })
    return () => {
      cancelled = true
    }
  }, [wanted, sectorId, store])

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
      loading: Boolean(wanted) && !current,
      plan: current?.result?.plan ?? null,
      notice: current?.result?.notice,
      save: (saved) => write((id) => store.saveCase(id, saved)),
      saveMany: (saved) => write((id) => store.saveCases(id, saved)),
      remove: (caseId, at) => write((id) => store.deleteCase(id, caseId, at)),
      restore: (key) => write((id) => store.restoreCase(id, key)),
      purge: (key) => write((id) => store.purgeCase(id, key)),
      setRating: (ratingA) => write((id) => store.setRating(id, ratingA)),
    }),
    [wanted, current, write, store],
  )
}
