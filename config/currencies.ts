/**
 * Sellable currencies — the single source of truth.
 *
 * Kept in its own dependency-free module so client components can import it
 * without pulling in `lib/exchange-rates` (which loads @supabase/supabase-js and
 * reads server-only env vars). `lib/exchange-rates` re-exports these, so server
 * code can keep importing from either.
 */

/**
 * Currencies a customer may actually transact in. Enforced by /api/quote,
 * /api/exchange-rate and /api/purchase, used by /api/brands to decide what the
 * catalogue lists, and mirrored by the client's submit gating and Region filter.
 * Anything outside this list cannot be quoted, so it must not be purchasable.
 *
 * Deliberately narrower than the set of rates we fetch (SUPPORTED_CURRENCIES in
 * lib/exchange-rates covers ~30): we hold rates for many, but only sell in
 * these. Widening is safe — add the code here and it flows to the catalogue, the
 * Region filter, the quote endpoint and the purchase guard at once.
 *
 * GBP was removed in July 2026: xRemit carries no GBP inventory and no UK
 * products at all, so listing it advertised coverage that did not exist. Its
 * rate is still fetched, so re-adding it here is the only change needed if UK
 * stock appears.
 */
export const QUOTABLE_CURRENCIES = ['USD', 'CAD', 'HKD', 'EUR'] as const;

export function isQuotableCurrency(currency: string | null | undefined): boolean {
  if (!currency) return false;
  const c = currency.toUpperCase();
  // USDC is the settlement asset, priced 1:1 with USD
  if (c === 'USDC') return true;
  return (QUOTABLE_CURRENCIES as readonly string[]).includes(c);
}

/**
 * Preferred display order for currency groupings in the UI. Only a hint — the
 * list actually rendered is derived from QUOTABLE_CURRENCIES (see
 * `orderedQuotableCurrencies`), so a newly-sellable currency can never be
 * missing from a filter just because nobody updated this array.
 */
const CURRENCY_DISPLAY_ORDER = ['USD', 'CAD', 'EUR', 'HKD'];

/** Every sellable currency, preferred ones first, stragglers appended. */
export function orderedQuotableCurrencies(): string[] {
  const quotable = QUOTABLE_CURRENCIES as readonly string[];
  return [
    ...CURRENCY_DISPLAY_ORDER.filter((c) => quotable.includes(c)),
    ...quotable.filter((c) => !CURRENCY_DISPLAY_ORDER.includes(c)),
  ];
}
