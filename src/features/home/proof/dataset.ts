import type { BackupCase } from '../../restoration/backup/model'

// The synthetic worked example the backup model is calibrated on (see
// restoration/backup/model.test.ts): 30 feeders in three sectors, two backups each.
// (main load, first backup, second backup) in amperes. No real network behind it.
const SHEET: [main: number, b1: number, b2: number][][] = [
  [
    [300, 220, 270], [280, 245, 260], [260, 250, 245], [310, 230, 275], [290, 260, 255],
    [275, 240, 280], [320, 270, 250], [265, 235, 270], [305, 255, 265], [285, 250, 260],
  ],
  [
    [295, 265, 255], [315, 245, 275], [270, 255, 265], [300, 270, 250], [280, 250, 280],
    [325, 275, 260], [260, 240, 275], [310, 260, 245], [290, 280, 255], [275, 250, 285],
  ],
  [
    [305, 260, 275], [285, 270, 250], [315, 255, 280], [265, 245, 265], [300, 275, 255],
    [290, 250, 285], [320, 285, 250], [275, 260, 270], [310, 270, 245], [280, 255, 280],
  ],
]

export const SECTOR_SIZE = 10
export const VOLTAGE_KV = 13.8

export const feeders: BackupCase[] = SHEET.flat().map(([main, b1, b2], i) => {
  const id = `F${String(i + 1).padStart(2, '0')}`
  return {
    id,
    level: 'feeder',
    voltageKv: VOLTAGE_KV,
    main: { no: id, loadA: main },
    backups: [
      { no: `${id}-B1`, loadA: b1 },
      { no: `${id}-B2`, loadA: b2 },
    ],
  }
})
