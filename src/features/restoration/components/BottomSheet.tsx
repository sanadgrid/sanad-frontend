import { useState, type ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { fmt } from '../labels'
import { NO_NETWORK } from './KpiCards'

interface BottomSheetProps {
  open: boolean
  onToggle: () => void
  /** Rows in the table, and how many stations match the filters (the CSV holds all of them). */
  listedCount: number
  visibleCount: number
  /** No network is on the map: nothing to rank. */
  empty?: boolean
  onExport: () => void
  table: ReactNode
  methodology: ReactNode
}

type Tab = 'priority' | 'method'

const TABS: { id: Tab; label: string }[] = [
  { id: 'priority', label: 'أولويات التعزيز' },
  { id: 'method', label: 'منهجية الحساب' },
]

/** Folded, it is a handle at the foot of the map; open, the table scrolls inside it. */
export function BottomSheet({ open, onToggle, listedCount, visibleCount, empty, onExport, table, methodology }: BottomSheetProps) {
  const [tab, setTab] = useState<Tab>('priority')

  if (empty)
    return (
      <section className="rc-float rc-sheet rc-sheet--empty" aria-label="أولويات التعزيز">
        <p>
          <Icon name="chart" size={16} />
          <b>أولويات التعزيز</b>
          <span>{NO_NETWORK}</span>
        </p>
      </section>
    )

  return (
    <section className={`rc-float rc-sheet${open ? ' is-open' : ''}`} aria-label="أولويات التعزيز ومنهجية الحساب">
      <header className="rc-sheet__head">
        <button className="rc-sheet__handle" type="button" aria-expanded={open} aria-controls="rc-sheet-body" onClick={onToggle}>
          <Icon name="chart" size={16} />
          <span className="rc-sheet__title">أولويات التعزيز</span>
          <span className="rc-count rc-count--quiet" title="المحطات المطابقة لخيارات التصفية">
            <span className="num">{fmt(visibleCount)}</span> محطة
          </span>
          <Icon name={open ? 'chevronDown' : 'chevronUp'} size={17} />
        </button>

        {open && (
          <>
            <div className="rc-segment rc-sheet__tabs" role="group" aria-label="محتوى اللوحة">
              {TABS.map((t) => (
                <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="rc-sheet__note">
              {tab === 'priority' ? (
                <>
                  أضعف <span className="num">{fmt(listedCount)}</span> محطات من أصل{' '}
                  <span className="num">{fmt(visibleCount)}</span> ظاهرة — مرتبة بقدرة الاستعادة ثم بالحمل غير المستعاد.
                </>
              ) : (
                'كيف تُحسب قدرة الاستعادة لكل محطة.'
              )}
            </p>
            <button className="rc-btn rc-sheet__export" type="button" onClick={onExport} disabled={visibleCount === 0}>
              <Icon name="download" size={15} />
              تصدير <span lang="en">CSV</span>
            </button>
          </>
        )}
      </header>

      {open && (
        <div className="rc-sheet__body" id="rc-sheet-body">
          {tab === 'priority' ? table : methodology}
        </div>
      )}
    </section>
  )
}
