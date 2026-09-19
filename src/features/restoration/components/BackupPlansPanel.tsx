import { useMemo, useState } from 'react'
import { Icon } from '../../../components/Icon'
import type { StationDirectory } from '../backup/directory'
import { ordinal, ratioLabel } from '../backup/format'
import { summarize, type BackupCase, type GroupSummary } from '../backup/model'
import type { SupportLink } from '../backup/planNetwork'
import { normalizeQuery } from '../import/stations'
import { fmt, STATUS } from '../labels'
import type { BackupPlans } from '../useBackupPlans'
import type { PlanEditor } from '../usePlanEditor'
import type { PlanRow } from '../usePlanNetwork'
import { PlanDetail, Sensitivity, type SensitivityProps } from './PlanDetail'
import { PlanForm } from './PlanForm'
import { Toggle } from './Toggle'

interface BackupPlansPanelProps {
  plans: BackupPlans
  rows: PlanRow[]
  directory: StationDirectory
  /** The plan being written, shared with the map. */
  editor: PlanEditor
  isAdmin: boolean
  busy: boolean
  /** The breaker rating in use: the sector's, or one being tried. */
  ratingA: number
  /** The derating of the chosen month, and the month's name. */
  derating: number
  monthLabel: string
  deratingOn: boolean
  /** What the selected plan's main element would itself take as a backup of others. */
  supports: SupportLink[]
  selectedId: string | null
  onDerating: (on: boolean) => void
  /** `plan` when the list does not hold it yet: a case that was just saved. */
  onSelect: (caseId: string | null, plan?: BackupCase) => void
  onExport: () => void
  /** Many plans at once, pasted from a spreadsheet. */
  onBulk: () => void
  onShowOnMap: () => void
  /** The stations of the plan being written were picked on the map. */
  onPicked: () => void
  /** These resolve to whether the change was written. */
  onSave: (saved: BackupCase) => Promise<boolean>
  onDelete: (caseId: string) => Promise<boolean>
  onRating: (ratingA: number) => Promise<boolean>
  onClose: () => void
}

const NOTICE = {
  denied: 'خطط هذا القطاع متاحة لأعضائه فقط.',
  unavailable: 'تعذّر الوصول إلى الخطط الآن. حاول مرة أخرى بعد قليل.',
  stale: 'تعذّر تحديث الخطط الآن. تُعرض آخر نسخة محفوظة.',
}

const amps = (value: number) => (
  <span className="num" dir="ltr">
    {fmt(value)} A
  </span>
)

function SummaryBlock({ total }: { total: GroupSummary }) {
  return (
    <dl className="rc-plans__summary">
      <div>
        <dt>الخطط</dt>
        <dd className="num">{fmt(total.count)}</dd>
      </div>
      <div>
        <dt>مجموع الأحمال</dt>
        <dd>{amps(total.loadA)}</dd>
      </div>
      <div>
        <dt>السعة المتاحة</dt>
        <dd>{amps(total.spareA)}</dd>
      </div>
      <div>
        <dt>القابل للاستعادة</dt>
        <dd className="rc-ok">{amps(total.restorableA)}</dd>
      </div>
      <div>
        <dt>غير القابل للاستعادة</dt>
        <dd className={total.unrestorableA > 0 ? 'rc-bad' : 'rc-ok'}>{amps(total.unrestorableA)}</dd>
      </div>
      <div>
        <dt>نسبة الاستعادة</dt>
        <dd className={`num rc-status--${total.status}`} dir="ltr">
          {ratioLabel(total.ratio, 1)}
        </dd>
      </div>
    </dl>
  )
}

