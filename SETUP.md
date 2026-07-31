# CYM Studio — Gift Card Catalogue Setup

This guide covers how to set up the gift card catalogue feature, which lets users browse 600+ brands and purchase gift cards with USDC on Ethereum Mainnet or USDT0 on Conflux eSpace via the x402 payment protocol.

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
| `FACILITATOR_PRIVATE_KEY` | Your facilitator wallet | Private key of the wallet that executes `transferWithAuthorization` on-chain. This wallet needs ETH for gas on Ethereum and CFX on Conflux eSpace. |
| `EXTERNAL_API_KEY` | xRemit partner dashboard | API key for the xRemit gift card provider |
| `EXTERNAL_CLIENT_SECRET` | xRemit partner dashboard | Client secret for HMAC-SHA256 request signing |
| `XREMIT_ENV` | Set to `production` or `sandbox` | Controls which xRemit API is used (`rewardsapi.xremit.io` vs `rewardsapi-sandbox.xremit.io`) |
| `API_LAYER_KEY` | [apilayer.com](https://apilayer.com) | API key for real-time currency exchange rates (USD → ~30 currencies; used to price non-USD gift cards in USDC/USDT0) |
| `RESEND_API_KEY` | [resend.com](https://resend.com) | Sends voucher delivery emails to customers |
| `RESEND_FROM_EMAIL` | Your verified Resend domain | Sender address for emails (e.g. `noreply@cymstudio.com`) |

### Optional Variables

| Variable | Default | What it does |
|----------|---------|--------------|
| `ETHEREUM_MAINNET_RPC_URL` | `https://eth.llamarpc.com` | Ethereum Mainnet RPC endpoint. Use your own Alchemy/Infura URL for better reliability. |
| `CONFLUX_ESPACE_RPC_URL` | `https://evm.confluxrpc.com` | Conflux eSpace RPC endpoint for USDT0 payments. |
| `NEXT_PUBLIC_API_URL` | `https://cymstudio.com` | Your production URL. Used for xRemit webhook callback URLs. |
| `XREMIT_WEBHOOK_API_KEY` | *(none)* | If set, the webhook endpoint validates the `authorization` header from xRemit. |
| `CRON_SECRET` | *(none)* | Bearer token for the cron endpoints (`/api/sync-brands`, `/api/cron/*`). If not set, use `?direct=true` for manual syncs. |
| `FACILITATOR_MAINNET_PRIVATE_KEY` | Falls back to `FACILITATOR_PRIVATE_KEY` | Separate key for mainnet if you use a different wallet than testnet. |
| `DAILY_REDEMPTION_CAP_USD` | `1000` | Total gift-card face value (USD) redeemable per day, across all customers. Resets noon ET. See below. |

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
| `/api/quote` | GET | None | **The pricing endpoint.** `?productId=123[&price=50]` → `usdcAmount`, `effectiveRate`, `effectiveFeePercent`. |
| `/api/exchange-rate` | GET | None | Raw FX rate, no fee applied. `?from=CAD&to=USD` |
| `/api/webhook/xremit` | POST | Bearer token | Receives voucher from xRemit (automated). |
| `/api/sync-brands` | GET | `?direct=true` | Seed/resync the brands table from xRemit. |
| `/api/cron/refresh-exchange-rates` | GET/POST | `CRON_SECRET` | Refresh the cached FX rates. Schedule this (see below). |
| `/api/cron/resolve-pending-orders` | GET/POST | `CRON_SECRET` | Resolve/refund orders stuck in `pending_review`. |

### Pricing: one path only

Every price the customer sees and every amount settled on-chain comes from
`getPriceQuote()` in `lib/exchange-rates.ts`. The client never computes a fee.

```
charge = faceValue × (1 + effectiveFee/100) / fxRate

effectiveFee = 1.5%                              for non-USD (covers FX drift)
             = max(0, 0.5% − discount × 30% × 0.9)  for USD
```

The rebate is floored at 0 — the fee is a real cost passed through, so realized
discount margin can cancel it but never invert it into a below-face price.
Surplus margin beyond the fee stays profit. The 0.9 safety factor and the 48h
`REBATE_MAX_AGE_MS` guard mean a stale catalogue discount can never make the
rebate exceed what's actually earned at fulfillment.

Both the 402 quote and settlement call the same function on the same 30-min
rate, so the amount signed is the amount charged. (On the EIP-3009 path the
signed value is what moves on-chain, so this is load-bearing, not cosmetic.)

**Sellable currencies** are `QUOTABLE_CURRENCIES` in `lib/exchange-rates.ts` —
currently `USD, CAD, HKD, EUR`. Anything outside it cannot be quoted, so
`/api/quote`, `/api/exchange-rate`, and `/api/purchase` all reject it and the
buy button stays disabled. We hold rates for 30 currencies; widening the list is
just adding the code there.

The currency is always read from the `brands` row, never the request body.

### Daily redemption cap

A **cumulative** ceiling on gift-card face value redeemed per day, across all
customers — `DAILY_REDEMPTION_CAP_USD`, default $1,000. It bounds how much float
can be drawn down before you get a chance to replenish.

**The window resets at noon Eastern**, not midnight — periods run 12:00 ET to
12:00 ET. DST is handled via the IANA zone, so the reset stays at local noon
year-round rather than drifting an hour twice a year.

One consequence worth knowing when reading the ledger: `daily_redemption_caps.day`
is the date a period **opened**, so row `2026-07-30` covers noon 30 Jul → noon
31 Jul and contains orders created on both dates. It is not a calendar-day
grouping of `orders.created_at`.

Measured in **USD face value** (the inventory actually issued), not the USDC
collected — the fee isn't what needs replenishing. Non-USD cards are converted
at the current rate before counting.

The ledger is `daily_redemption_caps`, one row per period. Reserve and release
happen inside Postgres under `SELECT ... FOR UPDATE` (migration 007), **not** in
application code — a read-then-write in JS lets two concurrent purchases both
observe the same remaining budget and both settle. Verified: 40 concurrent $50
reservations against a $1,000 cap grant exactly 20 and land on exactly $1,000;
the same test against a non-locking version settles $2,000.

Budget is reserved before any money moves and released when an order fails or is
refunded, so failures don't strand capacity. Orders that go to `pending_review`
deliberately **keep** their reservation — that payment may still confirm and be
fulfilled — and the resolve-pending-orders cron releases it if it ends up
refunding. Releases go back to the period the order originally consumed
(`cap_day` on the order), so an order placed at 11:59 ET and refunded at 12:01
credits the right period rather than the one that just opened.

Both the cap check and the ledger read **fail closed**: if the ledger is
unreachable, purchases are refused rather than allowed to proceed uncapped.

Customers hitting the cap get a `429` with `code: DAILY_CAP_REACHED` and the
remaining capacity, and are stopped at the quote step — before signing anything.

```sql
-- today's usage
SELECT * FROM daily_redemption_caps ORDER BY day DESC LIMIT 7;
```

### Scheduling the exchange-rate refresh

Settlement prices non-USD orders on the cached FX rate in the `exchange_rates`
table. Without a scheduled refresh, that cache is only ever written as a side
effect of a purchase — so a quiet period followed by an API Layer outage leaves
settlement on a stale rate.

`lib/exchange-rates.ts` bounds the damage: past a 12h staleness ceiling it refuses
to price an order at all (checkout returns 503) rather than settle on a rate it
can't stand behind. Between 30 min and 12h it settles but flags the order
(`settlement_rate_degraded`) and logs a `DEGRADED RATE` warning. **Refresh more
often than the ceiling** or outages become downtime.

This runs from the VPS crontab like the other jobs, via `deploy/cron-hit.sh` —
which resolves `CRON_SECRET` from the app's env files at runtime and hits
`localhost:3000` directly, so the secret never appears in the crontab and the
request never leaves the box. `deploy/setup-vps.sh` installs it (every 8h).

To add it to an already-provisioned server without re-running setup:

```bash
( crontab -l 2>/dev/null; echo "30 */8 * * * /var/www/cymstudio/deploy/cron-hit.sh /api/cron/refresh-exchange-rates >> /var/log/cym-refresh-rates.log 2>&1 # CYM-CRON refresh-rates" ) | crontab -
```

**These two numbers are coupled — change one, change the other:**

| | |
|---|---|
| Refresh cron | every **8h** (~90 API calls/month, inside API Layer's 100/month free tier) |
| `STALE_CACHE_MAX_AGE_MS` | **12h** — must stay *longer* than the cron interval |

Purchases keep the cache warm on their own during trading hours, so this job
matters most in quiet periods. If the cron fires less often than the ceiling, a
quiet stretch lets the cache age past it and non-USD checkout starts returning
503. At 8h and 12h there's 4h of slack, so a single failed run is survivable.

The trade-off accepted here: during a provider outage we may settle non-USD
orders on rates up to 12h old. The 1.5% non-USD fee is what absorbs that drift,
and every such order is flagged `settlement_rate_degraded` for reconciliation.
Tightening the ceiling means running the cron more often, which means a paid
API Layer tier.

To find orders settled on a degraded rate:

```sql
SELECT order_id, currency, price, settlement_rate_age_ms, created_at
FROM orders WHERE settlement_rate_degraded ORDER BY created_at DESC;
```
