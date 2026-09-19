import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { legacyNetwork, type LegacyFound, type LegacyKind, type LegacyStore } from '../../../services/legacyNetwork'
import { fmt } from '../labels'

interface CleanupDialogProps {
  sectorId: string
  sectorName: string
  /** Where the old documents are looked for; the database unless a test says otherwise. */
  store?: LegacyStore
  onClose: () => void
}

type Step =
  | { kind: 'looking' }
  | { kind: 'found'; found: LegacyFound }
  | { kind: 'removing'; found: LegacyFound; done: number }
  | { kind: 'done'; removed: number }
  /** `removed`: how many went before it stopped; `null` when it never started. */
  | { kind: 'failed'; removed: number | null }

const KIND_LABEL: Record<LegacyKind, string> = {
  substations: 'محطات تجريبية',
  feeders: 'مغذيات تجريبية',
  ties: 'نقاط ربط تجريبية',
  networkBundles: 'نسخ مجمّعة للشبكة التجريبية',
  sectors: 'تعريف القطاع التجريبي',
}
const ORDER: LegacyKind[] = ['substations', 'feeders', 'ties', 'networkBundles', 'sectors']

/** Removes the synthetic network an earlier release wrote into the database — after saying exactly what will go. */
export function CleanupDialog({ sectorId, sectorName, store = legacyNetwork, onClose }: CleanupDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState<Step>({ kind: 'looking' })
  const running = step.kind === 'looking' || step.kind === 'removing'

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  const look = useCallback(
    (removedSoFar: number | null = null) =>
      store
        .find(sectorId)
        .then((found) => setStep({ kind: 'found', found }))
        .catch((error: unknown) => {
          console.error('cleanup:', error)
          setStep({ kind: 'failed', removed: removedSoFar })
        }),
    [store, sectorId],
  )
  // the window opens already looking
  useEffect(() => void look(), [look])
  const lookAgain = (removedSoFar: number | null) => {
    setStep({ kind: 'looking' })
    void look(removedSoFar)
  }

  const remove = async (found: LegacyFound) => {
    let done = 0
    setStep({ kind: 'removing', found, done })
    try {
      const removed = await store.remove(sectorId, (count) => {
        done = count
        setStep({ kind: 'removing', found, done })
      })
      setStep({ kind: 'done', removed })
    } catch (error) {
      console.error('cleanup:', error)
      setStep({ kind: 'failed', removed: done })
    }
  }

  return (
    <dialog
      className="rc-dialog rc-cleanup"
      ref={dialog}
      aria-labelledby="rc-cleanup-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!running) onClose()
      }}
    >
      <header className="rc-dialog__head">
        <div>
          <h2 id="rc-cleanup-title">حذف بيانات الشبكة التجريبية القديمة</h2>
          <p>{sectorName} · الشبكة المصطنعة التي كانت تُعرض سابقاً — لم تعد الصفحة تستخدمها</p>
        </div>
        <button className="rc-icon-btn" type="button" aria-label="إغلاق" disabled={running} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="rc-dialog__body">
        {step.kind === 'looking' && (
          <div className="rc-import__reading" role="status">
            <progress className="rc-progress" aria-label="جارٍ الحصر" />
            <p>جارٍ حصر البيانات التجريبية…</p>
          </div>
        )}

        {step.kind === 'found' &&
          (step.found.total === 0 ? (
            <p className="rc-cleanup__clean">
              <Icon name="check" size={18} />
              لا توجد بيانات تجريبية قديمة في هذا القطاع.
            </p>
          ) : (
            <>
              <p>سيُحذف نهائياً ما يلي — وهو بيانات مصطنعة فقط:</p>
              <ul className="rc-cleanup__counts">
                {ORDER.filter((kind) => step.found.counts[kind] > 0).map((kind) => (
                  <li key={kind}>
                    <b className="num">{fmt(step.found.counts[kind])}</b> {KIND_LABEL[kind]}
                  </li>
                ))}
              </ul>
              <p className="rc-cleanup__keep">
                <Icon name="shield" size={16} />
                <span>
                  لا يُمسّ شيء من بياناتك: الطبقات المستوردة وخطط التغذية البديلة وكل ما هو مقيّد يبقى كما هو.
                  {step.found.sectorKept && ' وتعريف القطاع الحالي ليس تجريبياً، فيبقى أيضاً.'}
                </span>
              </p>
            </>
          ))}

        {step.kind === 'removing' && (
          <div className="rc-import__reading" role="status">
            <progress className="rc-progress" max={step.found.total} value={step.done} aria-label="جارٍ الحذف" />
            <p>
              جارٍ الحذف… <span className="num">{fmt(step.done)}</span> / <span className="num">{fmt(step.found.total)}</span>
            </p>
          </div>
        )}

        {step.kind === 'done' && (
          <p className="rc-cleanup__clean">
            <Icon name="check" size={18} />
            <span>
              تم حذف <b className="num">{fmt(step.removed)}</b> عنصراً من البيانات التجريبية القديمة.
            </span>
          </p>
        )}

        {step.kind === 'failed' && (
          <p className="rc-import__error" role="alert">
            <Icon name="alert" size={16} />
            {step.removed === null
              ? 'تعذّر حصر البيانات الآن. تأكد من صلاحياتك وحاول مرة أخرى.'
              : `توقف الحذف بعد ${fmt(step.removed)} عنصراً. ما حُذف لن يعود، و«متابعة» تكمل الباقي من حيث توقف.`}
          </p>
        )}
      </div>

      <footer className="rc-dialog__foot">
        {step.kind === 'found' && step.found.total > 0 && (
          <button className="rc-btn rc-btn--danger" type="button" onClick={() => remove(step.found)}>
            <Icon name="trash" size={15} />
            حذف <span className="num">{fmt(step.found.total)}</span> عنصراً نهائياً
          </button>
        )}
        {step.kind === 'failed' && (
          <button className="rc-btn" type="button" onClick={() => lookAgain(step.removed)}>
            {step.removed === null ? 'إعادة المحاولة' : 'متابعة'}
          </button>
        )}
        <button className="rc-btn" type="button" disabled={running} onClick={onClose}>
          {step.kind === 'done' || (step.kind === 'found' && step.found.total === 0) ? 'إغلاق' : 'إلغاء'}
        </button>
      </footer>
    </dialog>
  )
}
