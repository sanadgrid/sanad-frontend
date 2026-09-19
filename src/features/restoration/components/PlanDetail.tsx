import { useState, type ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { locate, type StationDirectory } from '../backup/directory'
import { ratioLabel } from '../backup/format'
import type { BackupCase, CaseResult } from '../backup/model'
import { fmt } from '../labels'
import { CaseFigures, CaseTable } from './CaseTable'
import { NOT_ON_MAP } from './StationNoField'

export interface SensitivityProps {
  plain: { ratio: number; status: CaseResult['status']; unrestorableA: number }
  derated: { ratio: number; status: CaseResult['status']; unrestorableA: number }
  /** Which of the two the figures around it follow. */
  applied: boolean
  digits?: 0 | 1
}

/** The same cases with and without the period's derating, side by side: how much rests on the rating. */
export function Sensitivity({ plain, derated, applied, digits = 0 }: SensitivityProps) {
  const side = (label: string, r: SensitivityProps['plain'], current: boolean) => (
    <div className={current ? 'is-current' : undefined}>
      <span>{label}</span>
      <strong className={`num rc-status--${r.status}`} dir="ltr">
        {ratioLabel(r.ratio, digits)}
      </strong>
      <small>
        غير مستعاد{' '}
        <span className="num" dir="ltr">
          {fmt(r.unrestorableA)} A
        </span>
      </small>
    </div>
  )
  return (
    <div className="rc-sens">
      {side('بدون تخفيض', plain, !applied)}
      <Icon name="arrowLeft" size={16} />
      {side('مع التخفيض', derated, applied)}
    </div>
  )
}

interface PlanDetailProps {
  plan: BackupCase
  result: CaseResult
  /** The derating switch with the result on either side of it. */
  sensitivity: ReactNode
  ratingA: number
  directory: StationDirectory
  canEdit: boolean
  busy: boolean
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  /** Phones: the sheet gives way to the map. */
  onShowOnMap: () => void
}

export function PlanDetail(props: PlanDetailProps) {
  const { plan, result, ratingA, directory, canEdit, busy, onBack, onEdit, onDelete, onShowOnMap } = props
  const [confirming, setConfirming] = useState(false)
  const missing = [plan.main, ...plan.backups].filter((e) => !locate(directory, e.no)).map((e) => e.no)
  const names = plan.backups.map((b) => {
    const station = locate(directory, b.no)
    return station && station.name !== `S/S ${station.no}` ? station.name : undefined
  })

  return (
    <div className="rc-plan">
      <div className="rc-plan__bar">
        <button className="rc-link rc-feeder__back" type="button" onClick={onBack}>
          <Icon name="arrowRight" size={13} />
          كل الخطط
        </button>
        <button className="rc-link rc-plan__onmap" type="button" onClick={onShowOnMap}>
          <Icon name="map" size={13} />
          عرض على الخريطة
        </button>
        {canEdit && !confirming && (
          <>
            <button className="rc-icon-btn rc-icon-btn--small" type="button" aria-label="تعديل الخطة" title="تعديل" onClick={onEdit}>
              <Icon name="edit" size={14} />
            </button>
            <button className="rc-icon-btn rc-icon-btn--small" type="button" aria-label="حذف الخطة" title="حذف" disabled={busy} onClick={() => setConfirming(true)}>
              <Icon name="trash" size={14} />
            </button>
          </>
        )}
      </div>

      {confirming && (
        <p className="rc-imported__confirm" role="alert">
          <span>
            حذف خطة «<bdi className="num">{plan.main.no}</bdi>» نهائياً؟
          </span>
          <button className="rc-link rc-link--danger" type="button" disabled={busy} onClick={onDelete}>
            حذف
          </button>
          <button className="rc-link" type="button" onClick={() => setConfirming(false)}>
            تراجع
          </button>
        </p>
      )}

      <div className="rc-feeder__head">
        <h3>
          عند فقد {plan.level === 'feeder' ? 'المغذي' : 'المحطة'}{' '}
          <bdi className="num" dir="ltr">
            {plan.main.no}
          </bdi>
        </h3>
        <p>
          <span className="num" dir="ltr">
            {plan.voltageKv} kV
          </span>{' '}
          · سعة القاطع{' '}
          <span className="num" dir="ltr">
            {fmt(plan.ratingA ?? ratingA)} A
          </span>
          {plan.ratingA ? ' (خاصة بهذه الخطة)' : ''}
        </p>
        {plan.note && <p className="rc-plan__note">{plan.note}</p>}
      </div>

      <CaseFigures result={result} subject={plan.level === 'feeder' ? 'حمل المغذي' : 'حمل المحطة'} />
      {props.sensitivity}
      <CaseTable result={result} captions={names} />

      {missing.length > 0 && (
        <p className="rc-plans__notice">
          <bdi className="num" dir="ltr">
            {missing.join(' · ')}
          </bdi>{' '}
          — {NOT_ON_MAP}
        </p>
      )}
    </div>
  )
}
