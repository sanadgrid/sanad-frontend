import type { StationRow } from './filters'

const columns: [header: string, value: (row: StationRow) => string | number][] = [
  ['station_code', ({ station }) => station.code],
  ['district', ({ station }) => station.district],
  ['area', ({ station }) => station.areaId],
  ['department', ({ station }) => station.department ?? ''],
  ['type', ({ station }) => station.type],
  ['voltage_kv', ({ station }) => station.voltageKv],
  ['load_mva', ({ assessment }) => assessment.loadMva],
  ['firm_capacity_mva', ({ assessment }) => assessment.firmCapacityMva],
  ['transformer_n1', ({ assessment }) => (assessment.transformerN1 ? 'yes' : 'no')],
  ['restoration_pct', ({ assessment }) => assessment.capacityPct],
  ['remote_pct', ({ assessment }) => assessment.remotePct],
  ['restored_remote_mva', ({ assessment }) => assessment.restoredRemoteMva],
  ['restored_manual_mva', ({ assessment }) => assessment.restoredManualMva],
  ['temporary_supply_used_mva', ({ assessment }) => assessment.temporaryMva],
  ['unrestored_mva', ({ assessment }) => assessment.unrestoredMva],
  ['unrestored_mw', ({ assessment }) => assessment.unrestoredMw],
  ['customers', ({ assessment }) => assessment.customers],
  ['customers_at_risk', ({ assessment }) => assessment.customersAtRisk],
  ['sensitive_customers', ({ station }) => station.sensitiveCustomers.length],
  ['vip_customers', ({ station }) => station.vipCustomers.length],
  ['station_n1', ({ assessment }) => (assessment.n1 ? 'yes' : 'no')],
  ['temporary_supply_mva', ({ station }) => station.temporarySupplyMva],
  ['status', ({ assessment }) => assessment.status],
]

const escape = (value: string | number) => {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(rows: StationRow[]): string {
  const lines = [columns.map(([header]) => header), ...rows.map((row) => columns.map(([, value]) => value(row)))]
  return lines.map((line) => line.map(escape).join(',')).join('\r\n')
}

export function downloadCsv(rows: StationRow[], fileName: string): void {
  // the BOM makes Excel read the Arabic district names as UTF-8
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
