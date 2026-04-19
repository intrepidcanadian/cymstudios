'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import styles from '@/app/page.module.css'

export type Theme = 'ember' | 'cyan' | 'lime' | 'magenta'

const THEMES: { key: Theme; label: string }[] = [
  { key: 'ember', label: 'Ember' },
  { key: 'cyan', label: 'Cyan' },
  { key: 'lime', label: 'Lime' },
  { key: 'magenta', label: 'Magenta' },
]

interface TopBarProps {
  theme: Theme
  onThemeChange: (t: Theme) => void
}

const pad = (n: number) => String(n).padStart(2, '0')

function formatZoned(now: Date, offsetHours: number) {
  const d = new Date(now.getTime() + offsetHours * 3600 * 1000)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

export default function TopBar({ theme, onThemeChange }: TopBarProps) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <div className={styles.brandMark} aria-hidden="true" />
        <span>CYM STUDIO</span>
        <span className={styles.brandKind}>/ ai ads for e-commerce</span>
      </div>

      <nav className={styles.nav}>
        <a href="#work">Work</a>
        <a href="#process">Process</a>
        <a href="#about">Studio</a>
        <Link href="/catalogue">Rewards</Link>
        <Link href="/chat">Chat</Link>
        <a href="#contact">Contact</a>
      </nav>

      <div className={styles.status}>
        <span className={styles.statusDot} aria-hidden="true" />
        <span>CET {now ? formatZoned(now, 1) : '—'}</span>
        <span>EST {now ? formatZoned(now, -5) : '—'}</span>
        <span>KST {now ? formatZoned(now, 9) : '—'}</span>
        <div className={styles.themeSwitcher} role="radiogroup" aria-label="Accent theme">
          {THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={theme === t.key}
              aria-label={t.label}
              onClick={() => onThemeChange(t.key)}
              className={`${styles.themeDot} ${styles[`themeDot_${t.key}`]} ${theme === t.key ? styles.themeDotActive : ''}`}
            />
          ))}
        </div>
      </div>
    </header>
  )
}
