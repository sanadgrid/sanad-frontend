// Operations think in amperes per feeder, the network model in MVA. Three-phase:
// S = √3 · V · I. The only place the conversion is written.

const SQRT3 = Math.sqrt(3)

export const ampsToMva = (amps: number, voltageKv: number) => (SQRT3 * voltageKv * amps) / 1000

export const mvaToAmps = (mva: number, voltageKv: number) => (voltageKv > 0 ? (mva * 1000) / (SQRT3 * voltageKv) : 0)
