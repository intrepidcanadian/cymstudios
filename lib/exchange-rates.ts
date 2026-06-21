/**
 * Exchange Rate Service
 *
 * Uses API Layer currency_data API for exchange rates.
 * Two-tier caching: 24h for display estimates, 30min freshness for settlement.
 *
 * A 1.5% merchant fee is applied on top of the exchange rate.
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

// Cache duration: 24 hours for display/estimation (~30 API calls/month)
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

// Fresh cache threshold: 30 minutes — used at settlement time
// If cache is older than this, force-refresh before processing payment
const FRESH_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

// Common currencies we support for gift cards
const SUPPORTED_CURRENCIES = [
  'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'HKD', 'SGD', 'NZD',
  'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'INR', 'KRW', 'THB', 'PHP', 'MYR',
  'IDR', 'ZAR', 'AED', 'SAR', 'TRY', 'PLN', 'CZK', 'HUF', 'ILS', 'TWD'
];

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

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': API_LAYER_KEY
    }
  });

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
 * 3. Fetch from API Layer
 * 4. Use stale cache if available, otherwise throw
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

  // 3. Fetch fresh rates from API Layer
  try {
    const rates = await fetchRatesFromApiLayer();
    const cache: ExchangeRateCache = {
      rates,
      timestamp: now,
      source: 'api'
    };

    // Save to memory and database
    memoryCache = cache;
    await saveRatesToDatabase(rates);

    return cache;
  } catch (err) {
    console.error('[ExchangeRates] Failed to fetch from API Layer:', err);

    // 4a. Use stale database cache if available
    if (dbCache) {
      console.warn('[ExchangeRates] Using stale database cache');
      memoryCache = dbCache;
      return dbCache;
    }

    // 4b. Use stale memory cache if available
    if (memoryCache) {
      console.warn('[ExchangeRates] Using stale memory cache');
      return memoryCache;
    }

    // 4c. No rates available — service is unavailable
    throw new Error('Exchange rate service is unavailable');
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

  const { rates } = await getExchangeRates();
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
function getEffectiveFeePercent(currency: string, discountPercent: number = 0): number {
  const baseFee = getFeePercent(currency);
  if (currency === 'USD' || currency === 'USDC') {
    const realizedMargin = Math.max(0, discountPercent || 0) * PARTNER_REVENUE_SHARE;
    return Math.max(0, baseFee - realizedMargin);
  }
  return baseFee;
}

/**
 * Get USDC amount for a given currency amount (display/estimate).
 * Uses cached rate (up to 24h old) + merchant fee (0.5% USD, 1.5% non-USD),
 * minus our 30% discount-margin rebate on USD cards.
 *
 * @param amount - Amount in source currency (gift card value)
 * @param currency - Source currency code (e.g., 'USD', 'HKD', 'EUR')
 * @param discountPercent - Product voucher discount in whole percent (USD rebate only)
 * @returns Estimated USDC amount with effective fee applied
 */
export async function getUsdcAmount(amount: number, currency: string, discountPercent: number = 0): Promise<number> {
  const usdAmount = await convertToUsd(amount, currency);
  const feePct = getEffectiveFeePercent(currency, discountPercent);
  const usdcAmount = usdAmount * (1 + feePct / 100);

  console.log(`[ExchangeRates] ${amount} ${currency} -> ${usdAmount.toFixed(4)} USD -> ${usdcAmount.toFixed(4)} USDC (${feePct}% fee, cached rate)`);

  return usdcAmount;
}

/**
 * Get USDC amount using a fresh exchange rate (max 30 min old).
 * Used at settlement time — the effective fee is charged on the current rate.
 *
 * @param amount - Amount in source currency (gift card value)
 * @param currency - Source currency code
 * @param discountPercent - Product voucher discount in whole percent (USD rebate only)
 * @returns USDC amount with effective fee applied on fresh rate
 */
export async function getUsdcAmountFresh(amount: number, currency: string, discountPercent: number = 0): Promise<number> {
  const feePct = getEffectiveFeePercent(currency, discountPercent);
  const feeMultiplier = 1 + (feePct / 100);

  if (currency === 'USD' || currency === 'USDC') {
    return amount * feeMultiplier;
  }

  const { rates } = await getExchangeRates(FRESH_CACHE_MAX_AGE_MS);
  const rate = rates[currency];

  if (!rate) {
    throw new Error(`Exchange rate unavailable for currency: ${currency}`);
  }

  const usdAmount = amount / rate;
  const usdcAmount = usdAmount * feeMultiplier;

  console.log(`[ExchangeRates] FRESH: ${amount} ${currency} -> ${usdAmount.toFixed(4)} USD -> ${usdcAmount.toFixed(4)} USDC (${feePct}% fee, fresh rate)`);

  return usdcAmount;
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
