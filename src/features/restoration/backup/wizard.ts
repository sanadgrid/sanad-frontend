import { ordinal } from './format'
import { numberOf, usedBackups, type PlanDraft } from './draft'

// A new plan written in three steps — the station, its backups, the loads —
// instead of on the full form. Pure: which step the draft is at, which it may
// go to, and what still keeps it from being saved.

export type WizardStep = 1 | 2 | 3

export const WIZARD_STEPS: { step: WizardStep; label: string }[] = [
  { step: 1, label: 'المحطة الرئيسية' },
  { step: 2, label: 'البدائل' },
  { step: 3, label: 'الأحمال' },
]

const hasMain = (draft: PlanDraft) => Boolean(draft.main.no.trim())

/** The first two steps are clicks on the map: the main station first, then every other click is a backup. */
export const stepOf = (draft: PlanDraft, picking: boolean): WizardStep => (!picking ? 3 : hasMain(draft) ? 2 : 1)

/** A step can be gone to once what comes before it is there; going back is always possible. */
export const canReach = (draft: PlanDraft, step: WizardStep) =>
  step === 1 || (hasMain(draft) && (step === 2 || usedBackups(draft).length > 0))

/** Nothing chosen and nothing typed: closing it loses nothing. */
export const isUntouched = (draft: PlanDraft) =>
  !hasMain(draft) && usedBackups(draft).length === 0 && ![draft.main.load, draft.rating, draft.note, ...draft.backups.map((row) => row.load)].some((text) => text.trim())

/** Why the plan cannot be saved yet, in plain words; `null` once it can. */
export function saveBlocker(draft: PlanDraft): string | null {
  if (!hasMain(draft)) return 'اختر المحطة الرئيسية أولاً.'
  const backups = usedBackups(draft)
  if (backups.length === 0) return 'اختر بديلاً واحداً على الأقل.'
  const main = numberOf(draft.main.load)
  if (main === null || main <= 0) return 'أدخل حمل المحطة الرئيسية بالأمبير.'
  const blank = backups.findIndex((row) => numberOf(row.load) === null)
  if (blank >= 0) return `أدخل حمل البديل ${ordinal(blank)} بالأمبير.`
  if (draft.rating.trim() && !numberOf(draft.rating)) return 'سعة القاطع يجب أن تكون رقماً أكبر من صفر، أو اتركها فارغة.'
  return null
}
