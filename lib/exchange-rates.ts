/**
 * Exchange Rate Service
 *
 * Rates come from the FX oracle (lib/fx-oracle.ts): the median across several
 * independent providers, so no single provider can take pricing down or quietly
 * price orders wrong.
 *
 * ONE rate policy, everywhere: quotes and settlement read the same cache, so
 * the customer is charged the amount they were quoted and quote and charge
 * cannot diverge.
 *
 * The refresh cron is the only intended caller of the oracle — see the freshness
 * ladder below. Quotes serve from cache up to FRESH_CACHE_MAX_AGE_MS (9h) and
 * only attempt a fetch beyond that, as a self-heal when the cron has failed.
 * Rates past STALE_CACHE_MAX_AGE_MS (24h) are refused outright rather than
 * settled on.
 *
 * Fee: 1.5% non-USD (covers FX drift), 0.5% USD. On USD cards our share of the
 * product's voucher discount is rebated against the fee, floored at 0% — the
 * fee is a real cost passed through, so margin may cancel it but never invert it.
 */

import { createClient } from '@supabase/supabase-js';
import { fetchOracleRates, type OracleProvenance } from './fx-oracle';

// API Layer is one oracle source among several, and an optional one — every
// other source is keyless. Absent or expired, the oracle simply votes without it.
const API_LAYER_KEY = process.env.API_LAYER_KEY;

// Merchant fee applied on top of the exchange rate
const FX_FEE_PERCENT = 1.5;
const FX_FEE_PERCENT_USD = 0.5;

// Our share of a product's voucher discount (the rest goes to the upstream partner).
// For USD cards we rebate this realized margin against the service fee.
const PARTNER_REVENUE_SHARE = 0.30;

// Safety buffer on the rebate: we only pass through 90% of the computed margin,
// so normal catalogue-sync drift (discount slightly stale) never makes the rebate
// exceed what we actually realize at fulfillment.
const REBATE_SAFETY_FACTOR = 0.90;

// ── Rate freshness ladder ───────────────────────────────────────────────────
// The refresh cron is the only intended caller of the oracle:
//
//     cron interval (8h)  <  FRESH_CACHE_MAX_AGE_MS (9h)  <  STALE_CACHE_MAX_AGE_MS (24h)
//
// Keeping the freshness target above the cron interval means quotes always read
// cache instead of fetching per-request. That started as quota arithmetic — API
// Layer's free tier allows 100 calls/month and a 30-minute target was costing
// roughly 1,400 — and it still matters now that the oracle fans out to several
// providers, since one quote would otherwise mean six outbound requests.
//
// The oracle's sources publish daily, so refreshing faster buys nothing anyway.
//
// These three numbers are coupled. Change one, change the others.

// Quotes and settlement serve from cache up to this age without calling out.
// Past it, a quote attempts one refresh — a self-heal for when the cron has
// failed, funded by the ~10 calls/month of headroom. Rates older than this are
// also flagged `degraded` on the order for later reconciliation.
const FRESH_CACHE_MAX_AGE_MS = 9 * 60 * 60 * 1000;

// Absolute ceiling: past this we refuse to price at all rather than settle on a
// rate we cannot defend. Without a ceiling, the stale-cache fallback silently
// turns "settle on a recent rate" into "settle on a 45-day-old rate" — which is
// precisely what production was doing before this existed.
//
// Sized to survive one missed cron run (8h -> 16h) with margin: it MUST exceed
// twice the cron interval, or a single failed run takes non-USD checkout down.
// Accepted trade-off: if every oracle source is unreachable we may settle non-USD orders
// on rates up to 24h old. The 1.5% non-USD fee absorbs that drift, and every
// such order is flagged settlement_rate_degraded for reconciliation.
const STALE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// After a failed oracle round, don't retry for this long. Without it, every
// request during an outage pays a full fan-out of timeouts — including requests
// on the settlement path.
const API_FAILURE_COOLDOWN_MS = 60 * 1000;

// Timestamp of the last oracle failure (0 = no recent failure)
let lastApiFailureAt = 0;

// Currencies the oracle is asked to price
const SUPPORTED_CURRENCIES = [
  'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'HKD', 'SGD', 'NZD',
  'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'INR', 'KRW', 'THB', 'PHP', 'MYR',
  'IDR', 'ZAR', 'AED', 'SAR', 'TRY', 'PLN', 'CZK', 'HUF', 'ILS', 'TWD'
];

