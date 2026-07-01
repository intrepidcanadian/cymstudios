import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import styles from '../news.module.css'

export const metadata: Metadata = {
  title: 'Why I Stopped Paying Tournament Winners Through PayPal — CYM Studio',
  description:
    'A gaming organizer’s accidental path to x402, stablecoins, and Conflux Network — with real PayPal receipts showing 10–26% lost to fees and FX.',
}

export default function ArticlePage() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          CYM <em>News</em>
        </div>
        <nav className={styles.headerCrumb}>
          <Link href="/news">All news</Link>
          <Link href="/catalogue">Rewards</Link>
          <Link href="/">Studio</Link>
        </nav>
      </header>

      <article className={styles.article}>
        <div className={styles.articleHead}>
          <div className={styles.articleKicker}>Field notes · Conflux Global Hackfest 2026</div>
          <h1 className={styles.articleTitle}>Why I Stopped Paying Tournament Winners Through PayPal</h1>
          <p className={styles.articleDek}>
            A gaming organizer’s accidental path to x402, stablecoins, and Conflux Network.
          </p>
          <div className={styles.articleMeta}>
            <span>April 2026</span>
            <span>·</span>
            <span>6 min read</span>
          </div>
        </div>

        <div className={styles.prose}>
          <p>
            For the last few years I’ve run gaming tournaments. The fun part is the competition — the
            bracket, the upsets, the final where nobody in the room is breathing. The part nobody warns
            you about comes <em>after</em> the trophy: a player has won, everyone watched them win, and
            now I have to actually get the money into their hands.
          </p>
          <p>
            It sounds like the easy part. Player wins, you send the prize, done. In practice, paying
            winners across borders became the most expensive and frustrating thing about running events —
            and, cruelly, the harder a player’s country was to reach, the more it cost to pay them. This
            is the story of how a hackathon in Hong Kong turned that headache into a product:{' '}
            <a href="https://cymstudio.app">cymstudio.app</a>.
          </p>

          <h2>I went back through a year of my own payouts</h2>
          <p>
            My players aren’t in one place — and that’s not a coincidence. I come out of the StarCraft:
            Brood War world, where the strongest non-Korean players have always clustered in Eastern
            Europe, Latin America, and a few other hotspots. There’s a cruel irony in that:{' '}
            <strong>the best non-Korean players often live exactly where PayPal works worst.</strong>
          </p>
          <p>
            So one evening I did something I’d been avoiding: I pulled up a year of real PayPal transfers
            to winners, all funded from a Canadian card, and added up what never reached them. The
            pattern was brutally consistent — and worse than I’d let myself believe.
          </p>

          <figure className={styles.figure}>
            <Image
              src="/news/paypal-receipts-evidence.png"
              alt="Four real PayPal payouts to tournament winners, losing 10–26% each to fees and FX, versus ≈0% on Conflux x402."
              width={1200}
              height={790}
              className={styles.figureImg}
            />
            <figcaption>Four real transfers I sent to tournament winners in 2025 — 10–26% lost each.</figcaption>
          </figure>

          <p>A few of the real ones (2025):</p>
          <ul>
            <li>
              <strong>$50 to a winner in Bulgaria</strong> — $3.84 fee plus an FX markup: about{' '}
              <strong>10%</strong> all-in. A bigger prize dilutes the fee, but never escapes it.
            </li>
            <li>
              <strong>$25 to a player in Chile</strong> — $4.49 in fees and a below-market conversion:
              roughly <strong>18%</strong> to deliver $25.
            </li>
            <li>
              <strong>$25 to a winner in Poland</strong> — $3.07 fee plus the same FX haircut: about{' '}
              <strong>15%</strong>.
            </li>
            <li>
              <strong>$10 to a winner</strong> — the fee alone was $2.59. That’s <strong>26%</strong> of
              the prize, because a near-fixed fee devours a small payout.
            </li>
          </ul>
          <p>
            The currency conversion is the sneaky part. On one transfer PayPal valued my Canadian dollar
            at <strong>0.6839 USD</strong> when the real rate was around <strong>0.72</strong> — a ~4%
            markup buried <em>inside</em> the exchange rate, where it never appears as a “fee.” Most
            organizers never notice they’re paying it.
          </p>
          <p>
            And it isn’t only sending. <strong>PayPal taxes money coming in, too</strong>: a{' '}
            <strong>$5 tip</strong> a viewer sent me arrived as <strong>$4.51</strong> — PayPal kept{' '}
            <strong>$0.49</strong>, about <strong>10%</strong>, just to receive it.
          </p>

          <figure className={styles.figure}>
            <Image
              src="/news/paypal-receiving-evidence.png"
              alt="A real $5 tip arriving as $4.51 on PayPal (≈10% lost) versus the same tip received on Conflux x402 at ≈0%."
              width={1200}
              height={700}
              className={styles.figureImg}
            />
            <figcaption>Even a $5 tip gets taxed on the way in — ≈10% on PayPal versus ≈0% on Conflux x402.</figcaption>
          </figure>

          <div className={styles.callout}>
            <div className={styles.calloutTitle}>Why the numbers come out this way — PayPal’s published rates</div>
            <ul>
              <li>
                <strong>International personal transfer:</strong> ~5% (with a minimum fee),{' '}
                <strong>plus a 3–4% currency-conversion spread</strong> baked into the exchange rate —
                where you never see it.
              </li>
              <li>
                <strong>Receiving a commercial payment:</strong> 2.9% + $0.30 domestic,{' '}
                <strong>4.4% + $0.30 international</strong> — money coming <em>in</em> is taxed too.
              </li>
              <li>
                <strong>Funding from a credit card</strong> adds another <strong>3.49% + $0.49</strong>.
              </li>
              <li>
                Every fee carries a minimum and a fixed component, so{' '}
                <strong>the smaller the prize, the bigger the bite</strong> — which is why a $10 payout
                loses 26% but a $50 one “only” loses ~10%.
              </li>
            </ul>
            <p className={styles.calloutSource}>
              Sources: PayPal’s official{' '}
              <a href="https://www.paypal.com/us/digital-wallet/paypal-consumer-fees">Consumer</a> and{' '}
              <a href="https://www.paypal.com/us/business/paypal-business-fees">Merchant</a> fee schedules.
            </p>
          </div>

          <p>
            Then there’s the time: international withdrawals to a local bank commonly take{' '}
            <strong>1–5 business days</strong>, and payouts to new recipients can get{' '}
            <strong>held for review</strong>. “You won — now wait a week, and you’ll get about 84% of
            it” is not the experience I wanted to run.
          </p>

          <h2>The country that breaks the model entirely: Turkey</h2>
          <p>
            The worst case isn’t a high fee — it’s <em>no option at all.</em>{' '}
            <strong>PayPal shut down in Turkey on June 6, 2016</strong> and has never returned. Turkish
            residents can’t create an account, can’t send, and can’t receive. As of 2026 it’s still gone.
          </p>
          <p>
            So when a talented Turkish player wins, the normal rails simply don’t exist — no fee would
            even let me pay them. There’s no polite version of that message:{' '}
            <em>you won, fair and square, and I have no way to send you what you earned.</em> And Turkey,
            like Poland, Bulgaria, and Chile, is a non-Korean StarCraft heartland. The places with the
            players are exactly the places legacy payments serve worst.
          </p>
          <p>
            I kept thinking: there has to be a way to pay a winner <em>anywhere</em> — Istanbul included —
            instantly, for near-zero cost.
          </p>

          <h2>February in Hong Kong: x402 was everywhere</h2>
          <p>
            In <strong>February 2026</strong> I went to the{' '}
            <strong>GWDC 2026 (Global Web3 Dev Con) Hackathon</strong>, hosted by <strong>Conflux</strong>{' '}
            alongside Web3Labs, Tron, and Pharos — <strong>February 7–9, 2026 at Cyberport, Hong Kong</strong>.
          </p>
          <p>
            I showed up curious, not building. But one acronym dominated every hallway conversation:{' '}
            <strong>x402</strong>. People were genuinely excited about reviving the long-dormant HTTP{' '}
            <code>402 Payment Required</code> status code as a <em>native</em> way to pay over the web
            with stablecoins — no checkout redirect, no card form, no “create an account first.” A request
            gets a <code>402</code>, the client pays in stablecoin, the request goes through.
          </p>
          <p>
            Standing there, my payout problem took a new shape. What if paying a winner was just… a
            payment that settled in seconds, in a stablecoin, to anyone with a wallet — no PayPal, no
            bank, no 18% haircut, and no “sorry, not available in your country”?
          </p>

          <h2>From spectator to builder — on Conflux</h2>
          <p>
            A month later I committed.{' '}
            <strong>
              Conflux Network hosted Global Hackfest 2026, a four-week virtual hackathon that ran from
              March 23 through April 20, 2026
            </strong>{' '}
            — enough runway to ship something real.
          </p>
          <p>
            To force myself up the curve, I took on the <strong>x402 boilerplate bounty</strong> in the
            Conflux bounties repo —{' '}
            <a href="https://github.com/conflux-fans/conflux-bounties/tree/main/bounties/11-espace-x402-boilerplate">
              11-espace-x402-boilerplate
            </a>
            . Building it end-to-end on <strong>Conflux eSpace</strong> meant learning how the{' '}
            <code>402</code> challenge is structured, how a payer signs an authorization, and how
            settlement actually lands on-chain.
          </p>

          <h2>Why Conflux Network is the right fit</h2>
          <p>The deeper I got, the more <strong>Conflux Network</strong> looked purpose-built for this exact problem:</p>
          <ul>
            <li>
              <strong>Fees that make micro-payouts viable.</strong> Prize distribution dies by a thousand
              cuts when each transfer costs 10–26%. On Conflux eSpace a stablecoin transfer settles for a
              fraction of a cent — and for prize payouts the network fee is <strong>sponsored</strong> by a
              facilitator, so the winner keeps <strong>100%</strong> of what they won.
            </li>
            <li>
              <strong>EVM-compatible eSpace.</strong> It speaks standard Ethereum tooling, so x402,
              EIP-712 signatures, and EIP-3009 stablecoin authorizations all work with libraries developers
              already know. The x402 boilerplate bounty existing <em>at all</em> signals that Conflux is
              deliberately investing in this rail.
            </li>
            <li>
              <strong>Fast, final settlement.</strong> Seconds, not “1–5 business days.” A winner sees
              their prize while the match is still fresh.
            </li>
            <li>
              <strong>Stablecoins as the unit of prize money.</strong> Paying in <strong>USDT0</strong>{' '}
              keeps value denominated in dollars, not a volatile token — winners get exactly what the
              leaderboard promised.
            </li>
            <li>
              <strong>Borderless by default.</strong> A wallet works the same in Istanbul, Sofia, Warsaw,
              Santiago, or Los Angeles. The Turkey problem — the one PayPal can’t solve at any price —
              simply isn’t one.
            </li>
          </ul>

          <h2>What I built</h2>
          <div className={styles.videoWrap}>
            <iframe
              className={styles.video}
              src="https://www.youtube.com/embed/2GBAga5YZ_k"
              title="cymstudio.app — redemption flow walkthrough"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <p>
            Winners don’t always want raw crypto — sometimes they want to <em>spend</em> it. So the product
            I built lets a winner holding <strong>USDT0 on Conflux eSpace and zero gas</strong> redeem a
            real gift card — Amazon, Apple, and more — paid entirely in stablecoin, with a facilitator{' '}
            <strong>sponsoring the network fee</strong>. They sign one off-chain authorization, and the
            voucher lands in their inbox in about a minute. No native gas token, no bridge gymnastics, no
            bank, no PayPal.
          </p>
          <p>
            It lives at <a href="https://cymstudio.app">cymstudio.app</a>.
          </p>
          <p>
            So the moment after the trophy looks different now. The match ends, the winner is still
            buzzing — and instead of “send me your bank details and give me a week,” I can settle the prize
            in seconds, for near-zero cost, to anyone with a wallet, Istanbul included. They get 100% of
            what they earned, and they can turn it into something they’ll actually use before the
            adrenaline wears off.
          </p>

          <h2>What’s next</h2>
          <p>
            What started as me grumbling about PayPal fees at a Hong Kong conference became a working
            product on <strong>Conflux Network</strong>, born out of two hackathons and a bounty. The
            thesis held:{' '}
            <strong>
              for anyone distributing money to a global audience — tournament prizes, bounties, payouts of
              any kind — stablecoins plus x402 on a low-fee chain are dramatically cheaper, faster, and more
              inclusive than the legacy rails.
            </strong>
          </p>
          <p>
            If you run events and you’ve ever winced at a payout fee, apologized for a delay, or — worst of
            all — had no way to pay someone in the wrong country, this is the rabbit hole I’d point you down.
          </p>

          <figure className={styles.figure}>
            <Image
              src="/news/paypal-vs-conflux.png"
              alt="A real Poland payout on PayPal losing ≈15% to fees and hidden FX, versus the same payout on Conflux x402 at ≈0%."
              width={1200}
              height={700}
              className={styles.figureImg}
            />
            <figcaption>The same single payout, side by side: ≈15% lost on PayPal versus ≈0% on Conflux x402.</figcaption>
          </figure>

          <p className={styles.cta}>
            <a href="https://cymstudio.app" className={styles.ctaLink}>
              Take a look → cymstudio.app
            </a>
          </p>

          <p className={styles.byline}>Built during Conflux Global Hackfest 2026.</p>

          <p className={styles.sources}>
            <strong>Sources:</strong>{' '}
            <a href="https://www.paypal.com/us/digital-wallet/paypal-consumer-fees">PayPal Consumer fees</a> ·{' '}
            <a href="https://www.paypal.com/us/business/paypal-business-fees">PayPal Merchant fees</a> ·{' '}
            <a href="https://www.paypal.com/us/cshelp/article/what-are-the-cross-border-fees-when-selling-internationally-help550">
              PayPal cross-border fees
            </a>{' '}
            ·{' '}
            <a href="https://www.paypal.com/us/money-hub/article/currency-conversion-fees">
              PayPal currency conversion fees
            </a>{' '}
            ·{' '}
            <a href="https://www.fintechfutures.com/paytech/licence-rejection-sees-paypal-quit-turkey">
              PayPal exit from Turkey (FinTech Futures)
            </a>{' '}
            ·{' '}
            <a href="https://www.bitdegree.org/money-transfer/tutorials/is-paypal-available-in-turkey">
              Is PayPal available in Turkey? (BitDegree)
            </a>
          </p>
        </div>
      </article>
    </div>
  )
}
