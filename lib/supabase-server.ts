import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client that never serves cached rows.
 *
 * Next's App Router patches global `fetch` and caches GET responses. supabase-js
 * uses global `fetch`, so PostgREST reads were being cached indefinitely — and
 * `export const dynamic = 'force-dynamic'` does not cover them, because it
 * governs route rendering rather than outbound data fetches.
 *
 * This was not theoretical. A product quoted on 20 Aug kept returning its 20 Aug
 * row for days: `brands.cached_at` stayed frozen, aged past the 48h rebate
 * window, and silently disabled the USD discount rebate — charging 0.5% more
 * than intended. Sibling products that had never been quoted read fresh and
 * priced correctly, which made it look like per-row corruption.
 *
 * The same staleness would apply to `discount`, `denominations` and
 * `value_restrictions`, so it could equally over-rebate or accept an amount the
 * provider no longer sells.
 *
 * Anything pricing, validating or settling an order must read live rows.
 */
export function createServerSupabase(extraOptions: Record<string, any> = {}): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase configuration missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }

  const { global: extraGlobal, ...rest } = extraOptions;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...rest,
    global: {
      ...(extraGlobal ?? {}),
      // Opt every PostgREST request out of Next's data cache.
      fetch: (input: any, init: any = {}) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}