// The sellable whitelist lives in config/currencies (dependency-free, so client
// components can import it without pulling this module into the browser bundle).
// Re-exported here because most server code already imports it from this path.
export { QUOTABLE_CURRENCIES, isQuotableCurrency } from '@/config/currencies';

// A catalogue discount older than this is not trusted for the rebate — the
// stored value may no longer match what xRemit grants, so we charge the full
// fee rather than risk waiving more than we earn.
export const REBATE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * The discount that may be rebated against the fee, given how fresh the
 * catalogue row is. Shared by /api/quote and /api/purchase so the amount we
 * quote is always the amount we charge.
 *
 * @param discountPercent - `brands.discount` (whole percent)
 * @param cachedAt - `brands.cached_at`
 */
export function resolveRebateDiscount(
  discountPercent: number | null | undefined,
  cachedAt: string | null | undefined,
): number {
  if (!cachedAt) return 0;
  const fresh = (Date.now() - new Date(cachedAt).getTime()) < REBATE_MAX_AGE_MS;
  return fresh ? (discountPercent ?? 0) : 0;
}

interface ExchangeRateCache {
  rates: Record<string, number>; // Currency -> rate (1 USD = X currency)
  timestamp: number;
  source: 'api' | 'database';
}

// In-memory cache
let memoryCache: ExchangeRateCache | null = null;


/**
 * Fetch rates via the FX oracle — the median across several independent
 * providers (see lib/fx-oracle.ts).
 *
 * API Layer is now one voice among several rather than the sole authority, so
 * its free-tier quota is no longer a single point of failure for the whole
 * non-USD catalogue. Every other source is keyless.
 *
 * Should be reached only by the refresh cron, or by a quote self-healing after
 * the cron has failed.
 */
async function fetchRatesFromOracle(): Promise<{ rates: Record<string, number>; provenance: OracleProvenance }> {
  console.log('[ExchangeRates] Querying FX oracle...');
  const { rates, provenance } = await fetchOracleRates(SUPPORTED_CURRENCIES, API_LAYER_KEY);

  const worst = Object.entries(provenance.perCurrency)
    .sort((a, b) => b[1].spreadPercent - a[1].spreadPercent)[0];

  console.log(
    `[ExchangeRates] Oracle: ${Object.keys(rates).length} currencies from ` +
    `${provenance.respondedIds.length} sources [${provenance.respondedIds.join(', ')}]` +
    (provenance.failed.length ? ` | failed: ${provenance.failed.map((f) => `${f.id}=${f.error}`).join(', ')}` : '') +
    (worst ? ` | widest spread ${worst[0]} ${worst[1].spreadPercent.toFixed(3)}%` : '')
  );

  for (const [code, info] of Object.entries(provenance.perCurrency)) {
    if (info.excluded.length) {
      console.warn(`[ExchangeRates] ${code}: discarded outlier source(s) ${info.excluded.join(', ')}`);
    }
  }

  return { rates, provenance };
}

/**
 * Get Supabase client for database caching
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  // no-store: see lib/supabase-server — Next caches supabase-js GETs otherwise
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: any, init: any = {}) => fetch(i, { ...init, cache: 'no-store' }) },
  });
}

/**
 * Load rates from database cache
 */
async function loadRatesFromDatabase(): Promise<ExchangeRateCache | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('rates, updated_at')
      .eq('id', 'usd_rates')
      .single();

    if (error || !data) {
      console.log('[ExchangeRates] No cached rates in database');
      return null;
    }

    const timestamp = new Date(data.updated_at).getTime();
    const age = Date.now() - timestamp;

    console.log('[ExchangeRates] Loaded rates from database, age:', Math.round(age / 1000 / 60), 'minutes');

    return {
      rates: data.rates as Record<string, number>,
      timestamp,
      source: 'database'
    };
  } catch (err) {
    console.error('[ExchangeRates] Database load error:', err);
    return null;
  }
}

/**
 * Save rates to database cache
 */
