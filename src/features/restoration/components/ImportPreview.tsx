import type { LayerCounts } from '../import/types'
import { fmt } from '../labels'
import { swatchStyle } from '../layerPalette'
import type { PreviewRow } from '../useLayerImport'

interface ImportPreviewProps {
  rows: PreviewRow[]
  selected: ReadonlySet<string>
  onSelected: (selected: ReadonlySet<string>) => void
}

export function CountsLine({ counts }: { counts: LayerCounts }) {
  return (
    <span className="rc-import__counts">
      <span>
        <b className="num">{fmt(counts.point)}</b> نقاط
      </span>
      <span>
        <b className="num">{fmt(counts.line)}</b> خطوط
      </span>
      <span>
        <b className="num">{fmt(counts.polygon)}</b> مناطق
      </span>
    </span>
  )
}

export function ImportPreview({ rows, selected, onSelected }: ImportPreviewProps) {
  const importable = rows.filter((row) => row.importable)
  const chosen = importable.filter((row) => selected.has(row.layer.path))
  const totals = chosen.reduce<LayerCounts>(
    (sum, { layer: { counts } }) => ({
      point: sum.point + counts.point,
      line: sum.line + counts.line,
      polygon: sum.polygon + counts.polygon,
    }),
    { point: 0, line: 0, polygon: 0 },
  )

  const toggle = (path: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(path)
    else next.delete(path)
    onSelected(next)
  }

  return (
    <>
      <div className="rc-import__bar">
        <p>
          المحدد <b className="num">{fmt(chosen.length)}</b> من <b className="num">{fmt(rows.length)}</b> طبقة
        </p>
        <CountsLine counts={totals} />
        <span className="rc-import__bar-actions">
          <button className="rc-link" type="button" onClick={() => onSelected(new Set(importable.map((r) => r.layer.path)))}>
            تحديد الكل
          </button>
          <button className="rc-link" type="button" onClick={() => onSelected(new Set())}>
            إلغاء التحديد
          </button>
        </span>
      </div>

      <ul className="rc-import__list">
        {rows.map(({ layer, color, importable: allowed, note }) => (
          <li key={layer.path}>
            <label className="rc-check">
              <input
                type="checkbox"
                checked={selected.has(layer.path)}
                disabled={!allowed}
                onChange={(e) => toggle(layer.path, e.target.checked)}
              />
              <i className="rc-imported__swatch" style={swatchStyle(color)} aria-hidden="true" />
              <bdi>{layer.name}</bdi>
            </label>
            <CountsLine counts={layer.counts} />
            {note && <small className="rc-import__note">{note}</small>}
          </li>
        ))}
      </ul>
    </>
  )
}
