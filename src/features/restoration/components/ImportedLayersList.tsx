import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { featureCount, type Bbox } from '../import/types'
import { fmt } from '../labels'
import { swatchStyle } from '../layerPalette'
import type { ImportedLayers } from '../useMapLayers'

interface ImportedLayersListProps {
  imported: ImportedLayers
  /** Only admins may delete a layer. */
  canDelete: boolean
  busy: boolean
  onZoom: (bbox: Bbox) => void
  onDelete: (layerId: string) => void
}

export function ImportedLayersList({ imported, canDelete, busy, onZoom, onDelete }: ImportedLayersListProps) {
  const { layers, active, loading, failed } = imported
  // the layer whose deletion is waiting for a second, explicit click
  const [confirming, setConfirming] = useState<string | null>(null)

  return (
    <div className="rc-imported">
      <div className="rc-imported__head">
        <span className="rc-field__label">
          طبقات مستوردة <span className="num">({fmt(layers.length)})</span>
        </span>
        {active.size > 0 && (
          <button className="rc-link" type="button" onClick={imported.hideAll}>
            إخفاء الكل
          </button>
        )}
      </div>

      <ul className="rc-imported__list">
        {layers.map((layer) =>
          confirming === layer.id ? (
            <li key={layer.id} className="rc-imported__confirm" role="alert">
              <span>
                حذف «<bdi>{layer.name}</bdi>» نهائياً؟
              </span>
              <button
                className="rc-link rc-link--danger"
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirming(null)
                  onDelete(layer.id)
                }}
              >
                حذف
              </button>
              <button className="rc-link" type="button" onClick={() => setConfirming(null)}>
                تراجع
              </button>
            </li>
          ) : (
            <li key={layer.id}>
              <label className="rc-check" title={layer.name}>
                <input
                  type="checkbox"
                  checked={active.has(layer.id)}
                  onChange={(e) => imported.toggle(layer.id, e.target.checked)}
                />
                <i className="rc-imported__swatch" style={swatchStyle(layer.style.color)} aria-hidden="true" />
                <bdi>{layer.name}</bdi>
              </label>
              {loading.has(layer.id) ? (
                <span className="rc-spinner" role="status" aria-label="جارٍ تحميل الطبقة" />
              ) : failed.has(layer.id) ? (
                <span className="rc-imported__failed">تعذّر التحميل</span>
              ) : (
                <span className="rc-imported__count num" title="عدد العناصر">
                  {fmt(featureCount(layer.counts))}
                </span>
              )}
              <button
                className="rc-icon-btn rc-icon-btn--small"
                type="button"
                aria-label={`عرض «${layer.name}» على الخريطة`}
                title="الانتقال إلى الطبقة"
                onClick={() => {
                  // moving to a layer that is not shown would land on an empty map
                  if (!active.has(layer.id)) imported.toggle(layer.id, true)
                  onZoom(layer.bbox)
                }}
              >
                <Icon name="crosshair" size={14} />
              </button>
              {canDelete && (
                <button
                  className="rc-icon-btn rc-icon-btn--small"
                  type="button"
                  aria-label={`حذف «${layer.name}»`}
                  title="حذف الطبقة"
                  disabled={busy}
                  onClick={() => setConfirming(layer.id)}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