async function saveRatesToDatabase(
  rates: Record<string, number>,
  provenance?: OracleProvenance,
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('exchange_rates')
      .upsert({
        id: 'usd_rates',
        rates,
        // Which providers priced this snapshot and how far apart they were —
        // so any order can be traced back to the sources behind its rate.
        sources: provenance ?? null,
        updated_at: new Date().toISOString()
      });

    if (error) {
      // The `sources` column arrives in migration 008. If code ships ahead of
      // the migration, retry without provenance rather than silently losing the
      // DB cache entirely — rates matter more than their audit trail.
      const missingColumn = error.code === '42703' || /sources/i.test(error.message || '');
      if (missingColumn && provenance) {
        console.warn('[ExchangeRates] exchange_rates.sources missing (apply migration 008); saving rates without provenance');
        const { error: retryError } = await supabase
          .from('exchange_rates')
          .upsert({ id: 'usd_rates', rates, updated_at: new Date().toISOString() });
        if (retryError) console.error('[ExchangeRates] Database save error:', retryError);
        else console.log('[ExchangeRates] Saved rates to database (without provenance)');
        return;
      }
      console.error('[ExchangeRates] Database save error:', error);
    } else {
      console.log('[ExchangeRates] Saved rates to database');
    }
  } catch (err) {
    console.error('[ExchangeRates] Database save error:', err);
  }
}

/**
 * Get exchange rates with caching strategy:
 * 1. Check in-memory cache (valid for maxAge, default 24h)
 * 2. Check database cache (valid for maxAge)
 * 3. Query the FX oracle (skipped while in post-failure cooldown)
 * 4. Fall back to the freshest stale cache, but only up to
 *    STALE_CACHE_MAX_AGE_MS — beyond that we throw rather than price an order
 *    on a rate we can't stand behind.
 *
 * @param maxAge - Maximum cache age in ms. Defaults to FRESH_CACHE_MAX_AGE_MS,
 *                 which sits above the cron interval so callers read cache.
 */
async function getExchangeRates(maxAge: number = FRESH_CACHE_MAX_AGE_MS): Promise<ExchangeRateCache> {
  const now = Date.now();

  // 1. Check memory cache
  if (memoryCache && (now - memoryCache.timestamp) < maxAge) {
    return memoryCache;
  }

  // 2. Check database cache
  const dbCache = await loadRatesFromDatabase();
  if (dbCache && (now - dbCache.timestamp) < maxAge) {
    memoryCache = dbCache;
    return dbCache;
  }

  // Fall back to the freshest cache we hold, subject to the hard staleness
  // ceiling. Used when the API is unreachable or in post-failure cooldown.
  const useStaleCache = (reason: string): ExchangeRateCache => {
    const best = [dbCache, memoryCache]
      .filter((c): c is ExchangeRateCache => c !== null)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!best) {
      throw new Error('Exchange rate service is unavailable');
    }

    const ageMinutes = Math.round((now - best.timestamp) / 60000);

    if ((now - best.timestamp) > STALE_CACHE_MAX_AGE_MS) {
      console.error(
        `[ExchangeRates] Refusing stale rates (${reason}): cache is ${ageMinutes} min old, ` +
        `ceiling is ${STALE_CACHE_MAX_AGE_MS / 60000} min`
      );
      throw new Error(
        `Exchange rate service is unavailable (cached rates are ${ageMinutes} minutes old)`
      );
    }

    console.warn(`[ExchangeRates] Using stale ${best.source} cache (${reason}), age: ${ageMinutes} min`);
    memoryCache = best;
    return best;
  };

  // 3. Query the oracle for fresh rates — unless we just failed, in which case
  //    skip straight to the fallback instead of eating another timeout.
  if (lastApiFailureAt && (now - lastApiFailureAt) < API_FAILURE_COOLDOWN_MS) {
    return useStaleCache('provider in failure cooldown');
  }

  try {
    const { rates, provenance } = await fetchRatesFromOracle();
    const cache: ExchangeRateCache = {
      rates,
      timestamp: now,
      source: 'api'
    };

    // Save to memory and database
    lastApiFailureAt = 0;
    memoryCache = cache;
    await saveRatesToDatabase(rates, provenance);

    return cache;
  } catch (err) {
    lastApiFailureAt = now;
    console.error('[ExchangeRates] FX oracle failed:', err);

    // 4. Stale fallback, bounded by STALE_CACHE_MAX_AGE_MS (throws past it)
    return useStaleCache('provider fetch failed');
  }
}

