'use client'

import styles from '@/app/page.module.css'
import type { Video } from './videos'

type GridVariant = 'editorial' | 'equal' | 'hero'

interface ShowreelGridProps {
  videos: readonly Video[]
  onOpen: (index: number) => void
  variant?: GridVariant
}

const PRESETS: Record<GridVariant, number[]> = {
  editorial: [7, 5, 4, 4, 4, 12],
  equal: [6, 6, 4, 4, 4, 12],
  hero: [12, 4, 4, 4, 6, 6],
}

export default function ShowreelGrid({ videos, onOpen, variant = 'editorial' }: ShowreelGridProps) {
  const cols = PRESETS[variant]

  return (
    <section className={styles.reel} id="reel">
      {videos.map((v, i) => (
        <button
          type="button"
          key={v.id}
          className={styles.card}
          style={{ gridColumn: `span ${cols[i] ?? 6}` }}
          onClick={() => onOpen(i)}
        >
          <div className={styles.thumb}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`}
              onError={(e) => {
                const el = e.currentTarget
                if (!el.dataset.fallback) {
                  el.dataset.fallback = '1'
                  el.src = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
                }
              }}
              alt={v.title}
            />
            <div className={styles.tagRow}>
              <span className={styles.tag}>{v.tag}</span>
              {i === 0 && <span className={`${styles.tag} ${styles.tagHot}`}>Latest</span>}
            </div>
            <div className={styles.play} aria-hidden="true">
              <svg viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 1 L11 6 L2 11 Z" />
              </svg>
            </div>
            <div className={styles.overlayMeta}>
              <span className={styles.runtime}>{v.dur}</span>
            </div>
          </div>
          <div className={styles.titleStrip}>
            <span className={styles.cardId}>{v.code}</span>
            <span className={styles.cardTitle}>{v.title}</span>
            <span className={styles.cardYear}>— {v.year}</span>
          </div>
        </button>
      ))}
    </section>
  )
}
