-- ============================================
-- Migration 005: Add product_image column to orders
-- ============================================
-- /api/purchase inserts product_image on every order creation, but this
-- column was never in a migration file (only the legacy product_name
-- column was). Result: every purchase returns 500 with
-- "column orders.product_image does not exist" on environments that
-- never had the column added manually.
--
-- Idempotent: safe to run on any environment.
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS product_image TEXT;

-- Reload PostgREST schema cache so the new column is queryable immediately
NOTIFY pgrst, 'reload schema';
