/**
 * Exchange Rate Service
 *
 * Uses API Layer currency_data API for exchange rates.
 *
 * ONE rate policy, everywhere: quotes and settlement both target a rate no
 * older than FRESH_CACHE_MAX_AGE_MS (30 min). The customer is charged the
 * amount they were quoted, and that amount is priced on the same rate the
 * settlement check validates against — so quote and charge cannot diverge.
 *
 * If the provider is unreachable we fall back to the freshest cached rate up to
 * STALE_CACHE_MAX_AGE_MS (12h), flagged as `degraded`; past that we refuse to
 * price rather than settle on a rate we can't stand behind.
 *
 * Fee: 1.5% non-USD (covers FX drift), 0.5% USD. On USD cards our share of the
 * product's voucher discount is rebated against the fee, floored at 0% — the
 * fee is a real cost passed through, so margin may cancel it but never invert it.
 */

import { createClient } from '@supabase/supabase-js';

// API Layer Configuration
const API_LAYER_KEY = process.env.API_LAYER_KEY;
const API_LAYER_URL = 'https://api.apilayer.com/currency_data/live';

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

// Cache duration: 24 hours for display/estimation (~30 API calls/month)
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

// Fresh cache threshold: 30 minutes — used at settlement time
// If cache is older than this, force-refresh before processing payment
const FRESH_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

// Absolute ceiling on how stale a cached rate may be before we refuse to price
// an order at all. The stale-cache fallback below exists so a brief provider
// outage doesn't take checkout down — but without a ceiling it silently turns
// "settle on a 30-minute rate" into "settle on a week-old rate". Past this, we
// fail the request instead of settling on a rate we can no longer defend.
//
// Set to 12h deliberately, to sit above the 8-hourly refresh cron that keeps us
// inside API Layer's 100-calls/month free tier (see SETUP.md). The ceiling MUST
// stay longer than the cron interval — otherwise a quiet period with no
// purchases lets the cache age past it and non-USD checkout starts 503ing.
// The trade-off is accepting settlement on rates up to 12h old during a
// provider outage; the 1.5% non-USD fee is what absorbs that drift.
const STALE_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// After a failed API Layer call, don't retry for this long. Without it, every
// request during an outage pays a full network timeout — including requests on
// the settlement path.
const API_FAILURE_COOLDOWN_MS = 60 * 1000;

// Per-attempt timeout on the API Layer call itself
const API_FETCH_TIMEOUT_MS = 8 * 1000;

// Timestamp of the last API Layer failure (0 = no recent failure)
let lastApiFailureAt = 0;

// Currencies we pull rates for from API Layer
const SUPPORTED_CURRENCIES = [
  'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'HKD', 'SGD', 'NZD',
  'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'INR', 'KRW', 'THB', 'PHP', 'MYR',
  'IDR', 'ZAR', 'AED', 'SAR', 'TRY', 'PLN', 'CZK', 'HUF', 'ILS', 'TWD'
];

/**
 * Currencies a customer may actually transact in — the single whitelist enforced
 * by /api/quote, /api/exchange-rate, and /api/purchase, and mirrored by the
 * client's submit gating. Anything outside this list cannot be quoted, so it
 * must not be purchasable.
 *
 * Deliberately narrower than SUPPORTED_CURRENCIES: we hold rates for all 30,
 * but only sell in the ones below. Widening is safe — add the code here and it
 * flows to the UI, the quote endpoint, and the purchase guard at once.
 */
export const QUOTABLE_CURRENCIES = ['USD', 'CAD', 'HKD', 'GBP', 'EUR'] as const;

export function isQuotableCurrency(currency: string | null | undefined): boolean {
  if (!currency) return false;
  const c = currency.toUpperCase();
  // USDC is the settlement asset, priced 1:1 with USD
  if (c === 'USDC') return true;
  return (QUOTABLE_CURRENCIES as readonly string[]).includes(c);
}

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
 * Fetch fresh exchange rates from API Layer
 * Called at most once per day to stay within rate limits
 */
async function fetchRatesFromApiLayer(): Promise<Record<string, number>> {
  if (!API_LAYER_KEY) {
    console.warn('[ExchangeRates] API_LAYER_KEY not configured, using fallback rates');
    throw new Error('API_LAYER_KEY not configured');
  }

  const symbols = SUPPORTED_CURRENCIES.join(',');
  const url = `${API_LAYER_URL}?base=USD&symbols=${symbols}`;

  console.log('[ExchangeRates] Fetching fresh rates from API Layer...');

  // Hard timeout — this call sits on the settlement path, so a hung provider
  // must not hold a purchase request open.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': API_LAYER_KEY
      },
      signal: controller.signal
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`API Layer request timed out after ${API_FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ExchangeRates] API Layer error:', response.status, errorText);
    throw new Error(`API Layer error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success || !data.quotes) {
    console.error('[ExchangeRates] Invalid API response:', data);
    throw new Error('Invalid API Layer response');
  }

  // API Layer returns rates as "USDEUR", "USDGBP", etc.
  // Convert to simple currency codes
  const rates: Record<string, number> = {};
  for (const [key, value] of Object.entries(data.quotes)) {
    // Extract currency code (e.g., "USDEUR" -> "EUR")
    const currency = key.replace('USD', '');
    rates[currency] = value as number;
  }

  console.log('[ExchangeRates] Fetched', Object.keys(rates).length, 'exchange rates');
  return rates;
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

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
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
async function saveRatesToDatabase(rates: Record<string, number>): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('exchange_rates')
      .upsert({
        id: 'usd_rates',
        rates,
        updated_at: new Date().toISOString()
      });

    if (error) {
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
 * 3. Fetch from API Layer (skipped while in post-failure cooldown)
 * 4. Fall back to the freshest stale cache, but only up to
 *    STALE_CACHE_MAX_AGE_MS — beyond that we throw rather than price an order
 *    on a rate we can't stand behind.
 *
 * @param maxAge - Maximum cache age in ms (default: CACHE_DURATION_MS = 24h).
 *                 Pass FRESH_CACHE_MAX_AGE_MS (30 min) at settlement time.
 */
async function getExchangeRates(maxAge: number = CACHE_DURATION_MS): Promise<ExchangeRateCache> {
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

  // 3. Fetch fresh rates from API Layer — unless we just failed, in which case
  //    skip straight to the fallback instead of eating another timeout.
  if (lastApiFailureAt && (now - lastApiFailureAt) < API_FAILURE_COOLDOWN_MS) {
    return useStaleCache('provider in failure cooldown');
  }

  try {
    const rates = await fetchRatesFromApiLayer();
    const cache: ExchangeRateCache = {
      rates,
      timestamp: now,
      source: 'api'
    };

    // Save to memory and database
    lastApiFailureAt = 0;
    memoryCache = cache;
    await saveRatesToDatabase(rates);

    return cache;
  } catch (err) {
    lastApiFailureAt = now;
    console.error('[ExchangeRates] Failed to fetch from API Layer:', err);

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
 * THE single pricing entry point. Targets a rate no older than 30 min; if the
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
  const rates = await fetchRatesFromApiLayer();
  const now = Date.now();

  memoryCache = {
    rates,
    timestamp: now,
    source: 'api'
  };

  await saveRatesToDatabase(rates);
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
