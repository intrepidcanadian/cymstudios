-- ============================================
-- Migration 006: Record FX rate staleness on orders
-- ============================================
-- /api/purchase now records how stale the exchange rate was at settlement.
-- When the rate provider is unreachable we fall back to a cached rate (bounded
-- by STALE_CACHE_MAX_AGE_MS in lib/exchange-rates.ts). Those orders settle on
-- a rate we know is behind the market, so we record the age to reconcile
-- realized FX loss afterwards and to alert on provider outages.
--
-- Also adds service_fee_percent / discount_applied, which /api/purchase has
-- been inserting since the rebate work but which never made it into a
-- migration (same gap as 004/005). Missing columns fail the whole INSERT, so
-- a fresh environment 500s on every purchase without these.
--
-- Idempotent: safe to run on any environment.
-- ============================================

-- Rebate accounting (previously dashboard-only)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_fee_percent NUMERIC;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_applied NUMERIC DEFAULT 0;

-- FX rate staleness at settlement
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS settlement_rate_age_ms BIGINT DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS settlement_rate_degraded BOOLEAN DEFAULT FALSE;

-- Partial index: degraded orders are rare, and this is the only query pattern
-- (find orders settled on a stale rate, for reconciliation).
CREATE INDEX IF NOT EXISTS idx_orders_settlement_rate_degraded
  ON orders (created_at)
  WHERE settlement_rate_degraded;

-- Reload PostgREST schema cache so the new columns are queryable immediately
NOTIFY pgrst, 'reload schema';
