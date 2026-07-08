'use client'

import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <a href="mailto:tony.lau@cymadvisory.com" className={styles.companyName}>
          CYM Studio
        </a>
        <div className={styles.scrollingText}>
          <div className={styles.scrollingTextInner}>
            <span>Interested in AI videos for your brand, social or event? Reach out to tony.lau@cymadvisory.com to discuss more. • </span>
            <span>Interested in AI videos for your brand, social or event? Reach out to tony.lau@cymadvisory.com to discuss more. • </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

