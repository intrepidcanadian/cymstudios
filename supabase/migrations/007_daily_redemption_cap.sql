-- ============================================
-- Migration 007: Daily redemption cap
-- ============================================
-- Caps total gift-card face value redeemed per day, so outstanding exposure
-- stays bounded and float can be replenished on a predictable cycle.
--
-- The `day` column is the date a period OPENED, and periods run noon-to-noon
-- Eastern — row '2026-07-30' covers noon 30 Jul ET through noon 31 Jul ET, so
-- it includes orders whose created_at falls on the 31st. Do not assume day ==
-- calendar date of the orders in it. The boundary is computed in the app
-- (currentCapDay in lib/redemption-cap.ts), which owns the DST handling.
--
-- Correctness note: this MUST be atomic. A read-then-write in application code
-- lets two concurrent purchases both observe "$900 used" and both proceed,
-- settling $1,800 against a $1,000 cap. The reserve function below takes a row
-- lock (SELECT ... FOR UPDATE) so concurrent callers serialize and the second
-- one sees the first one's reservation.
--
-- Reservations are released when an order fails or is refunded, so a failed
-- payment doesn't permanently consume the day's budget.
--
-- Idempotent: safe to run on any environment.
-- ============================================

CREATE TABLE IF NOT EXISTS daily_redemption_caps (
  -- Date the noon-ET period opened (see header) — not a UTC calendar day
  day         DATE PRIMARY KEY,
  total_usd   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which period/amount an order reserved, so a later refund releases exactly
-- what was taken (an order placed at 11:59 ET and refunded at 12:01 must give
-- the budget back to the period it consumed, not the one that just opened).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cap_day DATE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cap_reserved_usd NUMERIC(14,2);

-- 'pending_review' is written by /api/purchase and the resolve-pending-orders
-- cron, but the original CHECK constraint from 001 never allowed it — those
-- UPDATEs fail, and the code does not inspect the error, so orders silently
-- stay 'pending'. Widen the constraint to the statuses actually in use.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'pending_review', 'refunded'));

/**
 * Atomically reserve `p_amount` USD against `p_day`'s budget.
 * Returns allowed=false and leaves the ledger untouched if it would breach the cap.
 */
CREATE OR REPLACE FUNCTION reserve_daily_redemption(
  p_day     DATE,
  p_amount  NUMERIC,
  p_cap     NUMERIC
)
RETURNS TABLE (allowed BOOLEAN, used_usd NUMERIC, remaining_usd NUMERIC)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'reserve_daily_redemption: amount must be positive (got %)', p_amount;
  END IF;

  INSERT INTO daily_redemption_caps (day, total_usd)
  VALUES (p_day, 0)
  ON CONFLICT (day) DO NOTHING;

  -- Row lock: concurrent reservations for the same day serialize here, which is
  -- what makes the cap hold under load.
  SELECT total_usd INTO v_total
  FROM daily_redemption_caps
  WHERE day = p_day
  FOR UPDATE;

  IF v_total + p_amount > p_cap THEN
    RETURN QUERY SELECT FALSE, v_total, GREATEST(0, p_cap - v_total);
    RETURN;
  END IF;

  UPDATE daily_redemption_caps
  SET total_usd = total_usd + p_amount, updated_at = NOW()
  WHERE day = p_day;

  RETURN QUERY SELECT TRUE, v_total + p_amount, GREATEST(0, p_cap - (v_total + p_amount));
END;
$$;

/**
 * Return `p_amount` USD to `p_day`'s budget after a failure or refund.
 * Clamped at zero so a double-release can never manufacture budget.
 */
CREATE OR REPLACE FUNCTION release_daily_redemption(
  p_day     DATE,
  p_amount  NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  UPDATE daily_redemption_caps
  SET total_usd = GREATEST(0, total_usd - p_amount), updated_at = NOW()
  WHERE day = p_day
  RETURNING total_usd INTO v_total;

  RETURN v_total;
END;
$$;

-- Ledger is service-role only — it must never be readable or writable from the browser
ALTER TABLE daily_redemption_caps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON daily_redemption_caps FROM anon, authenticated;
REVOKE ALL ON FUNCTION reserve_daily_redemption(DATE, NUMERIC, NUMERIC) FROM anon, authenticated;
REVOKE ALL ON FUNCTION release_daily_redemption(DATE, NUMERIC) FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_orders_cap_day ON orders (cap_day) WHERE cap_day IS NOT NULL;

-- Reload PostgREST schema cache so the new table/functions are callable immediately
NOTIFY pgrst, 'reload schema';
