import { collection, doc, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import type { BackupCase } from '../features/restoration/backup/model'
import type { Visibility } from '../features/restoration/types'
import { isFirebaseConfigured } from '../lib/firebase'
import { db } from '../lib/firestore'
import { currentUid } from './auth'
import { applyPlanChanges, emptyPlan, fitPlan, fitsOneDocument, planOf, type BackupPlan, type PlanChange } from './backupPlanDoc'
import { cache, plansKey } from './cache'
import { isDenied, isUnreachable, serverDocs, shared, withTimeout } from './reads'

// `backupPlans/{sectorId}` — the backup cases of a sector ("main 7001, first
// backup 7002, second backup 7003" and their loads) in one document. They name
// real stations, so they are always restricted: a visitor never asks for them.

const PLANS = 'backupPlans'
const RESTRICTED: Visibility = 'restricted'

export interface LoadedPlan {
  plan: BackupPlan
  /** `stale`: an earlier copy, the database could not answer. `unavailable`: nothing to show for the same reason. `denied`: not a member of the sector. */
  notice?: 'stale' | 'unavailable' | 'denied'
}

/**
 * A query rather than a read by id: the rules refuse to look up a document that
 * does not exist, and "refused" would hide "no plans yet". Both filters are part
 * of what the rules can prove about the result.
 */
async function readPlan(sectorId: string): Promise<BackupPlan> {
  const q = query(collection(db, PLANS), where('sectorId', '==', sectorId), where('visibility', '==', RESTRICTED))
  const snap = await serverDocs(PLANS, q)
  return snap.empty ? emptyPlan(sectorId) : planOf(sectorId, snap.docs[0].data())
}

/**
 * Never throws. `null` for a build without a database, or a session that just
 * ended. One read for a member, none for the ten minutes that follow.
 */
export async function loadBackupPlan(sectorId: string): Promise<LoadedPlan | null> {
  if (!isFirebaseConfigured) return null
  const uid = await currentUid()
  if (!uid) return null
  return shared(`plans:${sectorId}:${uid}`, async () => {
    const key = plansKey(sectorId)
    const saved = cache.get<BackupPlan>(key, uid)
    // a copy kept by an earlier version of the page has no trash yet
    if (saved) saved.value.trash ??= []
    if (saved && cache.isFresh(saved)) return { plan: saved.value }
    try {
      const plan = await withTimeout(readPlan(sectorId))
      cache.set(key, uid, plan)
      return { plan }
    } catch (error) {
      console.warn('backup plans: the plans could not be read —', error)
      if (isDenied(error)) {
        // a refusal is an answer too, and asking again on every load would cost a read each time
        cache.set(key, uid, emptyPlan(sectorId))
        return { plan: emptyPlan(sectorId), notice: 'denied' as const }
      }
      if (saved && isUnreachable(error)) return { plan: saved.value, notice: 'stale' as const }
      return { plan: emptyPlan(sectorId), notice: 'unavailable' as const }
    }
  })
}

interface PlanUpdate {
  changes: PlanChange[]
  written: Promise<BackupPlan>
}

// Every change rewrites the same document. Updates wait for one another, each
// starts from what the database holds at that moment, and the changes that
// arrive while one is being written go out together in the next.
const waiting = new Map<string, PlanUpdate>()
let lastUpdate: Promise<unknown> = Promise.resolve()

async function writePlan(sectorId: string, changes: PlanChange[]): Promise<BackupPlan> {
  const uid = await currentUid()
  // the trash is tidied with every write: thirty days, and never at the cost of a plan
  const plan = fitPlan(applyPlanChanges(await readPlan(sectorId), changes, { now: Date.now(), by: uid ?? undefined }))
  if (!fitsOneDocument(plan)) throw new Error('backup plans: the sector has more cases than one document can hold')
  // through JSON: a field that is `undefined` would be refused
  const { ratingA, cases, trash } = JSON.parse(JSON.stringify(plan)) as BackupPlan
  await setDoc(doc(db, PLANS, sectorId), { sectorId, visibility: RESTRICTED, ratingA, cases, trash, updatedAt: serverTimestamp() })
  cache.set(plansKey(sectorId), uid, plan)
  return plan
}

function updatePlan(sectorId: string, changes: PlanChange[]): Promise<BackupPlan> {
  if (!isFirebaseConfigured) return Promise.reject(new Error('backup plans: the database is not configured'))
  const queued = waiting.get(sectorId)
  if (queued) {
    queued.changes.push(...changes)
    return queued.written
  }
  const update: PlanUpdate = { changes: [...changes], written: Promise.resolve(emptyPlan(sectorId)) }
  update.written = lastUpdate.then(() => {
    // from here on, new changes belong to the next update
    waiting.delete(sectorId)
    return writePlan(sectorId, update.changes)
  })
  lastUpdate = update.written.catch(() => {})
  waiting.set(sectorId, update)
  return update.written
}

// The rules only accept these from an admin. Each resolves with the plan as written.
export const saveBackupCase = (sectorId: string, saved: BackupCase) => updatePlan(sectorId, [{ upsert: saved }])
/** Many cases at once — a bulk entry: still one read and one write, whatever their number. A plan it overwrites goes to the trash. */
export const saveBackupCases = (sectorId: string, saved: BackupCase[]) => updatePlan(sectorId, saved.map((upsert) => ({ upsert, keepReplaced: true })))
/** Into the trash of the same document; `at` names the trashed case afterwards (`trashKey`). */
export const deleteBackupCase = (sectorId: string, caseId: string, at: number) => updatePlan(sectorId, [{ remove: caseId, at }])
export const restoreBackupCase = (sectorId: string, key: string) => updatePlan(sectorId, [{ restore: key }])
export const purgeBackupCase = (sectorId: string, key: string) => updatePlan(sectorId, [{ purge: key }])
export const setDefaultRating = (sectorId: string, ratingA: number) => updatePlan(sectorId, [{ ratingA }])
