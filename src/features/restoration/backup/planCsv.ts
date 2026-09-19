import { linesToCsv } from '../exportCsv'
import { assessCase, type BackupCase, type ModelOptions } from './model'

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits
const pct = (ratio: number) => round(ratio * 100)

/**
 * Every case with its result, one line each, the backups side by side as in the
 * team's sheet. The derated columns repeat the result under the period's thermal
 * derating, so the sensitivity travels with the file.
 */
export function plansToCsv(cases: BackupCase[], options: ModelOptions, derating: number): string {
  const width = Math.max(0, ...cases.map((c) => c.backups.length))
  const backupHeaders = Array.from({ length: width }, (_, i) =>
    ['no', 'load_a', 'spare_a', 'transfer_a', 'final_load_a', 'final_loading_pct'].map((name) => `backup${i + 1}_${name}`),
  ).flat()
  const header = [
    'level', 'voltage_kv', 'main_no', 'main_load_a', 'main_load_mva', 'rating_a', 'backups', 'total_spare_a',
    'restorable_a', 'unrestorable_a', 'restorable_mva', 'unrestorable_mva', 'ratio_pct', 'status',
    'derating', 'derated_ratio_pct', 'derated_unrestorable_a', 'derated_status',
    ...backupHeaders, 'demo', 'note',
  ]
  const lines = cases.map((c) => {
    const r = assessCase(c, options)
    const derated = assessCase(c, { ...options, derating })
    const backups = Array.from({ length: width }, (_, i) => {
      const t = r.transfers[i]
      return t ? [t.no, round(t.loadA), round(t.spareA), round(t.transferA), round(t.finalLoadA), round(t.finalLoadingPct)] : ['', '', '', '', '', '']
    }).flat()
    return [
      c.level, c.voltageKv, c.main.no, round(r.loadA), round(r.loadMva, 2), c.ratingA ?? options.ratingA ?? '', c.backups.length, round(r.totalSpareA),
      round(r.restorableA), round(r.unrestorableA), round(r.restorableMva, 2), round(r.unrestorableMva, 2), pct(r.ratio), r.status,
      derating, pct(derated.ratio), round(derated.unrestorableA), derated.status,
      ...backups, c.demo ? 'yes' : '', c.note ?? '',
    ]
  })
  return linesToCsv([header, ...lines])
}
