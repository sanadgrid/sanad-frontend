import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { assessFeederCase, SHEET_METHOD, type FeederCase, type FeederRow } from '../backup/fromNetwork'
import { loadingLevel } from '../backup/model'
import { fmt } from '../labels'
import { CaseFigures, CaseTable } from './CaseTable'
import { Toggle } from './Toggle'

interface FeederListProps {
  feeders: FeederRow[]
  onSelect: (feederId: string) => void
}

/** The feeders of the selected station; choosing one asks "and if this feeder is lost?". */
export function FeederList({ feeders, onSelect }: FeederListProps) {
  if (feeders.length === 0) return null
  return (
    <>
      <h3 className="rc-detail__title">
        مغذيات المحطة <small className="num">({feeders.length})</small>
      </h3>
      <ul className="rc-feeders">
        {feeders.map(({ feeder, loadA, loadMva, loadingPct, backups }) => (
          <li key={feeder.id}>
            <button type="button" onClick={() => onSelect(feeder.id)} title="ماذا لو فُقد هذا المغذي؟">
              <b className="num" dir="ltr">
                {feeder.code}
              </b>
              <span className="num" dir="ltr">
                {fmt(loadA)} A <small>· {fmt(loadMva, 1)} MVA</small>
              </span>
              <span className={`num rc-case__loading rc-case__loading--${loadingLevel(loadingPct)}`}>{fmt(loadingPct)}%</span>
              <small className="rc-feeders__ties">
                {backups > 0 ? (
                  <>
                    <span className="num">{backups}</span> بديل
                  </>
                ) : (
                  'بلا بديل'
                )}
              </small>
              <Icon name="arrowLeft" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

interface FeederCardProps {
  feederCase: FeederCase
  /** "أغسطس · الحمل الذروي" — what the loads were taken at. */
  conditionsLabel: string
  periodLabel: string
  onBack: () => void
}

/** "If this feeder is lost": the team's sheet, filled in from the network. */
export function FeederCard({ feederCase: fc, conditionsLabel, periodLabel, onBack }: FeederCardProps) {
  // both off: the figures are those of the sheet, to the ampere
  const [assumptions, setAssumptions] = useState(SHEET_METHOD)
  const result = assessFeederCase(fc, assumptions)
  const sheet = !assumptions.derated && !assumptions.firmCapacity

  return (
    <div className="rc-feeder">
      <button className="rc-link rc-feeder__back" type="button" onClick={onBack}>
        <Icon name="arrowRight" size={13} />
        العودة إلى المحطة
      </button>

      <div className="rc-feeder__head">
        <h3>
          عند فقد المغذي{' '}
          <bdi className="num" dir="ltr">
            {fc.feeder.code}
          </bdi>
        </h3>
        <p>{conditionsLabel}</p>
      </div>

      <CaseFigures result={result} subject="حمل المغذي" />

      <div className="rc-assume">
        <span className="rc-field__label">افتراضات الحساب</span>
        <Toggle
          label="تطبيق التخفيض الحراري للشهر المحدد"
          checked={assumptions.derated}
          onChange={(derated) => setAssumptions((a) => ({ ...a, derated }))}
        />
        <Toggle
          label="مراعاة السعة المؤكدة للمحطة المستقبِلة"
          checked={assumptions.firmCapacity}
          onChange={(firmCapacity) => setAssumptions((a) => ({ ...a, firmCapacity }))}
        />
        <ul className="rc-assume__active" aria-live="polite">
          {sheet && <li>الحساب بطريقة جدول الفريق: السعة الاسمية لكل مغذٍ بديل، دون قيود إضافية.</li>}
          {assumptions.derated && (
            <li className="is-on">
              سعة المغذيات مخفّضة حرارياً لفترة «{periodLabel}»: <span className="num" dir="ltr">× {fc.derating.toFixed(2)}</span>
            </li>
          )}
          {assumptions.firmCapacity && <li className="is-on">ما يستقبله كل مغذٍ بديل لا يتجاوز المتبقي من السعة المؤكدة لمحطته.</li>}
        </ul>
      </div>

      <h3 className="rc-detail__title">
        المغذيات البديلة <small className="num">({fc.backups.length})</small>
      </h3>
      <CaseTable result={result} backupLabel="المغذي البديل" captions={fc.backups.map((b) => b.station.district)} />
    </div>
  )
}
