'use client'

import { useEffect, useState } from 'react'
import type { Theme } from './TopBar'

const STORAGE_KEY = 'cym_landing_theme'
const VALID: Theme[] = ['ember', 'cyan', 'lime', 'magenta']

export function useTheme(defaultTheme: Theme = 'ember'): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)

  // Hydrate from localStorage on mount (client-only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && (VALID as string[]).includes(saved)) {
        setThemeState(saved as Theme)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* ignore */
    }
  }

  return [theme, setTheme]
}
