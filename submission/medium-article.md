# Why I Stopped Paying Tournament Winners Through PayPal

### A gaming organizer's accidental path to x402, stablecoins, and Conflux Network

> **[PHOTO — HERO]** A wide esports/tournament shot (players at screens, or a prize-pool graphic) with the title overlaid.

For the last few years I've run gaming tournaments. The fun part is the competition — the bracket, the upsets, the final where nobody in the room is breathing. The part nobody warns you about comes *after* the trophy: a player has won, everyone watched them win, and now I have to actually get the money into their hands.

It sounds like the easy part. Player wins, you send the prize, done. In practice, paying winners across borders became the most expensive and frustrating thing about running events — and, cruelly, the harder a player's country was to reach, the more it cost to pay them. This is the story of how a hackathon in Hong Kong turned that headache into a product: **[cymstudio.app](https://cymstudio.app)**.

## I went back through a year of my own payouts

My players aren't in one place — and that's not a coincidence. I come out of the StarCraft: Brood War world, where the strongest non-Korean players have always clustered in Eastern Europe, Latin America, and a few other hotspots. There's a cruel irony in that: **the best non-Korean players often live exactly where PayPal works worst.**

So one evening I did something I'd been avoiding: I pulled up a year of real PayPal transfers to winners, all funded from a Canadian card, and added up what never reached them. The pattern was brutally consistent — and worse than I'd let myself believe.

> **[IMAGE — EVIDENCE GRAPHIC]** Insert `paypal-receipts-evidence.png` — four real payouts, 10–26% lost each, vs ≈0% on Conflux x402. This is the centerpiece.

A few of the real ones (2025):

- **$50 to a winner in Bulgaria** — $3.84 fee plus an FX markup: about **10%** all-in. A bigger prize dilutes the fee, but never escapes it.
- **$25 to a player in Chile** — $4.49 in fees and a below-market conversion: roughly **18%** to deliver $25.
- **$25 to a winner in Poland** — $3.07 fee plus the same FX haircut: about **15%**.
- **$10 to a winner** — the fee alone was $2.59. That's **26%** of the prize, because a near-fixed fee devours a small payout.

The currency conversion is the sneaky part. On one transfer PayPal valued my Canadian dollar at **0.6839 USD** when the real rate was around **0.72** — a ~4% markup buried *inside* the exchange rate, where it never appears as a "fee." Most organizers never notice they're paying it.

And it isn't only sending. **PayPal taxes money coming in, too**: a **$5 tip** a viewer sent me arrived as **$4.51** — PayPal kept **$0.49**, about **10%**, just to receive it.

> **[IMAGE — RECEIVING GRAPHIC]** Insert `paypal-receiving-evidence.png` — the cost of *receiving* a tip, donation, or sponsor payment. One real receipt ($5 → $4.51); other rows use PayPal's published receiving rates. Small incoming amounts get hit hardest.

> **Why the numbers come out this way — PayPal's published rates**
> - **International personal transfer:** ~5% (with a minimum fee), **plus a 3–4% currency-conversion spread** baked into the exchange rate — where you never see it.
> - **Receiving a commercial payment:** 2.9% + $0.30 domestic, **4.4% + $0.30 international** — money coming *in* is taxed too.
> - **Funding from a credit card** adds another **3.49% + $0.49**.
> - Every fee carries a minimum and a fixed component, so **the smaller the prize, the bigger the bite** — which is why a $10 payout loses 26% but a $50 one "only" loses ~10%.
>
> *Sources: PayPal's official [Consumer](https://www.paypal.com/us/digital-wallet/paypal-consumer-fees) and [Merchant](https://www.paypal.com/us/business/paypal-business-fees) fee schedules.*

Then there's the time: international withdrawals to a local bank commonly take **1–5 business days**, and payouts to new recipients can get **held for review**. "You won — now wait a week, and you'll get about 84% of it" is not the experience I wanted to run.

## The country that breaks the model entirely: Turkey

The worst case isn't a high fee — it's *no option at all.* **PayPal shut down in Turkey on June 6, 2016** and has never returned. Turkish residents can't create an account, can't send, and can't receive. As of 2026 it's still gone.

So when a talented Turkish player wins, the normal rails simply don't exist — no fee would even let me pay them. There's no polite version of that message: *you won, fair and square, and I have no way to send you what you earned.* And Turkey, like Poland, Bulgaria, and Chile, is a non-Korean StarCraft heartland. The places with the players are exactly the places legacy payments serve worst.

I kept thinking: there has to be a way to pay a winner *anywhere* — Istanbul included — instantly, for near-zero cost.

## February in Hong Kong: x402 was everywhere

