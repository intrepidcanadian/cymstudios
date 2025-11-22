'use client'

import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <div className={styles.companyName}>CYM Studio</div>
        <div className={styles.scrollingText}>
          <div className={styles.scrollingTextInner}>
            <span>Interested in creating product videos for your small business or marketing videos for social media? Reach out to tony.lau@cymadvisory.com to discuss more. • </span>
            <span>Interested in creating product videos for your small business or marketing videos for social media? Reach out to tony.lau@cymadvisory.com to discuss more. • </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

