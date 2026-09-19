import { loadingLabel, ordinal, ratioLabel } from '../backup/format'
import type { CaseResult } from '../backup/model'
import { fmt, STATUS } from '../labels'

interface CaseTableProps {
  result: CaseResult
  /** A second line under each backup's number: the station it belongs to, a name. */
  captions?: (string | undefined)[]
  backupLabel?: string
}

/** The team's sheet, one line per backup: what it carries, what it can take, what it is given, where that leaves it. */
export function CaseTable({ result, captions, backupLabel = 'البديل' }: CaseTableProps) {
  if (result.transfers.length === 0) return <p className="rc-detail__none">لا توجد بدائل: لا يمكن استعادة أي جزء من الحمل.</p>

  return (
    <div className="rc-scroll">
      <table className="rc-table rc-table--compact rc-case">
        <caption className="rc-case__unit">
          القيم بالأمبير <span dir="ltr">(A)</span>
        </caption>
        <thead>
          <tr>
            <th scope="col">{backupLabel}</th>
            <th scope="col">الحمل الحالي</th>
            <th scope="col">السعة المتاحة</th>
            <th scope="col">التحويل</th>
            <th scope="col">الحمل النهائي</th>
            <th scope="col">نسبة التحميل</th>
          </tr>
        </thead>
        <tbody>
          {result.transfers.map((t, i) => (
            <tr key={`${i}-${t.no}`}>
              <th scope="row">
                <span className="rc-case__backup">
                  <i className="rc-case__order" aria-hidden="true">
                    {ordinal(i)}
                  </i>
                  <span>
                    <bdi className="num" dir="ltr">
                      {t.no}
                    </bdi>
                    {captions?.[i] && <small>{captions[i]}</small>}
                  </span>
                </span>
              </th>
              <td className="num">{fmt(t.loadA)}</td>
              <td className="num">{fmt(t.spareA)}</td>
              <td className="num rc-case__transfer">{fmt(t.transferA)}</td>
              <td className="num">{fmt(t.finalLoadA)}</td>
              <td className="num">
                <span className={`rc-case__loading rc-case__loading--${t.level}`}>{loadingLabel(t.finalLoadingPct)}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">الإجمالي</th>
            <td />
            <td className="num">{fmt(result.totalSpareA)}</td>
            <td className="num rc-case__transfer">{fmt(result.restorableA)}</td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

const both = (amps: number, mva: number) => (
  <span className="num" dir="ltr">
    {fmt(amps)} A <small>· {fmt(mva, 1)} MVA</small>
  </span>
)

interface CaseFiguresProps {
  result: CaseResult
  /** What the percentage is a share of: "حمل المغذي", "حمل المحطة". */
  subject: string
}

/** Restorable, unrestorable, ratio and class — in amperes and in MVA. */
export function CaseFigures({ result: r, subject }: CaseFiguresProps) {
  return (
    <>
      <div className="rc-detail__score">
        <strong className={`num rc-status--${r.status}`} dir="ltr">
          {ratioLabel(r.ratio)}
        </strong>
        <span>
          من {subject} يمكن استعادته عبر البدائل
          <span className={`rc-chip rc-status--${r.status}`}>
            <i aria-hidden="true" /> {STATUS[r.status].label}
          </span>
        </span>
      </div>
      <dl className="rc-facts">
        <div>
          <dt>الحمل</dt>
          <dd>{both(r.loadA, r.loadMva)}</dd>
        </div>
        <div>
          <dt>إجمالي السعة المتاحة</dt>
          <dd>{both(r.totalSpareA, r.totalSpareMva)}</dd>
        </div>
        <div>
          <dt>القابل للاستعادة</dt>
          <dd className="rc-ok">{both(r.restorableA, r.restorableMva)}</dd>
        </div>
        <div>
          <dt>غير القابل للاستعادة</dt>
          <dd className={r.unrestorableA > 0 ? 'rc-bad' : 'rc-ok'}>{both(r.unrestorableA, r.unrestorableMva)}</dd>
        </div>
      </dl>
    </>
  )
}
