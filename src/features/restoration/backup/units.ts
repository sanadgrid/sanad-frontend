// Operations think in amperes per feeder, the network model in MVA. Three-phase:
// S = √3 · V · I. The only place the conversion is written.

const SQRT3 = Math.sqrt(3)

export const ampsToMva = (amps: number, voltageKv: number) => (SQRT3 * voltageKv * amps) / 1000

export const mvaToAmps = (mva: number, voltageKv: number) => (voltageKv > 0 ? (mva * 1000) / (SQRT3 * voltageKv) : 0)

/** Used only to say an unrestored load in MW — the same planning assumption the station-level engine makes. */
export const POWER_FACTOR = 0.9

export const mvaToMw = (mva: number) => mva * POWER_FACTOR
