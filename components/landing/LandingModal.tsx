'use client'

import { useEffect } from 'react'
import styles from '@/app/page.module.css'
import type { Video } from './videos'

interface LandingModalProps {
  videos: readonly Video[]
  currentIndex: number | null
  onClose: () => void
  onNavigate: (next: number) => void
}

const pad = (n: number) => String(n).padStart(2, '0')

export default function LandingModal({ videos, currentIndex, onClose, onNavigate }: LandingModalProps) {
  const open = currentIndex !== null
  const v = open ? videos[currentIndex!] : null

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = ''
      return
    }
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNavigate(((currentIndex ?? 0) + 1) % videos.length)
      if (e.key === 'ArrowLeft') onNavigate(((currentIndex ?? 0) - 1 + videos.length) % videos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, currentIndex, videos.length, onClose, onNavigate])

  if (!open || !v) return null

  return (
    <div
      className={`${styles.modal} ${styles.modalOpen}`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.modalDialog}>
        <div className={styles.modalBar}>
          <span>NOW PLAYING / {pad(currentIndex! + 1)}</span>
          <span className={styles.modalBarCenter}>{v.title}</span>
          <button className={styles.modalClose} aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={styles.modalPlayer}>
          <iframe
            src={`https://www.youtube.com/embed/${v.id}?autoplay=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className={styles.modalFoot}>
          <span>
            {v.code} · {v.tag} · {v.year} · {v.dur}
          </span>
          <div className={styles.modalNavBtns}>
            <button onClick={() => onNavigate((currentIndex! - 1 + videos.length) % videos.length)}>← Prev</button>
            <button onClick={() => onNavigate((currentIndex! + 1) % videos.length)}>Next →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
