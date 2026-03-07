/**
 * Exchange Rate Service
 *
 * Uses API Layer currency_data API for exchange rates.
 * Rates are cached for 12 hours (refreshes twice daily, ~60 API calls/month).
 *
 * A 1.5% FX buffer is added to cover volatility between rate fetch and settlement.
 */

import { createClient } from '@supabase/supabase-js';

// API Layer Configuration
const API_LAYER_KEY = process.env.API_LAYER_KEY;
const API_LAYER_URL = 'https://api.apilayer.com/currency_data/live';

// FX Buffer to cover volatility (1.5%)
const FX_BUFFER_PERCENT = 1.5;

// Cache duration: 12 hours (refreshes twice daily, ~60 API calls/month)
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000;

// Common currencies we support for gift cards
const SUPPORTED_CURRENCIES = [
  'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'HKD', 'SGD', 'NZD',
  'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'INR', 'KRW', 'THB', 'PHP', 'MYR',
  'IDR', 'ZAR', 'AED', 'SAR', 'TRY', 'PLN', 'CZK', 'HUF', 'ILS', 'TWD'
];

interface ExchangeRateCache {
  rates: Record<string, number>; // Currency -> rate (1 USD = X currency)
  timestamp: number;
  source: 'api' | 'database' | 'fallback';
}

// In-memory cache
let memoryCache: ExchangeRateCache | null = null;

// Fallback rates (approximate, updated periodically as backup)
const FALLBACK_RATES: Record<string, number> = {
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.53,
  JPY: 149.5,
  CHF: 0.88,
  CNY: 7.24,
  HKD: 7.82,
  SGD: 1.34,
  NZD: 1.64,
  SEK: 10.4,
  NOK: 10.6,
  DKK: 6.87,
  MXN: 17.2,
  BRL: 4.97,
  INR: 83.1,
  KRW: 1320,
  THB: 35.5,
  PHP: 55.8,
  MYR: 4.47,
  IDR: 15700,
  ZAR: 18.5,
  AED: 3.67,
  SAR: 3.75,
  TRY: 32.1,
  PLN: 3.95,
  CZK: 23.2,
  HUF: 355,
  ILS: 3.65,
  TWD: 31.5
};

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
 * 1. Check in-memory cache (valid for 12 hours)
 * 2. Check database cache (valid for 12 hours)
 * 3. Fetch from API Layer (once per day max)
 * 4. Fall back to hardcoded rates if all else fails
 */
async function getExchangeRates(): Promise<ExchangeRateCache> {
  const now = Date.now();

  // 1. Check memory cache
  if (memoryCache && (now - memoryCache.timestamp) < CACHE_DURATION_MS) {
    return memoryCache;
  }

  // 2. Check database cache
  const dbCache = await loadRatesFromDatabase();
  if (dbCache && (now - dbCache.timestamp) < CACHE_DURATION_MS) {
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

    // 4c. Use fallback rates
    console.warn('[ExchangeRates] Using fallback rates');
    return {
      rates: FALLBACK_RATES,
      timestamp: now,
      source: 'fallback'
    };
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
    console.warn(`[ExchangeRates] Unknown currency: ${currency}, using fallback`);
    const fallback = FALLBACK_RATES[currency];
    if (fallback) return fallback;
    throw new Error(`Unsupported currency: ${currency}`);
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
 * Get USDC amount for a given currency amount
 * Includes 1.5% FX buffer to cover volatility
 *
 * @param amount - Amount in source currency (gift card value)
 * @param currency - Source currency code (e.g., 'USD', 'HKD', 'EUR')
 * @returns USDC amount with FX buffer applied
 */
export async function getUsdcAmount(amount: number, currency: string): Promise<number> {
  // Convert to USD first
  const usdAmount = await convertToUsd(amount, currency);

  // Apply 1.5% FX buffer (multiply by 1.015)
  const bufferMultiplier = 1 + (FX_BUFFER_PERCENT / 100);
  const usdcAmount = usdAmount * bufferMultiplier;

  console.log(`[ExchangeRates] ${amount} ${currency} -> ${usdAmount.toFixed(4)} USD -> ${usdcAmount.toFixed(4)} USDC (with ${FX_BUFFER_PERCENT}% buffer)`);

  return usdcAmount;
}

/**
 * Get current exchange rate info for display
 */
export async function getExchangeRateInfo(): Promise<{
  rates: Record<string, number>;
  lastUpdated: string;
  source: string;
  fxBuffer: number;
}> {
  const cache = await getExchangeRates();
  return {
    rates: cache.rates,
    lastUpdated: new Date(cache.timestamp).toISOString(),
    source: cache.source,
    fxBuffer: FX_BUFFER_PERCENT
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
