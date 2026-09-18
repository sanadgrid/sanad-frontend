import { useEffect, useRef } from 'react'
import { Icon } from '../../../components/Icon'
import type { LatLng } from '../types'
import { useLayerImport } from '../useLayerImport'
import { ImportPreview } from './ImportPreview'
import { ImportProgress } from './ImportProgress'

interface ImportDialogProps {
  sectorId: string
  sectorName: string
  /** Layers far from here start unticked. */
  center: LatLng
  onImported: (layerIds: string[]) => void
  onClose: () => void
}

const RESTRICTED_NOTICE = 'ستُحفظ هذه البيانات كبيانات مقيّدة لا يراها إلا المصرّح لهم في هذا القطاع'

export function ImportDialog({ sectorId, sectorName, center, onImported, onClose }: ImportDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const flow = useLayerImport(sectorId, center, onImported)
  const { file, jobs, running, selected } = flow

  // a modal <dialog> brings the focus trap, the Esc key and the backdrop with it
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  const failed = jobs?.some((job) => job.state === 'failed') ?? false

  return (
    <dialog
      className="rc-dialog"
      ref={dialog}
      aria-labelledby="rc-import-title"
      onCancel={(event) => {
        // Esc goes through the same door as the buttons — and not at all while
        // layers are being written: a half-written import is worse than a wait
        event.preventDefault()
        if (!running) onClose()
      }}
    >
      <header className="rc-dialog__head">
        <div>
          <h2 id="rc-import-title">استيراد طبقات الخريطة</h2>
          <p>{sectorName} · ملفات Google Earth بصيغة KMZ أو KML</p>
        </div>
        <button className="rc-icon-btn" type="button" aria-label="إغلاق" disabled={running} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="rc-dialog__body">
        {jobs ? (
          <ImportProgress jobs={jobs} running={running} />
        ) : file ? (
          <>
            <p className="rc-import__file">
              <Icon name="file" size={16} />
              <bdi>{file.name}</bdi>
            </p>
            <ImportPreview rows={file.rows} selected={selected} onSelected={flow.setSelected} />
          </>
        ) : flow.status ? (
          <div className="rc-import__reading" role="status">
            <progress className="rc-progress" aria-label={flow.status} />
            <p>{flow.status}</p>
          </div>
        ) : (
          <>
            <label className="rc-import__pick">
              <Icon name="upload" size={26} />
              <b>اختر ملف KMZ أو KML من جهازك</b>
              <span>يُقرأ الملف داخل متصفحك، ولا يُحفظ منه إلا الطبقات التي تختارها.</span>
              <input
                type="file"
                accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml"
                onChange={(e) => {
                  const picked = e.target.files?.[0]
                  if (picked) void flow.read(picked)
                }}
              />
            </label>
            {flow.error && (
              <p className="rc-import__error" role="alert">
                <Icon name="alert" size={16} />
                {flow.error}
              </p>
            )}
          </>
        )}
      </div>

      {file && !jobs && (
        <p className="rc-import__notice">
          <Icon name="lock" size={16} />
          {RESTRICTED_NOTICE}
        </p>
      )}

      <footer className="rc-dialog__foot">
        {file && !jobs && (
          <>
            <button className="rc-btn" type="button" onClick={flow.reset}>
              اختيار ملف آخر
            </button>
            <button className="rc-btn rc-btn--accent" type="button" disabled={selected.size === 0} onClick={flow.start}>
              <Icon name="upload" size={15} />
              استيراد
            </button>
          </>
        )}
        {jobs && !running && failed && (
          <button className="rc-btn" type="button" onClick={flow.start}>
            إعادة محاولة الطبقات المتعثّرة
          </button>
        )}
        {(!file || (jobs && !running)) && (
          <button className="rc-btn" type="button" onClick={onClose}>
            {jobs ? 'إغلاق' : 'إلغاء'}
          </button>
        )}
      </footer>
    </dialog>
  )
}