export function BackupPlansPanel(props: BackupPlansPanelProps) {
  const { plans, rows, directory, editor, isAdmin, busy, ratingA, derating, monthLabel, deratingOn, selectedId } = props
  const [ratingDraft, setRatingDraft] = useState<string | null>(null)
  const selected = rows.find((row) => row.plan.id === selectedId) ?? null

  const totals = useMemo(() => {
    const cases = rows.map((row) => row.plan)
    const one = () => 'all'
    return { plain: summarize(cases, one, { ratingA }).total, derated: summarize(cases, one, { ratingA, derating }).total }
  }, [rows, ratingA, derating])
  const total = deratingOn ? totals.derated : totals.plain

  // the switch and what it changes, in one block: how much of the result rests on the rating
  const sensitivity = (plain: SensitivityProps['plain'], derated: SensitivityProps['plain'], digits: 0 | 1) => (
    <div className="rc-assume">
      <Toggle label="تطبيق التخفيض الحراري" checked={deratingOn} onChange={props.onDerating} />
      <Sensitivity plain={plain} derated={derated} applied={deratingOn} digits={digits} />
      <small className="rc-assume__note">
        {derating < 1 ? (
          <>
            معامل شهر {monthLabel}: <span className="num" dir="ltr">× {derating.toFixed(2)}</span> من سعة القاطع
          </>
        ) : (
          <>لا تخفيض حراري في {monthLabel} — غيّر الشهر من خيارات التصفية.</>
        )}
      </small>
    </div>
  )

  const saveRating = async () => {
    const value = Number(normalizeQuery(ratingDraft ?? ''))
    if (Number.isFinite(value) && value > 0 && (await props.onRating(value))) setRatingDraft(null)
  }

  return (
    <aside className={`rc-float rc-drawer rc-plans${editor.picking ? ' is-picking' : ''}`} id="rc-plans" aria-label="خطط التغذية البديلة">
      <header className="rc-drawer__head" hidden={editor.picking}>
        <Icon name="swap" size={16} />
        <h2 className="rc-drawer__title">خطط التغذية البديلة</h2>
        {rows.length > 0 && <span className="rc-count rc-count--quiet num">{fmt(rows.length)}</span>}
        <button className="rc-icon-btn rc-drawer__reset" type="button" aria-label="إغلاق خطط التغذية البديلة" title="إغلاق" onClick={props.onClose}>
          <Icon name="close" size={17} />
        </button>
      </header>

      {/* a fresh body for each view, so none opens scrolled to where the last one was left */}
      <div className="rc-drawer__body" key={editor.draft?.id ?? selected?.plan.id ?? 'list'}>
        {plans.loading ? (
          <p className="rc-imported__status" role="status">
            <span className="rc-spinner" aria-hidden="true" />
            جارٍ تحميل الخطط…
          </p>
        ) : editor.draft ? (
          <>
            {!editor.picking && <h3 className="rc-detail__title">{editor.isNew ? 'خطة جديدة' : 'تعديل الخطة'}</h3>}
            <PlanForm
              editor={editor}
              draft={editor.draft}
              ratingA={ratingA}
              directory={directory}
              busy={busy}
              onSave={async (saved) => {
                const written = await props.onSave(saved)
                if (written) props.onSelect(saved.id, saved)
                return written
              }}
              onPicked={props.onPicked}
              onCancel={editor.close}
            />
          </>
        ) : selected ? (
          <PlanDetail
            plan={selected.plan}
            result={deratingOn ? selected.derated : selected.plain}
            sensitivity={sensitivity(selected.plain, selected.derated, 0)}
            ratingA={ratingA}
            directory={directory}
            canEdit={isAdmin}
            busy={busy}
            onBack={() => props.onSelect(null)}
            onEdit={() => editor.open(selected.plan)}
            onDelete={async () => {
              if (await props.onDelete(selected.plan.id)) props.onSelect(null)
            }}
            onShowOnMap={props.onShowOnMap}
            supports={props.supports}
            onPlan={(caseId) => props.onSelect(caseId)}
          />
        ) : (
          <>
            {plans.notice && <p className="rc-plans__notice">{NOTICE[plans.notice]}</p>}

            {rows.length > 0 && (
              <>
                <SummaryBlock total={total} />
                {sensitivity(totals.plain, totals.derated, 1)}
              </>
            )}

            <div className="rc-plans__rating">
              <span>سعة القاطع المعتمدة</span>
              {ratingDraft === null ? (
                <>
                  <b>{amps(ratingA)}</b>
                  {isAdmin && (
                    <button className="rc-link" type="button" onClick={() => setRatingDraft(String(ratingA))}>
                      تغيير
                    </button>
                  )}
                </>
              ) : (
                <>
                  <input className="num" dir="ltr" type="text" inputMode="decimal" aria-label="سعة القاطع المعتمدة بالأمبير" value={ratingDraft} onChange={(e) => setRatingDraft(e.target.value)} />
                  <button className="rc-link" type="button" disabled={busy} onClick={saveRating}>
                    حفظ
                  </button>
                  <button className="rc-link" type="button" onClick={() => setRatingDraft(null)}>
                    تراجع
                  </button>
                </>
              )}
            </div>

            <div className="rc-plans__tools">
              {isAdmin && (
                <button className="rc-btn rc-btn--accent" type="button" onClick={() => editor.open()}>
                  <Icon name="plus" size={15} />
                  إضافة خطة
                </button>
              )}
              {isAdmin && (
                <button className="rc-btn" type="button" onClick={props.onBulk}>
                  <Icon name="table" size={15} />
                  إدخال جماعي
                </button>
              )}
              {rows.length > 0 && (
                <button className="rc-btn" type="button" onClick={props.onExport}>
                  <Icon name="download" size={15} />
                  تصدير <span lang="en">CSV</span>
                </button>
              )}
            </div>

            {rows.length === 0 ? (
              !plans.notice && (
                <p className="rc-detail__none">
                  لا توجد خطط بعد.{isAdmin ? ' أضف أول خطة: العنصر الرئيسي وحمله، ثم بدائله بالترتيب وأحمالها.' : ' يضيفها مشرف القطاع.'}
                </p>
              )
            ) : (
              <>
                <ul className="rc-plans__list">
                  {rows.map((row) => {
                    const r = deratingOn ? row.derated : row.plain
                    return (
                      <li key={row.plan.id}>
                        <button type="button" onClick={() => props.onSelect(row.plan.id)}>
                          <i className={`rc-plans__dot rc-status--${r.status}`} aria-hidden="true" />
                          <span className="rc-plans__main">
                            <b className="num" dir="ltr">
                              {row.plan.main.no}
                            </b>
                            <small>{row.plan.level === 'feeder' ? 'مغذي' : 'محطة'}</small>
                            {row.plan.demo && <small className="rc-demo-chip">تجريبي</small>}
                          </span>
                          <span className="rc-plans__backups">
                            {row.plan.backups.length === 0
                              ? 'بلا بدائل'
                              : row.plan.backups.map((b, i) => (
                                  <span key={`${i}-${b.no}`}>
                                    <i className="rc-case__order" aria-hidden="true">
                                      {ordinal(i)}
                                    </i>
                                    <bdi className="num" dir="ltr">
                                      {b.no}
                                    </bdi>
                                  </span>
                                ))}
                          </span>
                          <span className={`rc-chip rc-status--${r.status}`} title={STATUS[r.status].label}>
                            <span className="num" dir="ltr">
                              {ratioLabel(r.ratio)}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
