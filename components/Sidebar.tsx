'use client'

import { useState } from 'react'
import Image from 'next/image'
import styles from './Sidebar.module.css'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'about' | 'work' | 'contact'

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('about')

  const videos = [
    'NTiKNaKZAF8',
    'Q82c39DQoJc',
    '9RJzUTqOm5M',
    's-l4dQm7-uc'
  ]

  return (
    <div className={`${styles.sidebar} ${isOpen ? styles.active : ''}`}>
      <button className={styles.closeBtn} onClick={onClose}>
        &times;
      </button>
      
      <div className={styles.sidebarContent}>
        <div className={styles.logoHeader}>
          <Image 
            src="/cym.png" 
            alt="CYM Studio"
            width={60}
            height={60}
            style={{ width: 'auto', height: '60px' }}
          />
        </div>
        
        <div className={styles.tabs}>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'about' ? styles.active : ''}`}
            onClick={() => setActiveTab('about')}
          >
            About Us
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'work' ? styles.active : ''}`}
            onClick={() => setActiveTab('work')}
          >
            Previous Work
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'contact' ? styles.active : ''}`}
            onClick={() => setActiveTab('contact')}
          >
            Contact Us
          </button>
        </div>
        
        {activeTab === 'about' && (
          <div className={styles.tabContent}>
            <h2>About Us</h2>
            <p>We use AI to create epic videos for Starcraft tournaments, small businesses, creators, and more.</p>
            <p>At CYM Studio, we blend cutting-edge AI technology with creative storytelling to produce high-quality video content that helps our clients stand out. From tournament broadcasts to promotional content, we make every video epic.</p>
            
            <h3>Our Clients</h3>
            <div className={styles.clientLogo}>
              <Image 
                src="/logo_big.png" 
                alt="Bombastic Starleague"
                width={400}
                height={200}
                style={{ width: '100%', height: 'auto' }}
              />
              <p>Bombastic Starleague</p>
            </div>
          </div>
        )}
        
        {activeTab === 'work' && (
          <div className={styles.tabContent}>
            <h2>Previous Work</h2>
            <p>Check out some of our representative projects:</p>
            
            <div className={styles.videoGrid}>
              {videos.map((videoId) => (
                <div key={videoId} className={styles.videoItem}>
                  <iframe 
                    src={`https://www.youtube.com/embed/${videoId}`}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === 'contact' && (
          <div className={styles.tabContent}>
            <h2>Contact Us</h2>
            <p>Ready to create something amazing together?</p>
            <p>Get in touch with us:</p>
            <div className={styles.contactInfo}>
              <div className={styles.contactItem}>
                <strong>Email:</strong>
                <a href="mailto:tony.lau@cymadvisory.com">tony.lau@cymadvisory.com</a>
              </div>
            </div>
            <p>We look forward to hearing from you and discussing how we can bring your vision to life with AI-powered video production!</p>
          </div>
        )}
      </div>
    </div>
  )
}

