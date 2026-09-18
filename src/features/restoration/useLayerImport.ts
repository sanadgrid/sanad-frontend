import { useState } from 'react'
import { saveMapLayer } from '../../services/mapLayers'
import { parseKml } from './import/parseKml'
import { preselect } from './import/preselect'
import { kmlTextOf } from './import/readFile'
import { ImportError, type ImportFailure, type ParsedLayer } from './import/types'
import { paletteColor } from './layerPalette'
import type { LatLng } from './types'

export interface PreviewRow {
  layer: ParsedLayer
  color: string
  importable: boolean
  /** Why the layer starts unticked. */
  note?: string
}

export interface ImportJob {
  path: string
  name: string
  state: 'waiting' | 'running' | 'done' | 'failed'
  /** 0 → 1 */
  progress: number
}

export interface ReadFile {
  name: string
  rows: PreviewRow[]
}

// Google Earth files of a whole region are a few megabytes; this is a guard
// against picking something that would freeze the tab.
const MAX_FILE_BYTES = 60 * 1024 * 1024
// a few layers at a time: quicker than one by one, and gentle on the connection
const PARALLEL_UPLOADS = 3

const FAILURE_TEXT: Record<ImportFailure, string> = {
  unsupported: 'الملف المختار ليس بصيغة KMZ أو KML.',
  unreadable: 'تعذّرت قراءة الملف. تأكد أنه ملف KMZ أو KML سليم ثم حاول مرة أخرى.',
  empty: 'لم نجد في الملف عناصر يمكن عرضها على الخريطة.',
}
const TOO_LARGE = 'حجم الملف أكبر من الحد المسموح (60 ميغابايت). قسّمه إلى ملفات أصغر ثم حاول مرة أخرى.'

// lets the browser paint the status line before the parser blocks the thread
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)))

/**
 * The import flow: read a file in the browser → preview its layers → write the
 * ticked ones. The file itself goes nowhere; only the chosen layers are saved.
 */
export function useLayerImport(sectorId: string, center: LatLng, onImported: (layerIds: string[]) => void) {
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<ReadFile | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [jobs, setJobs] = useState<ImportJob[] | null>(null)
  const [running, setRunning] = useState(false)

  const read = async (picked: File) => {
    setError(null)
    setStatus('جارٍ فتح الملف…')
    try {
      if (picked.size > MAX_FILE_BYTES) {
        setError(TOO_LARGE)
        return
      }
      const text = kmlTextOf(picked.name, new Uint8Array(await picked.arrayBuffer()))
      setStatus('جارٍ قراءة الطبقات…')
      await nextPaint()
      const rows = parseKml(text).layers.map((layer, i) => ({ layer, color: paletteColor(i), ...preselect(layer, center) }))
      setSelected(new Set(rows.filter((row) => row.selected).map((row) => row.layer.path)))
      setFile({ name: picked.name, rows })
    } catch (failure) {
      console.error('map layer import:', failure)
      setError(FAILURE_TEXT[failure instanceof ImportError ? failure.reason : 'unreadable'])
    } finally {
      setStatus(null)
    }
  }

  const patchJob = (path: string, patch: Partial<ImportJob>) =>
    setJobs((current) => current?.map((job) => (job.path === path ? { ...job, ...patch } : job)) ?? null)

  const upload = async (rows: PreviewRow[], sourceFile: string) => {
    setRunning(true)
    const queue = [...rows]
    const imported: string[] = []
    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        const { layer, color } = row
        if (!layer.bbox) continue
        patchJob(layer.path, { state: 'running', progress: 0 })
        try {
          const payload = { ...layer, bbox: layer.bbox, color, sourceFile }
          imported.push(await saveMapLayer(sectorId, payload, (progress) => patchJob(layer.path, { progress })))
          patchJob(layer.path, { state: 'done', progress: 1 })
        } catch (failure) {
          console.error('map layer import:', layer.path, failure)
          patchJob(layer.path, { state: 'failed' })
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker))
    setRunning(false)
    if (imported.length > 0) onImported(imported)
  }

  /** Writes the ticked layers — or, after a run, only those that failed. */
  const start = () => {
    if (!file) return
    const failed = new Set(jobs?.filter((job) => job.state === 'failed').map((job) => job.path))
    const rows = file.rows.filter((row) => (jobs ? failed.has(row.layer.path) : selected.has(row.layer.path)))
    setJobs((current) => [
      ...(current?.filter((job) => job.state === 'done') ?? []),
      ...rows.map(({ layer }): ImportJob => ({ path: layer.path, name: layer.name, state: 'waiting', progress: 0 })),
    ])
    void upload(rows, file.name)
  }

  const reset = () => {
    setFile(null)
    setJobs(null)
    setError(null)
  }

  return { status, error, file, selected, setSelected, jobs, running, read, start, reset }
}