> **[PHOTO — GWDC #1, lead image]** A wide shot that proves you were there: the GWDC 2026 stage/banner, the Cyberport entrance, or a crowd-during-a-talk shot.
>
> **[PHOTO — GWDC #2]** Your badge/lanyard, or a session slide with "x402" on screen — the moment the idea landed.
>
> **[PHOTO — GWDC #3, optional]** You with builders / at the Conflux booth. *(Blur or get consent for anyone else in frame.)*

In **February 2026** I went to the **GWDC 2026 (Global Web3 Dev Con) Hackathon**, hosted by **Conflux** alongside Web3Labs, Tron, and Pharos — **February 7–9, 2026 at Cyberport, Hong Kong**.

I showed up curious, not building. But one acronym dominated every hallway conversation: **x402**. People were genuinely excited about reviving the long-dormant HTTP `402 Payment Required` status code as a *native* way to pay over the web with stablecoins — no checkout redirect, no card form, no "create an account first." A request gets a `402`, the client pays in stablecoin, the request goes through.

Standing there, my payout problem took a new shape. What if paying a winner was just… a payment that settled in seconds, in a stablecoin, to anyone with a wallet — no PayPal, no bank, no 18% haircut, and no "sorry, not available in your country"?

## From spectator to builder — on Conflux

> **[PHOTO/SCREENSHOT — BUILD #1]** Your Hackfest workspace mid-build — editor on the x402 settlement code, a terminal showing a `402` response, or the boilerplate repo page.
>
> **[SCREENSHOT — BUILD #2]** Your Global Hackfest 2026 submission page, or the bounty PR on [11-espace-x402-boilerplate](https://github.com/conflux-fans/conflux-bounties/tree/main/bounties/11-espace-x402-boilerplate).
>
> **[PHOTO — BUILD #3, optional]** The first successful gasless settlement tx on a Conflux eSpace explorer — the "it works!" moment.

A month later I committed. **Conflux Network hosted Global Hackfest 2026, a four-week virtual hackathon that ran from March 23 through April 20, 2026** — enough runway to ship something real.

To force myself up the curve, I took on the **x402 boilerplate bounty** in the Conflux bounties repo — [11-espace-x402-boilerplate](https://github.com/conflux-fans/conflux-bounties/tree/main/bounties/11-espace-x402-boilerplate). Building it end-to-end on **Conflux eSpace** meant learning how the `402` challenge is structured, how a payer signs an authorization, and how settlement actually lands on-chain.

## Why Conflux Network is the right fit

The deeper I got, the more **Conflux Network** looked purpose-built for this exact problem:

- **Fees that make micro-payouts viable.** Prize distribution dies by a thousand cuts when each transfer costs 10–26%. On Conflux eSpace a stablecoin transfer settles for a fraction of a cent — and for prize payouts the network fee is **sponsored** by a facilitator, so the winner keeps **100%** of what they won.
- **EVM-compatible eSpace.** It speaks standard Ethereum tooling, so x402, EIP-712 signatures, and EIP-3009 stablecoin authorizations all work with libraries developers already know. The x402 boilerplate bounty existing *at all* signals that Conflux is deliberately investing in this rail.
- **Fast, final settlement.** Seconds, not "1–5 business days." A winner sees their prize while the match is still fresh.
- **Stablecoins as the unit of prize money.** Paying in **USDT0** keeps value denominated in dollars, not a volatile token — winners get exactly what the leaderboard promised.
- **Borderless by default.** A wallet works the same in Istanbul, Sofia, Warsaw, Santiago, or Los Angeles. The Turkey problem — the one PayPal can't solve at any price — simply isn't one.

## What I built

> **[SCREENSHOT — PRODUCT]** The **[cymstudio.app](https://cymstudio.app)** catalogue (gift-card grid) and/or the redemption flow, paired with a shot of the voucher-delivery email.

> **[VIDEO — DEMO]** Walkthrough of the redemption flow end-to-end. *(On Medium, the bare URL on its own line below auto-embeds as a playable video.)*

https://youtu.be/2GBAga5YZ_k

Winners don't always want raw crypto — sometimes they want to *spend* it. So the product I built lets a winner holding **USDT0 on Conflux eSpace and zero gas** redeem a real gift card — Amazon, Apple, and more — paid entirely in stablecoin, with a facilitator **sponsoring the network fee**. They sign one off-chain authorization, and the voucher lands in their inbox in about a minute. No native gas token, no bridge gymnastics, no bank, no PayPal.

It lives at **[cymstudio.app](https://cymstudio.app)**.

So the moment after the trophy looks different now. The match ends, the winner is still buzzing — and instead of "send me your bank details and give me a week," I can settle the prize in seconds, for near-zero cost, to anyone with a wallet, Istanbul included. They get 100% of what they earned, and they can turn it into something they'll actually use before the adrenaline wears off.

## What's next

What started as me grumbling about PayPal fees at a Hong Kong conference became a working product on **Conflux Network**, born out of two hackathons and a bounty. The thesis held: **for anyone distributing money to a global audience — tournament prizes, bounties, payouts of any kind — stablecoins plus x402 on a low-fee chain are dramatically cheaper, faster, and more inclusive than the legacy rails.**

If you run events and you've ever winced at a payout fee, apologized for a delay, or — worst of all — had no way to pay someone in the wrong country, this is the rabbit hole I'd point you down.

Take a look: **[cymstudio.app](https://cymstudio.app)**.

> **[IMAGE — CLOSING]** Optionally place `paypal-vs-conflux.png` here as a clean single-payout "PayPal vs Conflux x402" summary.

*Built during Conflux Global Hackfest 2026.*

**Sources:** [PayPal Consumer fees](https://www.paypal.com/us/digital-wallet/paypal-consumer-fees) · [PayPal Merchant fees](https://www.paypal.com/us/business/paypal-business-fees) · [PayPal cross-border fees](https://www.paypal.com/us/cshelp/article/what-are-the-cross-border-fees-when-selling-internationally-help550) · [PayPal currency conversion fees](https://www.paypal.com/us/money-hub/article/currency-conversion-fees) · [PayPal exit from Turkey (FinTech Futures)](https://www.fintechfutures.com/paytech/licence-rejection-sees-paypal-quit-turkey) · [Is PayPal available in Turkey? (BitDegree)](https://www.bitdegree.org/money-transfer/tutorials/is-paypal-available-in-turkey)
