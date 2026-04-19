# CYM Studio

The [cymstudio.app](https://cymstudio.app) website. An AI video production portfolio paired with a tournament prize redemption catalogue where winners convert prize tokens into digital gift cards across 300+ brands.

![CYM Studio](public/cym.png)

## Two experiences

**1 · Editorial showreel** (`/`)
Dark, editorial landing with a canvas particle field, serif + mono typography, and a six-card asymmetric grid of featured Starcraft tournament broadcasts. Includes a floating "neural" side navigator, live world clocks (CET / EST / KST), and a four-option accent theme switcher (ember, cyan, lime, magenta) that persists in `localStorage`.

**2 · Tournament Prize Redemptions** (`/catalogue`)
A gift card catalogue of 300+ brands. Winners redeem prize tokens for vouchers, paying with USDC on Ethereum or USDT0 on Conflux eSpace via the [x402 payment protocol](https://x402.org). Settlement is gasless via EIP-3009 `transferWithAuthorization` — a shared facilitator wallet pays the native gas so buyers never need ETH or CFX of their own.

The two pages share a common design system (Instrument Serif display, Inter body, JetBrains Mono accents, OKLCH editorial palette). Picking a theme on the landing carries into the catalogue.

## Tech stack

- **Framework** — Next.js 14 App Router, React 18, TypeScript
- **Styling** — Tailwind CSS + CSS Modules, `next/font/google` (Instrument Serif · Inter · JetBrains Mono)
- **Wallets** — Reown AppKit, wagmi, viem, ethers v6
- **Payments** — x402 protocol with gasless EIP-3009 settlement
- **Provider** — xRemit (gift card fulfillment, HMAC-signed webhooks)
- **Backend** — Supabase (Postgres + service role), Next.js API routes
- **Email** — Resend (OTP verification, 30-day re-verification window)
- **Sanitization** — DOMPurify for provider HTML
- **Hosting** — Vultr VPS (Nginx + PM2 + Let's Encrypt)

## Supported payment networks

| Network           | Chain ID | Token | Strategy          | Minimum facilitator gas |
|-------------------|----------|-------|-------------------|-------------------------|
| Ethereum mainnet  | 1        | USDC  | EIP-3009 gasless  | 0.01 ETH                |
| Conflux eSpace    | 1030     | USDT0 | EIP-3009 gasless  | 10 CFX                  |

Facilitator address (shared across chains): `0xc10561C1c0d718B3D362df9D510A1b4e4331a4Ee`
Network + facilitator config lives in [`config/networks.ts`](config/networks.ts). The health endpoint at `/api/facilitator-health` reports live gas balances.

## Merchant protection

- Email OTP verification via Resend (30-day re-verification)
- IP-based sliding-window rate limiting on all API routes ([`middleware.ts`](middleware.ts))
- Per-wallet 10-second cooldown on purchase attempts
- Order bounds: $1 minimum, $5,000 maximum
- 5% overpayment threshold with `pending_review` fallback
- Facilitator gas health check before every settlement
- 90-second settlement timeout with idempotency guard on authorization nonces
- Auto-refund when the xRemit provider fails to fulfill
- HMAC webhook signature verification on provider callbacks
- x402 payment signature verification server-side

## Project layout

```
app/
  page.tsx                  Editorial showreel (landing)
  page.module.css           Landing palette + sections
  catalogue/                Tournament Prize Redemptions
  onramp/                   OSL Pay fiat onramp (optional)
  api/
    brands/                 Gift card catalogue sync
    purchase/               x402 payment + order creation
    webhook/                xRemit fulfillment callback
    orders/                 Order status polling
    email/                  OTP send/verify
    exchange-rate/          FX quotes for non-USD brands
    facilitator-health/     Gas balance + liveness
    mastercards/            Virtual Mastercard catalogue
    sync-brands/            Admin brand refresh
    newsletter/             Newsletter signup
    mcp/                    MCP agent endpoints (ERC-8004)
    cron/                   Scheduled tasks
components/
  landing/                  ParticleField, NeuralNav, ShowreelGrid,
                            LandingModal, TopBar, useTheme, videos
  catalogue/                GiftCardCatalog, PurchaseModal,
                            OrderHistoryList, CatalogueRoot, ...
  onramp/                   OSL Pay integration UI
  _archive/                 Retired components kept for git history
config/
  networks.ts               Chains, tokens, facilitator, gas floors
  oslPay.ts                 OSL Pay onramp config
  wagmi.ts                  Wallet connectors
lib/
  x402-client.ts            Client-side x402 signing helpers
  x402-server.ts            Server-side settlement
  xremit.ts                 xRemit API client
  email.ts                  Resend email templates
  rate-limit.ts             Sliding-window rate limiter
  exchange-rates.ts         FX lookup with cache
deploy/
  setup-vps.sh              Vultr VPS provisioning
  nginx.conf                Nginx reverse-proxy config
  deploy.sh                 Deploy script (pull + build + PM2 restart)
```

## Quickstart

```bash
npm install
cp .env.example .env    # then fill in the values
npm run dev             # http://localhost:3000
```

## Environment variables

At minimum the following must be set. See [`.env.example`](.env.example) for the complete list.

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# x402 facilitator
FACILITATOR_PRIVATE_KEY=                    # optionally FACILITATOR_MAINNET_PRIVATE_KEY
X402_MAINNET_FACILITATOR_ADDRESS=
X402_FACILITATOR_ADDRESS=

# RPC endpoints (server + client)
ETHEREUM_MAINNET_RPC_URL=
NEXT_PUBLIC_ETHEREUM_RPC_URL=
CONFLUX_ESPACE_RPC_URL=
NEXT_PUBLIC_CONFLUX_RPC_URL=

# Provider
EXTERNAL_API_KEY=
EXTERNAL_CLIENT_SECRET=
XREMIT_WEBHOOK_API_KEY=
XREMIT_ENV=production

# Email + FX
RESEND_API_KEY=
RESEND_FROM_EMAIL=
API_LAYER_KEY=

# Reown AppKit
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# App URL (webhook callbacks)
NEXT_PUBLIC_API_URL=https://cymstudio.app
```

## Deployment

The site runs on a **Vultr VPS** behind Nginx with PM2 managing the Node process and Let's Encrypt for TLS. See [`deploy/setup-vps.sh`](deploy/setup-vps.sh) for first-time provisioning and [`deploy/deploy.sh`](deploy/deploy.sh) for incremental deploys.

```bash
# First-time setup (on the VPS)
bash deploy/setup-vps.sh

# Incremental deploy from your local machine
bash deploy/deploy.sh root@<vps-ip>

# Or on the VPS directly
cd /var/www/cymstudio && git pull origin main && npm run build && pm2 restart cymstudio --update-env
```

## Database

Schema is managed against the live Supabase project via the dashboard SQL editor. Migration SQL files are kept locally at `supabase/migrations/` for reference but are gitignored — apply them via Supabase dashboard → SQL Editor → Run.

## About CYM Studio

CYM Studio builds AI ads for e-commerce brands — built on a pipeline forged in live broadcast. Generative tools let us move faster and take bigger swings; the cut, the hook and the grade are still hand-made. Proud clients include **Bombastic Starleague** and various Starcraft: Brood War tournament organizers.

## Featured work

- BSL Season 22 — Player Intros
- BSL Starleague 22 — RO32 Week 2
- 2025 2v2 Random Starcraft Brood War Tournament ($500 prize pool)
- Season 3 Bombastic Starleague 2v2 Tournament ($1,000 prize pool)
- Bombastic Starleague Qualifications Season 3
- 2023 2v2 Shield Battery Tournament ($500 prize pool)

## Contact

Email: [tony.lau@cymadvisory.com](mailto:tony.lau@cymadvisory.com)

## License

Copyright © 2026 CYM Studio. All rights reserved.