/**
 * Get exchange rate for a currency (1 USD = X currency)
 * @param currency - Currency code (e.g., 'EUR', 'HKD')
 * @returns Exchange rate
 */
export async function getExchangeRate(currency: string): Promise<number> {
  if (currency === 'USD' || currency === 'USDC') {
    return 1;
  }

  // Same freshness target as pricing — a rate we publish must not differ from
  // the rate we charge on.
  const { rates } = await getExchangeRates(FRESH_CACHE_MAX_AGE_MS);
  const rate = rates[currency];

  if (!rate) {
    throw new Error(`Exchange rate unavailable for currency: ${currency}`);
  }

  return rate;
}

/**
 * Convert currency amount to USD
 * @param amount - Amount in source currency
 * @param currency - Source currency code
 * @returns Amount in USD
 */
export async function convertToUsd(amount: number, currency: string): Promise<number> {
  if (currency === 'USD' || currency === 'USDC') {
    return amount;
  }

  const rate = await getExchangeRate(currency);
  // rate is "1 USD = X currency", so to convert TO USD: amount / rate
  return amount / rate;
}

/**
 * Get the base fee percentage for a given currency, before any margin rebate.
 * USD: 0.5% (no FX risk). Non-USD: 1.5%.
 */
function getFeePercent(currency: string): number {
  return (currency === 'USD' || currency === 'USDC') ? FX_FEE_PERCENT_USD : FX_FEE_PERCENT;
}

/**
 * Effective fee percentage after rebating our share of the product's voucher discount.
 *
 * USD cards only: we keep 30% of the discount as margin, and apply that realized
 * margin against the 0.5% service fee (floored at 0% — any excess margin stays profit).
 * Non-USD fees are unaffected (FX risk is covered by the full 1.5%).
 *
 * @param currency - Source currency code
 * @param discountPercent - Product voucher discount in whole percent (e.g. 2.8 = 2.8%)
 */
export function getEffectiveFeePercent(currency: string, discountPercent: number = 0): number {
  const baseFee = getFeePercent(currency);
  if (currency === 'USD' || currency === 'USDC') {
    const realizedMargin = Math.max(0, discountPercent || 0) * PARTNER_REVENUE_SHARE * REBATE_SAFETY_FACTOR;
    return Math.max(0, baseFee - realizedMargin);
  }
  return baseFee;
}

/**
 * Reconcile the rebate we GRANTED at purchase time against the margin we
 * actually REALIZED at fulfillment (known only once xRemit returns the real
 * discount + revenue-share). Returns the shortfall in percentage-of-face-value:
 *   > 0  → we waived more fee than we earned in margin (a net loss on the rebate)
 *   <= 0 → rebate fully covered by realized margin
 * Returns null when reconciliation doesn't apply (non-USD, or missing inputs).
 *
 * @param currency - Order currency
 * @param serviceFeePercent - The effective fee % we charged (stored on the order)
 * @param voucherDiscountPercent - Actual discount xRemit applied (whole percent)
 * @param partnerRevenueSharePercent - Our actual share of that discount (whole percent)
 */
export function getRebateShortfallPercent(
  currency: string,
  serviceFeePercent: number | null | undefined,
  voucherDiscountPercent: number | null | undefined,
  partnerRevenueSharePercent: number | null | undefined,
): number | null {
  if (currency !== 'USD' && currency !== 'USDC') return null;
  if (serviceFeePercent == null || voucherDiscountPercent == null || partnerRevenueSharePercent == null) {
    return null;
  }
  const grantedRebate = FX_FEE_PERCENT_USD - serviceFeePercent;
  const realizedMargin = (voucherDiscountPercent * partnerRevenueSharePercent) / 100;
  return grantedRebate - realizedMargin;
}

/**
 * A price quote, carrying the staleness of the rate it was priced on so the
 * caller can decide whether to settle, flag, or refuse.
 *
 * There is exactly one pricing path — this one. Both the quote shown to the
 * customer and the amount settled on-chain come from it, so a quote can never
 * disagree with a charge.
 */
