import { useEffect, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { toPosition, type StationDirectory, type StationPoint } from '../backup/directory'
import type { PlanDraft } from '../backup/draft'
import { ordinal } from '../backup/format'
import type { BackupCase } from '../backup/model'
import { canReach, isUntouched, stepOf, WIZARD_STEPS, type WizardStep } from '../backup/wizard'
import type { PlanEditor } from '../usePlanEditor'
import { PickBar } from './PickBar'
import { PickSearch } from './PickSearch'
import { PlanLoadsStep } from './PlanLoadsStep'

interface PlanWizardProps {
  editor: PlanEditor
  draft: PlanDraft
  /** The sector's rating, used unless the plan names its own. */
  ratingA: number
  directory: StationDirectory
  busy: boolean
  /** Resolves to whether the plan was written. */
  onSave: (saved: BackupCase) => Promise<boolean>
  /** The stations were picked on the map: it may frame them. */
  onPicked: () => void
}

interface StepsProps {
  step: WizardStep
  draft: PlanDraft
  onStep: (step: WizardStep) => void
}

function Steps({ step, draft, onStep }: StepsProps) {
  return (
    <ol className="rc-steps" aria-label="خطوات إضافة الخطة">
      {WIZARD_STEPS.map((s) => (
        <li key={s.step} className={s.step === step ? 'is-current' : s.step < step ? 'is-done' : undefined}>
          <button type="button" aria-current={s.step === step ? 'step' : undefined} disabled={s.step === step || !canReach(draft, s.step)} onClick={() => onStep(s.step)}>
            <i aria-hidden="true">{s.step < step ? <Icon name="check" size={12} /> : ordinal(s.step - 1)}</i>
            {s.label}
          </button>
        </li>
      ))}
    </ol>
  )
}

/** A new plan in three steps: the main station and its backups are clicked on the map, then the loads are typed. */
export function PlanWizard({ editor, draft, ratingA, directory, busy, onSave, onPicked }: PlanWizardProps) {
  const [asking, setAsking] = useState(false)
  const step = stepOf(draft, editor.picking)

  // Esc, or «إلغاء»: nothing is thrown away without asking, and a second Esc takes the question back
  const leave = () => {
    if (asking) setAsking(false)
    else if (isUntouched(draft)) editor.close()
    else setAsking(true)
  }

  const goTo = (wanted: WizardStep) => {
    if (wanted === 3) {
      editor.finishPicking()
      onPicked()
    } else editor.startPicking()
  }

  const question = asking && (
    <div className="rc-wizard__ask" role="alertdialog" aria-label="تجاهل الخطة">
      <p>لم تُحفظ هذه الخطة بعد. هل تريد تجاهلها؟</p>
      <div>
        {/* the safe answer is the one the keyboard lands on */}
        <button className="rc-btn rc-btn--accent" type="button" autoFocus onClick={() => setAsking(false)}>
          متابعة الخطة
        </button>
        <button className="rc-btn rc-btn--danger" type="button" onClick={editor.close}>
          تجاهل
        </button>
      </div>
    </div>
  )

  const steps = <Steps step={step} draft={draft} onStep={goTo} />

  // a number typed twice must not take the station out again, as a second click on its square would
  const holds = (point: StationPoint) => [draft.main, ...draft.backups].some((row) => row.no.trim() === point.no && row.at?.join() === toPosition(point.at).join())
  const find = <PickSearch directory={directory} onPick={(point) => !holds(point) && editor.pick(point)} onShow={editor.setHover} />
  if (step < 3) return <PickBar draft={draft} steps={steps} find={find} asking={question || undefined} onDone={() => goTo(3)} onCancel={leave} />

  return (
    <div className="rc-wizard">
      <LeaveOnEscape onEscape={leave} />
      {steps}
      <PlanLoadsStep editor={editor} draft={draft} ratingA={ratingA} directory={directory} busy={busy} asking={question || undefined} onSave={onSave} onBack={() => goTo(2)} onCancel={leave} />
    </div>
  )
}

/** While the loads are typed the map is not listening: Esc is heard here. */
function LeaveOnEscape({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })
  return null
}
