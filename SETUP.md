# CYM Studio — Gift Card Catalogue Setup

This guide covers how to set up the gift card catalogue feature, which lets users browse 600+ brands and purchase gift cards with USDC on Ethereum Mainnet via the x402 payment protocol.

---

## 1. Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

### Required Variables

| Variable | Where to get it | What it does |
|----------|----------------|--------------|
| `PRIVY_APP_ID` | [privy.io/dashboard](https://privy.io/dashboard) | Enables wallet creation and login (email/Google). Add your domains to Allowed Origins in the Privy dashboard. |
| `NEXT_PUBLIC_SUPABASE_URL` | [supabase.com](https://supabase.com) → Project Settings → API | Your Supabase project URL (e.g. `https://abc123.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` key | Public client key for Supabase (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key | Server-only admin key. **Never expose to the client.** Used by API routes to bypass RLS. |
| `FACILITATOR_PRIVATE_KEY` | Your facilitator Ethereum wallet | Private key of the wallet that executes `transferWithAuthorization` on-chain. This wallet needs ETH for gas on Ethereum Mainnet. |
| `EXTERNAL_API_KEY` | xRemit partner dashboard | API key for the xRemit gift card provider |
| `EXTERNAL_CLIENT_SECRET` | xRemit partner dashboard | Client secret for HMAC-SHA256 request signing |
| `XREMIT_ENV` | Set to `production` or `sandbox` | Controls which xRemit API is used (`rewardsapi.xremit.io` vs `rewardsapi-sandbox.xremit.io`) |
| `API_LAYER_KEY` | [apilayer.com](https://apilayer.com) | API key for real-time currency exchange rates (USD ↔ CAD/HKD/GBP) |
| `RESEND_API_KEY` | [resend.com](https://resend.com) | Sends voucher delivery emails to customers |
| `RESEND_FROM_EMAIL` | Your verified Resend domain | Sender address for emails (e.g. `noreply@cymstudio.com`) |

### Optional Variables

| Variable | Default | What it does |
|----------|---------|--------------|
| `ETHEREUM_MAINNET_RPC_URL` | `https://eth.llamarpc.com` | Ethereum Mainnet RPC endpoint. Use your own Alchemy/Infura URL for better reliability. |
| `NEXT_PUBLIC_API_URL` | `https://cymstudio.com` | Your production URL. Used for xRemit webhook callback URLs. |
| `XREMIT_WEBHOOK_API_KEY` | *(none)* | If set, the webhook endpoint validates the `authorization` header from xRemit. |
| `CRON_SECRET` | *(none)* | Bearer token for the `/api/sync-brands` cron endpoint. If not set, use `?direct=true` for manual syncs. |
| `FACILITATOR_MAINNET_PRIVATE_KEY` | Falls back to `FACILITATOR_PRIVATE_KEY` | Separate key for mainnet if you use a different wallet than testnet. |

---

## 2. Database Setup (Supabase)

### Create the tables

Run the migration SQL in the Supabase SQL Editor:

1. Go to your Supabase project → **SQL Editor**
2. Open `supabase/migrations/001_create_tables.sql`
3. Copy the entire file contents and run it

This creates three tables:

| Table | Purpose |
|-------|---------|
| `brands` | Gift card catalogue (600+ products from xRemit) |
| `orders` | Purchase lifecycle tracking (pending → processing → completed) |
| `exchange_rates` | Cached FX rates to reduce API calls |

It also sets up:
- Row Level Security (RLS) policies
- Indexes for common queries
- An `updated_at` trigger on the orders table

### Seed the brands table

After the tables are created, seed the catalogue by hitting the sync endpoint:

```bash
# Sync all countries (takes 2-5 minutes)
curl "http://localhost:3000/api/sync-brands?direct=true"

# Sync a single country (faster, for testing)
curl "http://localhost:3000/api/sync-brands?direct=true&country=USA"

# Clear and resync everything
curl "http://localhost:3000/api/sync-brands?direct=true&clear=true"

# Check config without syncing
curl "http://localhost:3000/api/sync-brands?diagnostic=true"
```

The sync fetches all brands from xRemit, transforms camelCase → snake_case, deduplicates by `product_id`, and upserts into the `brands` table.

---

## 3. Privy Setup

1. Create an account at [privy.io](https://privy.io)
2. Create a new app
3. Go to **Settings → Allowed Origins** and add:
   - `http://localhost:3000` (development)
   - `http://127.0.0.1:3000` (development)
   - Your production domain (e.g. `https://cymstudio.com`)
4. Copy the **App ID** to `PRIVY_APP_ID` in `.env.local`

Privy provides embedded wallets — users sign in with email or Google and get an Ethereum wallet automatically. No MetaMask or browser extension required.

---

## 4. Facilitator Wallet

The facilitator wallet is the on-chain intermediary that executes USDC `transferWithAuthorization` (EIP-3009). It needs:

1. **An Ethereum address** — this is set as the payment recipient in x402 flows
2. **ETH for gas** — the wallet calls `transferWithAuthorization()` on the USDC contract, which costs gas
3. **The private key** — stored in `FACILITATOR_PRIVATE_KEY`

The default facilitator address is `0xc10561c1c0d718b3d362df9d510a1b4e4331a4ee`. If you use a different wallet, make sure the private key matches.

**Important:** The facilitator does NOT hold user funds long-term. It receives USDC from the buyer via `transferWithAuthorization`, then the platform uses those funds to purchase the gift card from xRemit.

---

## 5. Running Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Visit:
#   http://localhost:3000           → Homepage (3D spaceship + sidebar)
#   http://localhost:3000/catalogue → Gift card catalogue
```

---

## 6. Payment Flow (How x402 Works)

```
User picks gift card → enters amount + email
  → Frontend calculates USDC price (price × FX rate × 1.015 buffer)
  → POST /api/purchase (no payment header)
  → Server returns 402 Payment Required + USDC amount
  → Privy wallet signs EIP-712 TransferWithAuthorization
  → POST /api/purchase (with X-PAYMENT header)
  → Server verifies signature + executes on-chain transfer
  → Server submits order to xRemit
  → xRemit processes order (1-5 min)
  → POST /api/webhook/xremit (xRemit sends voucher)
  → Order updated to "completed", email sent to user
```

---

## 7. API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/brands` | GET | None | Browse gift card catalogue. Filters: `?country=USA&currency=USD&brand=Amazon` |
| `/api/purchase` | POST | x402 | Purchase a gift card. Returns 402 first, then processes after payment. |
| `/api/orders/[orderId]` | GET | User email | Check order status and get voucher details. `?userEmail=user@example.com` |
| `/api/exchange-rate` | GET | None | Get FX rate. `?from=CAD&to=USD` |
| `/api/webhook/xremit` | POST | Bearer token | Receives voucher from xRemit (automated). |
| `/api/sync-brands` | GET | `?direct=true` | Seed/resync the brands table from xRemit. |
