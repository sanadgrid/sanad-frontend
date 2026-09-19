import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { keyOfTrashed, type TrashedCase } from '../../../services/backupPlanDoc'
import { deletedAgo } from '../backup/format'
import { fmt } from '../labels'

interface PlansTrashProps {
  /** Deleted plans, as the document keeps them. */
  trash: TrashedCase[]
  busy: boolean
  onRestore: (key: string) => void
  /** Gone for good. */
  onPurge: (key: string) => void
}

// "بديل واحد", "بديلان", "3 بدائل", "11 بديلاً": the noun follows the number
const backupsPhrase = (count: number) =>
  count === 0 ? 'بلا بدائل' : count === 1 ? 'بديل واحد' : count === 2 ? 'بديلان' : count <= 10 ? `${fmt(count)} بدائل` : `${fmt(count)} بديلاً`

/** Deleted plans wait here for thirty days: one click brings a plan back as it was. */
export function PlansTrash({ trash, busy, onRestore, onPurge }: PlansTrashProps) {
  // the plan whose final deletion is waiting for a second, explicit click
  const [confirming, setConfirming] = useState<string | null>(null)
  if (trash.length === 0) return null
  const latestFirst = [...trash].sort((a, b) => b.deletedAt - a.deletedAt)

  return (
    <details className="rc-trash">
      <summary>
        <Icon name="trash" size={14} />
        المحذوفات <span className="num">({fmt(trash.length)})</span>
        <Icon name="chevronDown" size={14} />
      </summary>
      <p className="rc-trash__note">تبقى الخطة المحذوفة هنا 30 يوماً، ثم تُحذف نهائياً.</p>
      <ul>
        {latestFirst.map((item) => {
          const key = keyOfTrashed(item)
          return (
            <li key={key}>
              <span className="rc-trash__what">
                <b className="num" dir="ltr">
                  {item.case.main.no}
                </b>
                <small>
                  {backupsPhrase(item.case.backups.length)} · حُذفت {deletedAgo(item.deletedAt)}
                </small>
              </span>
              {confirming === key ? (
                <span className="rc-trash__acts" role="alert">
                  <span>لا يمكن التراجع بعده.</span>
                  <button className="rc-link" type="button" autoFocus onClick={() => setConfirming(null)}>
                    إلغاء
                  </button>
                  <button
                    className="rc-link rc-link--danger"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConfirming(null)
                      onPurge(key)
                    }}
                  >
                    حذف نهائي
                  </button>
                </span>
              ) : (
                <span className="rc-trash__acts">
                  <button className="rc-link" type="button" disabled={busy} onClick={() => onRestore(key)}>
                    استعادة
                  </button>
                  <button className="rc-link rc-link--danger" type="button" disabled={busy} onClick={() => setConfirming(key)}>
                    حذف نهائي
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
