import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import type { MapLayer } from '../../../services/mapLayers'
import { deletedAgo } from '../backup/format'
import { fmt } from '../labels'

interface LayersTrashProps {
  /** Deleted within the last thirty days, the latest first. */
  trashed: MapLayer[]
  busy: boolean
  onRestore: (layerIds: string[]) => void
  /** Gone for good: only now are the parts of the layer deleted. */
  onDestroy: (layerIds: string[]) => void
}

/** Deleted layers wait here for thirty days: hidden everywhere, and whole. */
export function LayersTrash({ trashed, busy, onRestore, onDestroy }: LayersTrashProps) {
  // the layer whose final deletion is waiting for a second, explicit click
  const [confirming, setConfirming] = useState<string | null>(null)
  if (trashed.length === 0) return null

  return (
    <details className="rc-trash">
      <summary>
        <Icon name="trash" size={14} />
        طبقات محذوفة <span className="num">({fmt(trashed.length)})</span>
        <Icon name="chevronDown" size={14} />
      </summary>
      <p className="rc-trash__note">تبقى الطبقة المحذوفة هنا 30 يوماً، ثم تُحذف نهائياً.</p>
      <ul>
        {trashed.map((layer) => (
          <li key={layer.id}>
            <span className="rc-trash__what">
              <bdi>{layer.name}</bdi>
              <small>
                {layer.stations?.length ? `${fmt(layer.stations.length)} محطة · ` : ''}حُذفت {deletedAgo(layer.deletedAt ?? 0)}
              </small>
            </span>
            {confirming === layer.id ? (
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
                    onDestroy([layer.id])
                  }}
                >
                  حذف نهائي
                </button>
              </span>
            ) : (
              <span className="rc-trash__acts">
                <button className="rc-link" type="button" disabled={busy} onClick={() => onRestore([layer.id])}>
                  استعادة
                </button>
                <button className="rc-link rc-link--danger" type="button" disabled={busy} onClick={() => setConfirming(layer.id)}>
                  حذف نهائي
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
