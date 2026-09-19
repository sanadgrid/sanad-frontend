import type { BackupCase, ModelOptions } from './backup/model'
import { plansWorkbook } from './backup/planXlsx'
import { XLSX_TYPE } from './backup/xlsxWrite'
import { saveBlob } from './exportCsv'

export const saveXlsx = (bytes: Uint8Array, fileName: string): void => saveBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: XLSX_TYPE }), fileName)

export const savePlansXlsx = (cases: BackupCase[], options: ModelOptions, derating: number, fileName: string): void => saveXlsx(plansWorkbook(cases, options, derating), fileName)
