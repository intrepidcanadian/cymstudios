'use client'

import { useEffect, useState } from 'react'

export type Theme = 'ember' | 'cyan' | 'lime' | 'magenta'

const STORAGE_KEY = 'cym_landing_theme' // shared with landing
const VALID: Theme[] = ['ember', 'cyan', 'lime', 'magenta']

/**
 * Reads the landing's theme choice from localStorage so the catalogue
 * accent follows the same selection. Defaults to 'ember' if unset.
 */
export function useCatalogueTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('ember')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && (VALID as string[]).includes(saved)) {
        setTheme(saved as Theme)
      }
    } catch {
      /* ignore */
    }
  }, [])

  return theme
}
