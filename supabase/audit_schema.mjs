/**
 * Pre-deploy schema audit — READ ONLY, changes nothing.
 *
 *   node --env-file=.env supabase/audit_schema.mjs
 *
 * Same checks as audit_schema.sql, but run through PostgREST with the service
 * role key instead of the dashboard. Use this when the SQL Editor is
 * unreachable ("Failed to fetch"), and prefer it generally: it exercises the
 * exact path the app uses, so it also catches a stale PostgREST schema cache —
 * a column can exist in Postgres and still 500 the app until the cache reloads,
 * which the SQL Editor would report as fine.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Run with:  node --env-file=.env supabase/audit_schema.mjs');
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
const record = (section, item, ok, detail = '') => results.push({ section, item, ok, detail });

/** Probe a table/column by selecting it. Any error means the app can't use it. */
async function probe(section, table, column) {
  const item = column ? `${table}.${column}` : `table ${table}`;
  try {
    const { error } = await supabase.from(table).select(column ?? '*').limit(1);
    record(section, item, !error, error ? `${error.code ?? ''} ${error.message}`.trim() : '');
  } catch (err) {
    record(section, item, false, err instanceof Error ? err.message : 'unknown');
  }
}

/**
 * Probe an RPC without mutating anything: both functions reject a non-positive
 * amount before touching the ledger, so a negative amount proves existence
 * safely. A missing function returns PGRST202 instead.
 */
async function probeRpc(section, fn, args) {
  try {
    const { error } = await supabase.rpc(fn, args);
    const missing = error && (error.code === 'PGRST202' || /could not find/i.test(error.message || ''));
    // The guard raising "must be positive" is proof the function exists
    record(section, `fn ${fn}`, !missing, missing ? `${error.code ?? ''} ${error.message}`.trim() : '');
  } catch (err) {
    record(section, `fn ${fn}`, false, err instanceof Error ? err.message : 'unknown');
  }
}

console.log(`Auditing ${url}\n`);

// 006 — columns /api/purchase writes on every order
await probe('006 rate staleness', 'orders', 'settlement_rate_age_ms');
await probe('006 rate staleness', 'orders', 'settlement_rate_degraded');
await probe('006 rebate accounting', 'orders', 'service_fee_percent');
await probe('006 rebate accounting', 'orders', 'discount_applied');

// 007 — daily redemption cap
await probe('007 daily cap', 'daily_redemption_caps');
await probe('007 daily cap', 'orders', 'cap_day');
await probe('007 daily cap', 'orders', 'cap_reserved_usd');
await probeRpc('007 daily cap', 'reserve_daily_redemption', {
  p_day: '2000-01-01', p_amount: -1, p_cap: 1,
});
await probeRpc('007 daily cap', 'release_daily_redemption', {
  p_day: '2000-01-01', p_amount: -1,
});

// 003 — replay protection. If used_nonces is absent, EIP-3009 replay
// protection has never been active in production.
await probe('003 replay guard', 'used_nonces');
await probe('003 email verification', 'verified_emails');

// 004/005 — previously dashboard-only columns
await probe('004/005 backfill', 'orders', 'payment_from');
await probe('004/005 backfill', 'orders', 'product_image');
await probe('exchange rates', 'exchange_rates');

const pad = (s, n) => String(s).padEnd(n);
const missing = results.filter((r) => !r.ok);

for (const r of [...missing, ...results.filter((r) => r.ok)]) {
  const status = r.ok ? 'ok' : '>>> MISSING';
  console.log(`${pad(status, 12)} ${pad(r.section, 24)} ${pad(r.item, 34)} ${r.detail}`);
}

console.log('');
if (missing.length === 0) {
  console.log('All checks passed — safe to deploy.');
} else {
  console.log(`${missing.length} missing. Apply migrations 006/007 (and 003 if used_nonces is missing) BEFORE deploying —`);
  console.log('the new code writes these columns and calls these functions on every purchase.');
}

// NOTE: the orders_status_check constraint (must allow 'pending_review') can't
// be read through PostgREST. Verify that one in the SQL Editor when it's back,
// or just apply 007 — it rewrites the constraint idempotently.
console.log("\nNot checked here: orders_status_check must allow 'pending_review' (migration 007 fixes it).");

process.exit(missing.length === 0 ? 0 : 1);
