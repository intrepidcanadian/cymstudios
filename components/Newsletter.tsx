'use client'

import { useState, FormEvent } from 'react'
import styles from './Newsletter.module.css'

export default function Newsletter() {
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, consent }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: data.message || 'Successfully subscribed!' })
        setEmail('')
        setConsent(false)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to subscribe' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`${styles.newsletter} ${isExpanded ? styles.expanded : styles.minimized}`}>
      {!isExpanded ? (
        // Minimized view
        <button 
          className={styles.minimizedButton}
          onClick={() => setIsExpanded(true)}
        >
          <span className={styles.icon}>📧</span>
          <span className={styles.minimizedText}>Newsletter</span>
        </button>
      ) : (
        // Expanded view
        <div className={styles.content}>
          <button 
            className={styles.closeBtn}
            onClick={() => setIsExpanded(false)}
            aria-label="Minimize newsletter"
          >
            ✕
          </button>
          
          <h2>Stay Updated</h2>
          <p>Subscribe to our newsletter for the latest epic videos and AI production updates</p>
          
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={styles.emailInput}
                disabled={isLoading}
              />
              <button 
                type="submit" 
                className={styles.submitBtn}
                disabled={isLoading || !consent}
              >
                {isLoading ? 'Subscribing...' : 'Subscribe'}
              </button>
            </div>
            
            <div className={styles.consentGroup}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={isLoading}
                />
                <span className={styles.checkboxLabel}>
                  I consent to receive newsletters and marketing communications from CYM Studio. 
                  I understand I can unsubscribe at any time.
                </span>
              </label>
            </div>

            {message && (
              <div className={`${styles.message} ${styles[message.type]}`}>
                {message.text}
              </div>
            )}
          </form>

          <p className={styles.privacy}>
            We respect your privacy. Your email will never be shared with third parties.
          </p>
        </div>
      )}
    </div>
  )
}

