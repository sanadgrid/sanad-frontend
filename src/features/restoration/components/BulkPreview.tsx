import type { ParseProblem } from '../backup/bulkParse'
import type { ReviewedRow } from '../backup/bulkReview'
import { ordinal, ratioLabel } from '../backup/format'
import type { GroupSummary } from '../backup/model'
import { fmt } from '../labels'
import type { BulkEntry } from '../useBulkEntry'
import { Pills } from './Pills'
import { StationPreview } from './StationPreview'

const ADD_COORDINATES = 'أضف إحداثياتها في ورقة «المحطات»'

const PROBLEM: Record<ParseProblem['kind'], (order: number) => string> = {
  noMain: () => 'رقم العنصر الرئيسي مفقود',
  badMainLoad: () => 'حمل العنصر الرئيسي مفقود أو ليس رقماً',
  badBackupLoad: (order) => `حمل البديل ${ordinal(order)} مفقود أو ليس رقماً`,
  backupWithoutNo: (order) => `حمل بلا رقم للبديل ${ordinal(order)}`,
  badLevel: () => 'المستوى غير معروف — «محطة» أو «مغذي»',
  badVoltage: () => 'الجهد ليس رقماً',
  badRating: () => 'السعة ليست رقماً',
}

const list = (numbers: string[]) => (
  <bdi className="num" dir="ltr">
    {numbers.join(' · ')}
  </bdi>
)

function RowState({ reviewed: r }: { reviewed: ReviewedRow }) {
  if (!r.plan)
    return (
      <ul className="rc-bulk__notes rc-bulk__notes--bad">
        {r.row.problems.map((p, i) => (
          <li key={i}>{PROBLEM[p.kind]('order' in p ? p.order : 0)}</li>
        ))}
      </ul>
    )
  // a load above the rating is often a slip of the finger: said, never refused
  const over = r.result?.transfers.filter((t) => t.level === 'over').map((t) => t.no) ?? []
  if (!r.duplicate && r.notFound.length === 0 && r.ambiguous.length === 0 && over.length === 0) return <span className="rc-bulk__ok">سليم</span>
  return (
    <ul className="rc-bulk__notes">
      {r.duplicate && <li>{r.duplicate === 'existing' ? 'للعنصر الرئيسي خطة محفوظة' : 'العنصر الرئيسي مكرر في الأسطر'}</li>}
      {r.notFound.length > 0 && (
        <li>
          غير موجود في المحطات المستوردة: {list(r.notFound)} — يُحفظ ولا يُرسم. {ADD_COORDINATES}
        </li>
      )}
      {over.length > 0 && <li>حمله أعلى من سعة القاطع: {list(over)} — راجع الرقم</li>}
      {r.ambiguous.length > 0 && <li>له أكثر من موقع: {list(r.ambiguous)} — يُحفظ بلا موقع ويُحدَّد لاحقاً</li>}
    </ul>
  )
}

function Totals({ label, total }: { label: string; total: GroupSummary }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <b className="num">{fmt(total.count)}</b> خطة ·{' '}
        <span className="num" dir="ltr">
          {fmt(total.loadA)} A
        </span>{' '}
        · غير قابل للاستعادة{' '}
        <span className={`num${total.unrestorableA > 0 ? ' rc-bad' : ''}`} dir="ltr">
          {fmt(total.unrestorableA)} A
        </span>{' '}
        ·{' '}
        <b className={`num rc-status--${total.status}`} dir="ltr">
          {ratioLabel(total.ratio, 1)}
        </b>
      </dd>
    </div>
  )
}

/** Every pasted row with what is wrong or notable about it, before anything is written. */
export function BulkPreview({ entry }: { entry: BulkEntry }) {
  const { reviewed, counts, stations } = entry
  // the rows of the stations sheet that ask for a look: what is listed already at its place does not
  const stationRows = stations.reviewed.filter((r) => r.state !== 'exists').length

  return (
    <>
      {stationRows > 0 && (
        <section className="rc-stations__block">
          <h3>
            محطات جديدة أو معدّلة <span className="num">({fmt(stationRows)})</span>
          </h3>
          <StationPreview rows={stations} hideExisting />
        </section>
      )}
      {reviewed.length === 0 && stationRows > 0 && <p className="rc-bulk__sheet">لا توجد خطط في هذا الملف؛ تُحفظ المحطات وحدها.</p>}
      <dl className="rc-bulk__totals">
        <Totals label="ما سيُحفظ" total={entry.totals} />
        <Totals label="القطاع بعد الحفظ" total={entry.after} />
      </dl>

      {(counts.invalid > 0 || counts.duplicates > 0) && (
        <div className="rc-bulk__bar">
          {counts.invalid > 0 && (
            <span className="rc-bad">
              <b className="num">{fmt(counts.invalid)}</b> سطر لن يُحفظ — صحّحه في الجدول وأعد اللصق
            </span>
          )}
          {counts.duplicates > 0 && (
            <span className="rc-bulk__all">
              <span className="num">{fmt(counts.duplicates)}</span> مكرر:
              <button className="rc-link" type="button" onClick={() => entry.chooseAll('replace')}>
                استبدال الكل
              </button>
              <button className="rc-link" type="button" onClick={() => entry.chooseAll('skip')}>
                تخطي الكل
              </button>
            </span>
          )}
        </div>
      )}

      <div className="rc-scroll rc-bulk__scroll">
        <table className="rc-table rc-table--compact rc-bulk__table">
          <thead>
            <tr>
              <th scope="col">السطر</th>
              <th scope="col">الرئيسي</th>
              <th scope="col">
                الحمل <span dir="ltr">A</span>
              </th>
              <th scope="col">البدائل</th>
              <th scope="col">النسبة</th>
              <th scope="col">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {reviewed.map((r) => {
              const skipped = !r.plan || (r.duplicate !== null && entry.choiceOf(r) === 'skip')
              return (
                <tr key={r.row.line} className={skipped ? 'is-skipped' : undefined} data-state={!r.plan ? 'invalid' : r.duplicate ? 'duplicate' : r.notFound.length + r.ambiguous.length > 0 ? 'flagged' : 'ok'}>
                  <td className="num">{r.row.line}</td>
                  <th scope="row">
                    <bdi className="num" dir="ltr">
                      {r.row.main.no || '—'}
                    </bdi>
                  </th>
                  <td className="num">{r.plan ? fmt(r.row.main.loadA) : '—'}</td>
                  <td>
                    <span className="rc-plans__backups">
                      {r.row.backups.map((b, i) => (
                        <span key={i}>
                          <i className="rc-case__order" aria-hidden="true">
                            {ordinal(i)}
                          </i>
                          <bdi className="num" dir="ltr">
                            {b.no} <small>{fmt(b.loadA)}</small>
                          </bdi>
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>
                    {r.result && (
                      <b className={`num rc-status--${r.result.status}`} dir="ltr">
                        {ratioLabel(r.result.ratio)}
                      </b>
                    )}
                  </td>
                  <td>
                    <RowState reviewed={r} />
                    {r.plan && r.duplicate && (
                      <Pills
                        segmented
                        label={`السطر ${r.row.line}`}
                        value={entry.choiceOf(r)}
                        onChange={(choice) => entry.choose(r.row.line, choice)}
                        options={[
                          { value: 'replace', label: 'استبدال' },
                          { value: 'skip', label: 'تخطي' },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
