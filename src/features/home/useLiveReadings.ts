import { useEffect, useState } from 'react'

export interface LiveReadings {
  voltage: number
  frequency: number
  load: number
}

const base: LiveReadings = { voltage: 230.4, frequency: 60, load: 4812 }

const jitter = (center: number, spread: number) => center + (Math.random() - 0.5) * 2 * spread

// Simulated readings for the hero panel. Replace with a `services/` subscription
// once real telemetry exists.
export function useLiveReadings(intervalMs = 2200): LiveReadings {
  const [readings, setReadings] = useState(base)

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => {
      setReadings({
        voltage: jitter(base.voltage, 0.35),
        frequency: jitter(base.frequency, 0.02),
        load: Math.round(jitter(base.load, 40)),
      })
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return readings
}
