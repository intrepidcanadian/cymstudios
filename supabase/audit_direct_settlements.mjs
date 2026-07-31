/**
 * Retrospective check: was the direct-strategy hole ever used? READ ONLY.
 *
 *   node --env-file=.env supabase/audit_direct_settlements.mjs
 *
 * Until the payment strategy was pinned to the network config, a caller could
 * set `strategy: "direct"` in the x402 payload and settle via transferFrom
 * against someone else's allowance, with no signature proving they controlled
 * the paying address.
 *
 * Detection: that path also skipped the used_nonces insert, which the EIP-3009
 * path always performs. So an order that settled a payment WITHOUT a matching
 * used_nonces row went through the direct path.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: orders, error: oErr } = await supabase
  .from('orders')
  .select('order_id, created_at, status, payment_from, payment_network, payment_value, price, currency, user_email, brand_name')
  .not('payment_from', 'is', null)
  .order('created_at', { ascending: false })
  .limit(10000);
if (oErr) { console.error('orders query failed:', oErr.message); process.exit(1); }

const { data: nonces, error: nErr } = await supabase
  .from('used_nonces')
  .select('order_id, created_at')
  .limit(10000);
if (nErr) { console.error('used_nonces query failed:', nErr.message); process.exit(1); }

const withNonce = new Set(nonces.map((n) => n.order_id).filter(Boolean));

// Orders predating used_nonces can't be judged — nothing recorded nonces then.
const earliestNonce = nonces.length
  ? nonces.reduce((min, n) => (n.created_at < min ? n.created_at : min), nonces[0].created_at)
  : null;

console.log(`${orders.length} orders with a payment, ${nonces.length} recorded nonces`);
console.log(`replay guard active since: ${earliestNonce ?? 'never — no nonces recorded'}\n`);

const suspect = orders.filter(
  (o) => !withNonce.has(o.order_id) && earliestNonce && o.created_at >= earliestNonce,
);
const preGuard = orders.filter((o) => !earliestNonce || o.created_at < earliestNonce);

console.log('--- Settled without a nonce (would indicate the direct path) ---');
if (suspect.length === 0) {
  console.log('  none — every order since the replay guard went live settled via EIP-3009.\n');
} else {
  for (const o of suspect) {
    console.log(`  ${o.created_at}  ${o.status.padEnd(14)} ${o.payment_from}  ${o.price} ${o.currency}  ${o.user_email}  ${o.brand_name}`);
  }
  console.log(`  ${suspect.length} order(s) — check whether payment_from is a wallet that actually placed that order.\n`);
}

console.log(`--- Predating the guard (${preGuard.length}, cannot be judged either way) ---`);
for (const o of preGuard.slice(0, 10)) {
  console.log(`  ${o.created_at}  ${o.status.padEnd(14)} ${o.payment_from}  ${o.price} ${o.currency}`);
}
if (preGuard.length > 10) console.log(`  ...and ${preGuard.length - 10} more`);

// Second signal: one wallet funding orders under several emails. Legitimate for
// gifting, but it is the shape a third-party-funded order would take.
const byWallet = new Map();
for (const o of orders) {
  const k = o.payment_from.toLowerCase();
  if (!byWallet.has(k)) byWallet.set(k, new Set());
  byWallet.get(k).add(o.user_email);
}
const multi = [...byWallet.entries()].filter(([, emails]) => emails.size > 1);

console.log('\n--- Wallets paying under more than one email ---');
if (multi.length === 0) {
  console.log('  none.');
} else {
  for (const [wallet, emails] of multi.sort((a, b) => b[1].size - a[1].size)) {
    console.log(`  ${wallet}  ${emails.size} emails: ${[...emails].join(', ')}`);
  }
}

console.log(
  suspect.length === 0
    ? '\nRESULT: no evidence the direct-strategy path was ever used.'
    : `\nRESULT: ${suspect.length} order(s) need review.`,
);