export interface PriceQuote {
  /** USDC amount with the effective fee applied */
  amount: number;
  /** USD per 1 unit of source currency, fee included (amount === faceValue * effectiveRate) */
  effectiveRate: number;
  /** Fee actually applied, after the discount-margin rebate */
  effectiveFeePercent: number;
  /** Age of the exchange rate used, in ms (0 for USD/USDC — no rate involved) */
  rateAgeMs: number;
  /** True when the rate exceeded the 30-min freshness target (still within the hard ceiling) */
  degraded: boolean;
}

/**
 * Price `amount` of `currency` in USDC on a settlement-grade rate.
 *
 * THE single pricing entry point. Serves from cache up to
 * FRESH_CACHE_MAX_AGE_MS; beyond that it attempts one refresh, and if the
 * provider is unreachable the quote may be priced on an older cached rate — up
 * to STALE_CACHE_MAX_AGE_MS, past which getExchangeRates throws. The result
 * reports `rateAgeMs`/`degraded` so callers never price blind.
 *
 * @param amount - Amount in source currency (gift card face value)
 * @param currency - Source currency code
 * @param discountPercent - Product voucher discount in whole percent (USD rebate only)
 */
export async function getPriceQuote(
  amount: number,
  currency: string,
  discountPercent: number = 0
): Promise<PriceQuote> {
  const effectiveFeePercent = getEffectiveFeePercent(currency, discountPercent);
  const feeMultiplier = 1 + (effectiveFeePercent / 100);

  // No FX involved — nothing can be stale.
  if (currency === 'USD' || currency === 'USDC') {
    return {
      amount: amount * feeMultiplier,
      effectiveRate: feeMultiplier,
      effectiveFeePercent,
      rateAgeMs: 0,
      degraded: false,
    };
  }

  const cache = await getExchangeRates(FRESH_CACHE_MAX_AGE_MS);
  const rate = cache.rates[currency];

  if (!rate) {
    throw new Error(`Exchange rate unavailable for currency: ${currency}`);
  }

  const rateAgeMs = Math.max(0, Date.now() - cache.timestamp);
  const degraded = rateAgeMs > FRESH_CACHE_MAX_AGE_MS;

  // `rate` is "1 USD = X currency", so USD per unit is 1/rate
  const effectiveRate = (1 / rate) * feeMultiplier;
  const usdcAmount = amount * effectiveRate;

  console.log(
    `[ExchangeRates] QUOTE: ${amount} ${currency} -> ${(amount / rate).toFixed(4)} USD -> ` +
    `${usdcAmount.toFixed(4)} USDC (${effectiveFeePercent}% fee, rate age ${Math.round(rateAgeMs / 60000)} min` +
    `${degraded ? ', DEGRADED' : ''})`
  );

  return { amount: usdcAmount, effectiveRate, effectiveFeePercent, rateAgeMs, degraded };
}

/**
 * Get current exchange rate info for display
 */
export async function getExchangeRateInfo(): Promise<{
  rates: Record<string, number>;
  lastUpdated: string;
  source: string;
  fxFee: number;
}> {
  const cache = await getExchangeRates();
  return {
    rates: cache.rates,
    lastUpdated: new Date(cache.timestamp).toISOString(),
    source: cache.source,
    fxFee: FX_FEE_PERCENT
  };
}

/**
 * Force refresh rates from API (use sparingly - limited to 100 calls/month)
 */
export async function forceRefreshRates(): Promise<void> {
  console.log('[ExchangeRates] Force refreshing rates...');
  const { rates, provenance } = await fetchRatesFromOracle();
  const now = Date.now();

  memoryCache = {
    rates,
    timestamp: now,
    source: 'api'
  };

  await saveRatesToDatabase(rates, provenance);
}

// Legacy exports for backwards compatibility
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string = 'USD'
): Promise<number> {
  if (fromCurrency === toCurrency) return amount;

  if (toCurrency !== 'USD') {
    throw new Error('Only USD conversion is supported');
  }

  return convertToUsd(amount, fromCurrency);
}

export async function getExchangeRateAPI(
  fromCurrency: string,
  toCurrency: string = 'USD'
): Promise<{ success: boolean; rate?: number; error?: string }> {
  try {
    if (toCurrency !== 'USD') {
      return { success: false, error: 'Only USD conversion supported' };
    }
    const rate = await getExchangeRate(fromCurrency);
    // Return rate as "1 fromCurrency = X USD"
    return { success: true, rate: 1 / rate };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}
