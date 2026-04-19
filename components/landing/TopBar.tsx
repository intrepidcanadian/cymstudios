'use client'

import Link from 'next/link'
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

export default function TopBar({ theme, onThemeChange }: TopBarProps) {
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
        <Link href="/agents">For Agents</Link>
        <a href="#contact">Contact</a>
      </nav>

      <div className={styles.status}>
        <span className={styles.statusDot} aria-hidden="true" />
        <span>Online</span>
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
