import type { Metadata } from 'next'
import Link from 'next/link'
import styles from './news.module.css'

export const metadata: Metadata = {
  title: 'News — CYM Studio',
  description: 'Dispatches from CYM Studio — building on Conflux, x402, and stablecoin payouts.',
}

const ARTICLES = [
  {
    slug: 'why-i-stopped-paying-tournament-winners-through-paypal',
    kicker: 'Field notes · Conflux Global Hackfest 2026',
    title: 'Why I Stopped Paying Tournament Winners Through PayPal',
    dek: 'A gaming organizer’s accidental path to x402, stablecoins, and Conflux Network — and the receipts that made the case.',
    date: 'April 2026',
    read: '6 min read',
  },
]

export default function NewsIndexPage() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          CYM <em>News</em>
        </div>
        <nav className={styles.headerCrumb}>
          <Link href="/">Studio</Link>
          <Link href="/catalogue">Rewards</Link>
          <Link href="/chat">Chat</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>Dispatches</div>
        <h1 className={styles.heroTitle}>
          Notes from the <em>studio</em>.
        </h1>
        <p className={styles.heroLede}>
          What we’re building and learning — payouts, x402, stablecoins, and the broadcast
          craft behind it all.
        </p>
      </section>

      <main className={styles.indexMain}>
        <ul className={styles.cardList}>
          {ARTICLES.map((a) => (
            <li key={a.slug}>
              <Link href={`/news/${a.slug}`} className={styles.card}>
                <div className={styles.cardKicker}>{a.kicker}</div>
                <h2 className={styles.cardTitle}>{a.title}</h2>
                <p className={styles.cardDek}>{a.dek}</p>
                <div className={styles.cardMeta}>
                  <span>{a.date}</span>
                  <span>·</span>
                  <span>{a.read}</span>
                  <span className={styles.cardArrow}>Read →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
