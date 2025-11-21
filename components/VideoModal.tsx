'use client'

import { useEffect } from 'react'
import styles from './VideoModal.module.css'

interface Video {
  id: string
  description: string
}

interface VideoModalProps {
  isOpen: boolean
  videos: Video[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

export default function VideoModal({ isOpen, videos, currentIndex, onClose, onNavigate }: VideoModalProps) {
  const currentVideo = videos[currentIndex]

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : videos.length - 1
        onNavigate(prevIndex)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const nextIndex = currentIndex < videos.length - 1 ? currentIndex + 1 : 0
        onNavigate(nextIndex)
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose, currentIndex, videos.length, onNavigate])

  if (!isOpen || !currentVideo) return null

  const handlePrevious = () => {
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : videos.length - 1
    onNavigate(prevIndex)
  }

  const handleNext = () => {
    const nextIndex = currentIndex < videos.length - 1 ? currentIndex + 1 : 0
    onNavigate(nextIndex)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <button 
        className={`${styles.navArrow} ${styles.navArrowLeft}`}
        onClick={(e) => {
          e.stopPropagation()
          handlePrevious()
        }}
        aria-label="Previous video"
      >
        ‹
      </button>
      
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          &times;
        </button>
        
        <div className={styles.videoWrapper}>
          <iframe
            key={currentVideo.id}
            src={`https://www.youtube.com/embed/${currentVideo.id}?autoplay=1`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        
        {currentVideo.description && (
          <div className={styles.description}>
            <h3>{currentVideo.description}</h3>
          </div>
        )}
        <p className={styles.hint}>
          Press ESC to close • Use ← → arrows to navigate
        </p>
      </div>
      
      <button 
        className={`${styles.navArrow} ${styles.navArrowRight}`}
        onClick={(e) => {
          e.stopPropagation()
          handleNext()
        }}
        aria-label="Next video"
      >
        ›
      </button>
    </div>
  )
}

