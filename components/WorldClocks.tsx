'use client'

import { useEffect, useState } from 'react'
import styles from './WorldClocks.module.css'

export default function WorldClocks() {
  const [times, setTimes] = useState({
    cet: '',
    et: '',
    kst: ''
  })

  useEffect(() => {
    const updateClocks = () => {
      const now = new Date()

      // CET - Central European Time (Europe/Paris)
      const cetTime = now.toLocaleTimeString('en-US', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })

      // ET - Eastern Time (America/New_York)
      const etTime = now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })

      // KST - Korean Standard Time (Asia/Seoul)
      const kstTime = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })

      setTimes({
        cet: cetTime,
        et: etTime,
        kst: kstTime
      })
    }

    updateClocks()
    const interval = setInterval(updateClocks, 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className={styles.clocksContainer}>
      <div className={styles.clock}>
        <div className={styles.timezone}>CET</div>
        <div className={styles.time}>{times.cet}</div>
      </div>
      <div className={styles.clock}>
        <div className={styles.timezone}>EST</div>
        <div className={styles.time}>{times.et}</div>
      </div>
      <div className={styles.clock}>
        <div className={styles.timezone}>KST</div>
        <div className={styles.time}>{times.kst}</div>
      </div>
    </div>
  )
}

