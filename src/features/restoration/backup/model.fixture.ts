import type { BackupCase } from './model'

// The team's worked example: 30 feeders in three sectors, two backups each, all
// figures synthetic. (sector, main load, first backup, second backup) in amperes.
const SHEET: Record<string, [c: number, a1: number, a2: number][]> = {
  A: [
    [300, 220, 270], [280, 245, 260], [260, 250, 245], [310, 230, 275], [290, 260, 255],
    [275, 240, 280], [320, 270, 250], [265, 235, 270], [305, 255, 265], [285, 250, 260],
  ],
  B: [
    [295, 265, 255], [315, 245, 275], [270, 255, 265], [300, 270, 250], [280, 250, 280],
    [325, 275, 260], [260, 240, 275], [310, 260, 245], [290, 280, 255], [275, 250, 285],
  ],
  C: [
    [305, 260, 275], [285, 270, 250], [315, 255, 280], [265, 245, 265], [300, 275, 255],
    [290, 250, 285], [320, 285, 250], [275, 260, 270], [310, 270, 245], [280, 255, 280],
  ],
}

export const sectorOf = new Map<string, string>()
export const cases: BackupCase[] = Object.entries(SHEET).flatMap(([sector, rows]) =>
  rows.map(([c, a1, a2]) => {
    const id = `F${String(sectorOf.size + 1).padStart(2, '0')}`
    sectorOf.set(id, sector)
    return {
      id,
      level: 'feeder' as const,
      voltageKv: 13.8,
      main: { no: id, loadA: c },
      backups: [
        { no: `${id}-B1`, loadA: a1 },
        { no: `${id}-B2`, loadA: a2 },
      ],
    }
  }),
)
export const bySector = (c: BackupCase) => sectorOf.get(c.id) ?? ''
