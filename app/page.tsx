'use client'

import { useState, useEffect } from 'react'
import StudioCanvas from '@/components/StudioCanvas'
import Sidebar from '@/components/Sidebar'
import VideoModal from '@/components/VideoModal'
import WorldClocks from '@/components/WorldClocks'
import styles from './page.module.css'

const VIDEOS = [
  {
    id: 'NTiKNaKZAF8',
    description: '2025 2v2 Random Starcraft Brood War Tournament ($500 Prize Pool)'
  },
  {
    id: 'Q82c39DQoJc',
    description: 'Season 3 Bombastic Starleague 2v2 Tournament ($1,000 Prize Pool)'
  },
  {
    id: '9RJzUTqOm5M',
    description: 'Bombastic Starleague Qualifications Season 3'
  },
  {
    id: 's-l4dQm7-uc',
    description: '2023 2v2 Shield Battery Tournament ($500 Prize Pool)'
  }
]

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [videoModalOpen, setVideoModalOpen] = useState(false)
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleVideoTrigger = (videoId: string, description: string) => {
    // Find the index of the triggered video
    const index = VIDEOS.findIndex(v => v.id === videoId)
    if (index !== -1) {
      setCurrentVideoIndex(index)
      setVideoModalOpen(true)
    }
  }

  const handleNavigate = (index: number) => {
    setCurrentVideoIndex(index)
  }

  return (
    <main className={styles.container}>
      <StudioCanvas onVideoTrigger={handleVideoTrigger} />
      
      <WorldClocks />
      
      <div className={styles.instructions}>
        {isMobile ? (
          <p><strong>Drag</strong>: Move • <strong>Tap</strong>: Shoot Lasers • Tap TV to watch</p>
        ) : (
          <p><strong>Arrow Keys</strong>: Move • <strong>Click</strong>: Shoot Lasers • Walk near TV to watch</p>
        )}
      </div>
      
      <button 
        className={styles.sidebarToggle}
        onClick={() => setSidebarOpen(true)}
      >
        <span>☰</span> Menu
      </button>
      
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
      />
      
      <VideoModal 
        isOpen={videoModalOpen}
        videos={VIDEOS}
        currentIndex={currentVideoIndex}
        onClose={() => setVideoModalOpen(false)}
        onNavigate={handleNavigate}
      />
      
      <div 
        className={`${styles.overlay} ${sidebarOpen ? styles.active : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
    </main>
  )
}

