'use client'

import styles from '@/app/page.module.css'
import type { Video } from './videos'

interface NeuralNavProps {
  videos: readonly Video[]
  activeIndex: number | null
  onSelect: (index: number) => void
}

// Positions along a 64×360 viewBox — matches the original mockup
const POSITIONS: Array<[number, number]> = [
  [32, 30],
  [18, 80],
  [46, 130],
  [20, 180],
  [44, 230],
  [22, 280],
  [34, 330],
]

const LINES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
  [0, 2], [1, 3], [2, 4], [3, 5], [4, 6],
]

export default function NeuralNav({ videos, activeIndex, onSelect }: NeuralNavProps) {
  return (
    <aside className={styles.neural} aria-label="Film navigator">
      <div className={styles.neuralTagTop}>NODES</div>
      <div className={styles.neuralWrap}>
        <svg viewBox="0 0 64 360" preserveAspectRatio="none" className={styles.neuralSvg}>
          {LINES.map(([a, b], i) => {
            const [x1, y1] = POSITIONS[a]
            const [x2, y2] = POSITIONS[b]
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth={0.5}
                opacity={0.35}
              />
            )
          })}
        </svg>
        {POSITIONS.map(([x, y], i) => (
          <button
            key={i}
            type="button"
            className={`${styles.neuralNode} ${activeIndex === i ? styles.neuralNodeActive : ''}`}
            style={{ left: `${(x / 64) * 100}%`, top: `${(y / 360) * 100}%` }}
            onClick={() => onSelect(i)}
            aria-label={`Open ${videos[i]?.short ?? `film ${i + 1}`}`}
          >
            <span className={styles.neuralNodeLabel}>
              {videos[i]?.code} · {videos[i]?.short}
            </span>
          </button>
        ))}
      </div>
      <div className={styles.neuralTagBot}>
        {String((activeIndex ?? 0) + 1).padStart(2, '0')}/{String(videos.length).padStart(2, '0')}
      </div>
    </aside>
  )
}
