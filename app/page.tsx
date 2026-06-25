'use client'

import { useCallback, useState } from 'react'
import Footer from '@/components/Footer'
import ParticleField from '@/components/landing/ParticleField'
import TopBar from '@/components/landing/TopBar'
import ShowreelGrid from '@/components/landing/ShowreelGrid'
import NeuralNav from '@/components/landing/NeuralNav'
import LandingModal from '@/components/landing/LandingModal'
import { useTheme } from '@/components/landing/useTheme'
import { VIDEOS } from '@/components/landing/videos'
import styles from './page.module.css'

export default function Home() {
  const [theme, setTheme] = useTheme('ember')
  const [modalIndex, setModalIndex] = useState<number | null>(null)

  const openModal = useCallback((i: number) => setModalIndex(i), [])
  const closeModal = useCallback(() => setModalIndex(null), [])

  return (
    <div className={styles.container} data-theme={theme}>
      <ParticleField className={styles.field} />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.frame} aria-hidden="true">
        <div className={styles.edgeT} />
        <div className={styles.edgeB} />
        <div className={styles.edgeL} />
        <div className={styles.edgeR} />
      </div>

      <main className={styles.main}>
        <TopBar theme={theme} onThemeChange={setTheme} />

        {/* Hero */}
        <section className={styles.hero}>
          <div>
            <div className={styles.heroEyebrow}>Showreel — 2023 / 2026</div>
            <h1 className={styles.heroTitle}>
              AI video <em>that moves</em>
              <br />
              <span className={styles.slash}>/</span> broadcast <em>craft</em>
            </h1>
          </div>
          <div>
            <p className={styles.heroLede}>
              We make AI videos — a generative film pipeline built on ComfyUI and the latest models (Seedance, Nano
              Banana, Flux, Kling), tuned with the same craft we use for live tournament broadcast. Six films from the
              archive, with new work shipping now.
            </p>
            <div className={styles.heroMeta}>
              <div>
                <div className={styles.heroMetaK}>Archive</div>
                <div className={styles.heroMetaV}>2023 — Present</div>
              </div>
              <div>
                <div className={styles.heroMetaK}>Focus</div>
                <div className={styles.heroMetaV}>AI video · generative film</div>
              </div>
              <div>
                <div className={styles.heroMetaK}>Status</div>
                <div className={`${styles.heroMetaV} ${styles.heroMetaLive}`}>● Online</div>
              </div>
            </div>
          </div>
        </section>

        {/* Work */}
        <div className={styles.sectionHead} id="work">
          <span className={styles.sectionIdx}>01 / WORK</span>
          <h2 className={styles.sectionTitle}>Selected films</h2>
          <span className={styles.sectionRhs}>06 pieces &nbsp;—&nbsp; scroll ↓</span>
        </div>
        <ShowreelGrid videos={VIDEOS} onOpen={openModal} />

        {/* Capabilities */}
        <div className={styles.sectionHead} id="process">
          <span className={styles.sectionIdx}>02 / CAPABILITIES</span>
          <h2 className={styles.sectionTitle}>What we build</h2>
          <span className={styles.sectionRhs}>pipeline → broadcast</span>
        </div>
        <section className={styles.caps}>
          <div className={styles.cap}>
            <div className={styles.capNum}>A · 01</div>
            <div className={styles.capName}>Generative film</div>
            <div className={styles.capDesc}>
              End-to-end AI video, concept to final cut. A ComfyUI pipeline driving Seedance and Kling for motion —
              built for craft, not gimmick.
            </div>
          </div>
          <div className={styles.cap}>
            <div className={styles.capNum}>A · 02</div>
            <div className={styles.capName}>AI asset generation</div>
            <div className={styles.capDesc}>
              Characters, environments and key art generated with Nano Banana and Flux, art-directed for a consistent
              look across every shot.
            </div>
          </div>
          <div className={styles.cap}>
            <div className={styles.capNum}>A · 03</div>
            <div className={styles.capName}>Broadcast packaging</div>
            <div className={styles.capDesc}>
              Opening sequences, lower thirds, caster graphics, transitions. Design systems for live tournaments and
              events.
            </div>
          </div>
          <div className={styles.cap}>
            <div className={styles.capNum}>A · 04</div>
            <div className={styles.capName}>Event coverage &amp; social</div>
            <div className={styles.capDesc}>
              Multi-day tournament archives — highlights, recap films, sponsor cutdowns, short-form built for the feed.
            </div>
          </div>
        </section>

        {/* About */}
        <div className={styles.sectionHead} id="about">
          <span className={styles.sectionIdx}>03 / STUDIO</span>
          <h2 className={styles.sectionTitle}>About</h2>
          <span className={styles.sectionRhs}>est. 2023 &nbsp;—&nbsp; toronto / remote</span>
        </div>
        <section className={styles.about}>
          <div>
            <div className={styles.aboutLabel}>A note from the desk</div>
          </div>
          <div>
            <p className={styles.aboutBody}>
              We make <em>AI videos</em> — built with a generative pipeline forged in live broadcast. ComfyUI, Seedance,
              Nano Banana, Flux and Kling let us move faster and take bigger swings. The cut, the hook and the grade are
              still hand-made.
            </p>
            <div className={styles.aboutStats}>
              <div>
                <div className={styles.aboutStatN}>06</div>
                <div className={styles.aboutStatL}>films in reel</div>
              </div>
              <div>
                <div className={styles.aboutStatN}>17hr+</div>
                <div className={styles.aboutStatL}>broadcast runtime</div>
              </div>
              <div>
                <div className={styles.aboutStatN}>2023</div>
                <div className={styles.aboutStatL}>founded</div>
              </div>
            </div>
          </div>
        </section>

        {/* Clients */}
        <div className={styles.sectionHead}>
          <span className={styles.sectionIdx}>04 / TRUSTED BY</span>
          <h2 className={styles.sectionTitle}>Clients</h2>
          <span className={styles.sectionRhs}>leagues &nbsp;·&nbsp; teams &nbsp;·&nbsp; sponsors</span>
        </div>
        <section className={styles.clients}>
          <div className={styles.clientsRow}>
            <div className={styles.client}>Bombastic Starleague S22 · 1v1</div>
            <div className={styles.client}>Bombastic Starleague S3 · 2v2</div>
            <div className={styles.client}>2023 2v2 Random Tournament</div>
            <div className={styles.client}>2025 2v2 Random Tournament</div>
          </div>
        </section>

        {/* Contact */}
        <section className={styles.contact} id="contact">
          <div className={styles.contactRow}>
            <h2 className={styles.contactTitle}>
              Got an idea?
              <br />
              Let&apos;s make it <em>move.</em>
            </h2>
            <div>
              <a className={styles.cta} href="mailto:tony.lau@cymadvisory.com?subject=AI%20video%20project">
                <span>Pitch your idea</span>
                <span className={styles.ctaArrow}>→</span>
              </a>
              <div className={styles.contactSub}>
                <span>tony.lau@cymadvisory.com</span>
                <span>Response &lt; 24h</span>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </main>

      <NeuralNav videos={VIDEOS} activeIndex={modalIndex} onSelect={openModal} />
      <LandingModal videos={VIDEOS} currentIndex={modalIndex} onClose={closeModal} onNavigate={openModal} />
    </div>
  )
}
