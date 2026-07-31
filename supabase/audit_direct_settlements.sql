-- ============================================
-- Retrospective check: was the direct-strategy hole ever used?
-- READ ONLY, changes nothing.
-- ============================================
-- Until the strategy was pinned to the network config, a caller could set
-- `strategy: "direct"` in the x402 payload and settle via transferFrom against
-- someone else's allowance — with no signature proving they controlled the
-- paying address.
--
-- Detection: that path also skipped the used_nonces insert, which the EIP-3009
-- path always performs. So any order that settled a payment WITHOUT a matching
-- used_nonces row went through the direct path.
--
-- Expected result: zero rows. Both networks are configured eip3009, and the
-- normal flow never issues an approve, so there should be no allowances to
-- spend. Any row here deserves a look at whether payment_from is a wallet that
-- actually placed that order.
--
-- Caveat: orders created BEFORE used_nonces existed (migration 003) will also
-- appear. Set the cutoff below to when 003 was applied to filter those out.
-- ============================================

WITH cutoff AS (SELECT TIMESTAMPTZ '2025-04-09 00:00:00+00' AS applied_003)
SELECT
  o.order_id,
  o.created_at,
  o.status,
  o.payment_from,
  o.payment_network,
  o.payment_value,
  o.price,
  o.currency,
  o.user_email,
  o.brand_name
FROM orders o
LEFT JOIN used_nonces n ON n.order_id = o.order_id
CROSS JOIN cutoff c
WHERE o.payment_from IS NOT NULL      -- a payment was actually attempted
  AND n.order_id IS NULL              -- but no nonce was recorded => not eip3009
  AND o.created_at >= c.applied_003
ORDER BY o.created_at DESC;

-- Second signal: wallets that paid for orders under more than one email.
-- Legitimate (gifting), but it's the shape third-party-funded orders would take.
SELECT
  payment_from,
  COUNT(DISTINCT user_email) AS distinct_emails,
  COUNT(*)                   AS orders,
  MIN(created_at)            AS first_order,
  MAX(created_at)            AS last_order
FROM orders
WHERE payment_from IS NOT NULL
GROUP BY payment_from
HAVING COUNT(DISTINCT user_email) > 1
ORDER BY distinct_emails DESC, orders DESC;
