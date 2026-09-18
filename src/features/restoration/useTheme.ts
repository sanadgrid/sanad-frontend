import { useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sanad.rc.theme'

// storage can be blocked (private mode, site-data settings): the page then
// simply opens in the light theme every time
function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // the choice still holds for this visit
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    storeTheme(next)
    setTheme(next)
  }

  return [theme, toggleTheme] as const
}
