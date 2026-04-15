# CYM Studio

The CYM Studio website — an AI video production studio portfolio, plus a Tournament Prize Redemptions catalogue where winners can redeem gift cards using prize tokens awarded from CYM Studio tournaments.

![CYM Studio](public/cym.png)

## Overview

The site has two main experiences:

1. **Portfolio homepage** — a rotating 3D cube of featured Starcraft tournament videos, rendered with Three.js `CSS3DRenderer` and `TrackballControls`. World clocks (CET, EST, KST), a sidebar with studio info and past work, and contact details.
2. **Tournament Prize Redemptions** (`/catalogue`) — a gift card catalogue of 600+ brands that tournament winners can redeem using prize tokens. Checkout uses the [x402 payment protocol](https://x402.org) with gasless EIP-3009 settlement on **Ethereum mainnet (USDC)** and **Conflux eSpace (USDT0)**.

## Tech Stack

- **Framework** — Next.js 14 (App Router), React 18, TypeScript
- **3D / Animation** — Three.js (`CSS3DRenderer`, `TrackballControls`), Framer Motion
- **Styling** — Tailwind CSS, CSS Modules, lucide-react
- **Wallets** — Reown AppKit, wagmi, viem, ethers v6
- **Payments** — x402 protocol, EIP-3009 `transferWithAuthorization` (gasless)
- **Backend** — Supabase (Postgres + service role), Next.js API routes
- **Email** — Resend (OTP verification, 30-day re-verification window)
- **Sanitization** — DOMPurify for provider HTML

## Tournament Prize Redemptions

Winners can redeem gift cards from 600+ brands using prize tokens awarded from CYM Studio tournaments, competitions, and player reward programs. All redemptions must comply with the official tournament rules.

### Supported payment networks

| Network           | Chain ID | Token | Strategy | Facilitator |
|-------------------|----------|-------|----------|-------------|
| Ethereum mainnet  | 1        | USDC  | EIP-3009 gasless | `0xc10561C1c0d718B3D362df9D510A1b4e4331a4Ee` |
| Conflux eSpace    | 1030     | USDT0 | EIP-3009 gasless | `0xc10561C1c0d718B3D362df9D510A1b4e4331a4Ee` |

The facilitator settles authorized transfers on-chain so buyers never need native gas. Network configuration lives in `config/networks.ts`.

### Merchant protection

- Email OTP verification via Resend (30-day re-verification)
- IP-based sliding-window rate limiting on all API routes (`middleware.ts`)
- Per-wallet 10-second cooldown to prevent spam
- Order bounds: $1 minimum, $5,000 maximum
- 5% overpayment threshold with `pending_review` fallback
- Facilitator native-token gas health checks before settlement
- 90-second settlement timeout with idempotency guard on nonces
- Auto-refund path when the xRemit provider fails to fulfill
- HMAC webhook signature verification on provider callbacks

## Project Layout

```
app/
  page.tsx              Portfolio homepage (CSS 3D video scene)
  catalogue/            Tournament Prize Redemptions page
  api/
    brands/             Gift card catalogue sync
    purchase/           x402 payment + order creation
    webhook/            xRemit fulfillment callback
    orders/             Order status polling
    email/              OTP send/verify
    exchange-rate/      FX quotes for non-USD brands
    facilitator-health/ Gas balance + liveness
    mastercards/        Virtual Mastercard catalogue
    sync-brands/        Admin brand refresh
    newsletter/         Newsletter signup
    cron/               Scheduled tasks
components/
  CSS3DVideoScene.tsx   Three.js 3D cube of tournament videos
  Sidebar.tsx           Studio info, work, contact
  catalogue/            Catalogue UI (GiftCardCatalog, checkout, etc.)
config/
  networks.ts           Supported chains + facilitator config
deploy/
  setup-vps.sh          Vultr VPS provisioning
  nginx.conf            Nginx reverse-proxy config
  deploy.sh             Deploy script (PM2 restart)
```

## Installation

```bash
# Install dependencies
npm install

# Run development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

At minimum, the following must be configured (see `.env.example` if present):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# x402 facilitator
X402_MAINNET_FACILITATOR_ADDRESS=0xc10561C1c0d718B3D362df9D510A1b4e4331a4Ee
X402_FACILITATOR_ADDRESS=0xc10561C1c0d718B3D362df9D510A1b4e4331a4Ee
X402_FACILITATOR_PRIVATE_KEY=...

# RPC endpoints
ETHEREUM_MAINNET_RPC_URL=...
CONFLUX_ESPACE_RPC_URL=...
NEXT_PUBLIC_ETHEREUM_RPC_URL=...
NEXT_PUBLIC_CONFLUX_RPC_URL=...

# Provider + email
XREMIT_API_KEY=...
XREMIT_WEBHOOK_SECRET=...
RESEND_API_KEY=...

# Reown AppKit
NEXT_PUBLIC_REOWN_PROJECT_ID=...
```

## Deployment

The site is deployed to a **Vultr VPS** running Nginx + PM2 + Let's Encrypt (not Vercel). See `deploy/setup-vps.sh` for first-time provisioning and `deploy/deploy.sh` for incremental deploys.

```bash
# On the VPS
bash deploy/setup-vps.sh     # first-time setup
bash deploy/deploy.sh        # pull + build + PM2 reload
```

## About CYM Studio

CYM Studio is an AI studio creating commercials and video content for small businesses, content creators, and esports tournaments. Proud clients include **Bombastic Starleague** and various Starcraft: Brood War tournament organizers.

## Featured Work

- BSL Season 22 Intro
- 2025 2v2 Random Starcraft Brood War Tournament ($500 prize pool)
- Season 3 Bombastic Starleague 2v2 Tournament ($1,000 prize pool)
- Bombastic Starleague Qualifications Season 3
- 2023 2v2 Shield Battery Tournament ($500 prize pool)

## Contact

Email: tony.lau@cymadvisory.com

## License

Copyright © 2026 CYM Studio. All rights reserved.
