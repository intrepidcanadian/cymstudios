-- ============================================
-- Pre-deploy schema audit — READ ONLY, changes nothing
-- ============================================
-- Run this in the Supabase SQL Editor BEFORE deploying.
--
-- Migrations have been gitignored and partly applied by hand, so the live
-- schema has drifted from the migration files more than once (004 and 005 were
-- both written to repair exactly this). Every row below that reports MISSING is
-- something the new code writes or calls — deploying without it means every
-- purchase 500s.
-- ============================================

WITH checks(section, item, ok) AS (
  VALUES
    -- Columns /api/purchase inserts on every order
    ('006 rate staleness', 'orders.settlement_rate_age_ms',
      (SELECT COUNT(*)=1 FROM information_schema.columns WHERE table_name='orders' AND column_name='settlement_rate_age_ms')),
    ('006 rate staleness', 'orders.settlement_rate_degraded',
      (SELECT COUNT(*)=1 FROM information_schema.columns WHERE table_name='orders' AND column_name='settlement_rate_degraded')),
    ('006 rebate accounting', 'orders.service_fee_percent',
      (SELECT COUNT(*)=1 FROM information_schema.columns WHERE table_name='orders' AND column_name='service_fee_percent')),
    ('006 rebate accounting', 'orders.discount_applied',
      (SELECT COUNT(*)=1 FROM information_schema.columns WHERE table_name='orders' AND column_name='discount_applied')),

    -- Daily redemption cap
    ('007 daily cap', 'table daily_redemption_caps',
      (SELECT COUNT(*)=1 FROM information_schema.tables WHERE table_name='daily_redemption_caps')),
    ('007 daily cap', 'orders.cap_day',
      (SELECT COUNT(*)=1 FROM information_schema.columns WHERE table_name='orders' AND column_name='cap_day')),
    ('007 daily cap', 'orders.cap_reserved_usd',
      (SELECT COUNT(*)=1 FROM information_schema.columns WHERE table_name='orders' AND column_name='cap_reserved_usd')),
    ('007 daily cap', 'fn reserve_daily_redemption',
      (SELECT COUNT(*)>=1 FROM pg_proc WHERE proname='reserve_daily_redemption')),
    ('007 daily cap', 'fn release_daily_redemption',
      (SELECT COUNT(*)>=1 FROM pg_proc WHERE proname='release_daily_redemption')),

    -- Replay protection. If this table is absent, EIP-3009 replay protection
    -- has never been active in production.
    ('003 replay guard', 'table used_nonces',
      (SELECT COUNT(*)=1 FROM information_schema.tables WHERE table_name='used_nonces')),
    ('003 email verification', 'table verified_emails',
      (SELECT COUNT(*)=1 FROM information_schema.tables WHERE table_name='verified_emails')),

    -- The status CHECK must permit every value the app writes, or those UPDATEs
    -- fail silently and orders never leave 'pending'.
    ('007 status constraint', 'status allows pending_review',
      (SELECT pg_get_constraintdef(oid) LIKE '%pending_review%'
         FROM pg_constraint WHERE conname='orders_status_check')),

    -- Other columns the code writes
    ('004/005 backfill', 'orders.payment_from',
      (SELECT COUNT(*)=1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_from')),
    ('004/005 backfill', 'orders.product_image',
      (SELECT COUNT(*)=1 FROM information_schema.columns WHERE table_name='orders' AND column_name='product_image')),
    ('exchange rates', 'table exchange_rates',
      (SELECT COUNT(*)=1 FROM information_schema.tables WHERE table_name='exchange_rates'))
)
SELECT
  section,
  item,
  CASE WHEN ok THEN 'ok' ELSE '>>> MISSING — APPLY MIGRATION <<<' END AS status
FROM checks
ORDER BY ok, section, item;
