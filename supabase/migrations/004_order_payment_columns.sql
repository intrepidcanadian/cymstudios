-- ============================================
-- Migration 004: Ensure order payment columns exist
-- ============================================
-- The purchase and orders routes read/write these columns, but they were
-- never committed to a migration (only `payment_network` made it into 001).
-- Environments created before those columns were added in the dashboard
-- return "column orders.payment_* does not exist" on every /api/orders call.
--
-- Idempotent: safe to run on any environment.
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_network TEXT DEFAULT 'ethereum';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_from TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_value TEXT;

-- Indexes for the lookup patterns used by /api/orders and /api/purchase
CREATE INDEX IF NOT EXISTS idx_orders_payment_from
  ON orders (payment_from);

CREATE INDEX IF NOT EXISTS idx_orders_payment_network
  ON orders (payment_network);

-- Reload PostgREST schema cache so the new columns are queryable immediately
NOTIFY pgrst, 'reload schema';
