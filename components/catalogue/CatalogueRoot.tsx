'use client'

import type { ReactNode } from 'react'
import styles from './catalogue.module.css'
import { useCatalogueTheme } from './useCatalogueTheme'

export default function CatalogueRoot({ children }: { children: ReactNode }) {
  const theme = useCatalogueTheme()
  return (
    <div className={styles.root} data-theme={theme}>
      {children}
    </div>
  )
}
