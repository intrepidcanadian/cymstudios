'use client'

import { useState, useEffect } from 'react'
import CSS3DVideoScene from '@/components/CSS3DVideoScene'
import Sidebar from '@/components/Sidebar'
import VideoModal from '@/components/VideoModal'
import WorldClocks from '@/components/WorldClocks'
import Footer from '@/components/Footer'
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
      <CSS3DVideoScene videos={VIDEOS} onVideoClick={handleVideoTrigger} />
      
      <WorldClocks />
      
      <div className={styles.instructions}>
        <p><strong>Drag</strong>: Rotate Camera • <strong>Click Video</strong>: Watch Fullscreen</p>
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
      
      <Footer />
    </main>
  )
}

