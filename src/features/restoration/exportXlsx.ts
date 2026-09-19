import type { StationDirectory } from './backup/directory'
import type { BackupCase, ModelOptions } from './backup/model'
import { plansWorkbook } from './backup/planXlsx'
import { stationsExportWorkbook, stationsTemplateWorkbook } from './backup/stationSheet'
import { XLSX_TYPE } from './backup/xlsxWrite'
import { saveBlob } from './exportCsv'

export const saveXlsx = (bytes: Uint8Array, fileName: string): void => saveBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: XLSX_TYPE }), fileName)

export const savePlansXlsx = (cases: BackupCase[], options: ModelOptions, derating: number, fileName: string, directory: StationDirectory): void =>
  saveXlsx(plansWorkbook(cases, options, derating, directory), fileName)

/** Every station the sector holds, from the station directory: nothing is read. */
export const saveStationsXlsx = (directory: StationDirectory, cases: BackupCase[], options: ModelOptions, fileName: string): void =>
  saveXlsx(stationsExportWorkbook(directory, cases, options), fileName)

export const saveStationsTemplate = (fileName: string): void => saveXlsx(stationsTemplateWorkbook(), fileName)
