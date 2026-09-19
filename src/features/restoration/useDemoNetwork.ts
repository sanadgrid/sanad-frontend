import { useState } from 'react'

const STORAGE_KEY = 'sanad.rc.demoNetwork'

function readChoice(): boolean {
  try {
    // hidden unless asked for: the page is about real stations, the synthetic network is for training
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // blocked site data: the page opens without it every time
    return false
  }
}

/** Whether the synthetic training network is drawn. Only a network that is one ever asks. */
export function useDemoNetwork() {
  const [shown, setShown] = useState(readChoice)

  const choose = (next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // the choice still holds for this visit
    }
    setShown(next)
  }

  return [shown, choose] as const
}
