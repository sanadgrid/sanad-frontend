import { assessCase, statusOf, type BackupCase } from '../../restoration/backup/model'
import type { Status } from '../../restoration/engine'

// A synthetic slice of a distribution network, drawn in the console's own
// language: status-coloured stations, ties along the streets, numbered backups.
// Codes are invented; coordinates live on a 640 × 520 canvas.

export const VIEW = { width: 640, height: 520 }

export interface SceneStation {
  code: string
  x: number
  y: number
  /** Restoration capacity if this station were the one lost, in percent. */
  percent: number
  /** Centre of the label pill, relative to the node — kept clear of every line. */
  label: [dx: number, dy: number]
}

export const LOST = { code: '7004', x: 320, y: 260, label: [0, -31] as [number, number] }

export const stations: SceneStation[] = [
  { code: '7001', x: 100, y: 110, percent: 100, label: [18, -31] },
  { code: '7002', x: 360, y: 70, percent: 100, label: [0, -35] },
  { code: '7003', x: 560, y: 180, percent: 84, label: [-76, 0] },
  { code: '7005', x: 530, y: 410, percent: 100, label: [-76, 0] },
  { code: '7006', x: 100, y: 380, percent: 62, label: [76, 0] },
  { code: '7007', x: 300, y: 450, percent: 100, label: [0, -31] },
]

/** The lost station and the two backups called on, in order — assessed by the real model. */
export const lossCase: BackupCase = {
  id: 'hero',
  level: 'station',
  voltageKv: 13.8,
  ratingA: 2000,
  main: { no: LOST.code, loadA: 1240 },
  backups: [
    { no: '7002', loadA: 1330 },
    { no: '7005', loadA: 1520 },
  ],
}

export const loss = assessCase(lossCase)

/** Transfers flow along these paths, from the backup into the lost station. */
export const transferPaths = [
  { d: 'M360 70V150H400V260H320', label: { x: 380, y: 150 } },
  { d: 'M530 410V330H320V260', label: { x: 432, y: 330 } },
]

/** Normally-open ties that play no part in this event; `open` marks the open point. */
export const idleTies = [
  { d: 'M100 110H240V70H360', open: { x: 240, y: 90 } },
  { d: 'M360 70H560V180', open: { x: 470, y: 70 } },
  { d: 'M100 380V260H320', open: { x: 200, y: 260 } },
  { d: 'M100 380V450H300', open: { x: 100, y: 450 } },
  { d: 'M300 450H530V410', open: { x: 420, y: 450 } },
  { d: 'M560 180V410H530', open: { x: 560, y: 300 } },
]

/** Short radial feeders, so the stations read as supplying neighbourhoods. */
export const feederStubs =
  'M100 110H40V60M100 110V170' +
  'M560 180H610V130M610 180V230' +
  'M100 380H40V330' +
  'M300 450V496M240 496H370'

export const loadPoints = [
  [40, 60], [100, 170], [610, 130], [610, 230], [40, 330], [240, 496], [370, 496],
]

export const criticalSites = [
  { kind: 'sensitive', x: 258, y: 304 },
  { kind: 'vip', x: 440, y: 290 },
] as const

export const statusOfPercent = (percent: number): Status => statusOf(percent / 100)
