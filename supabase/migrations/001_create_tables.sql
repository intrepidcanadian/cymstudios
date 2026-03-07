-- ============================================
-- CYM Studio Gift Card Catalogue
-- Supabase Migration: Create all required tables
-- ============================================

-- 1. BRANDS TABLE
-- Stores gift card catalogue synced from xRemit
-- ============================================
CREATE TABLE IF NOT EXISTS brands (
  product_id        INTEGER PRIMARY KEY,
  brand_name        TEXT NOT NULL,
  country_name      TEXT,
  currency          TEXT,
  product_image     TEXT,
  discount          NUMERIC DEFAULT 0,
  value_restrictions JSONB,
  denominations     JSONB,
  product_description TEXT,
  terms_and_conditions TEXT,
  how_to_use        TEXT,
  expiry_and_validity TEXT,
  cached_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_brands_country ON brands (country_name);
CREATE INDEX IF NOT EXISTS idx_brands_currency ON brands (currency);
CREATE INDEX IF NOT EXISTS idx_brands_brand_name ON brands (brand_name);
CREATE INDEX IF NOT EXISTS idx_brands_discount ON brands (discount) WHERE discount > 0;


-- 2. ORDERS TABLE
-- Tracks purchase lifecycle from payment through voucher delivery
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  order_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        INTEGER NOT NULL,
  brand_name        TEXT,
  country_name      TEXT,
  currency          TEXT,
  price             NUMERIC NOT NULL,
  user_id           TEXT,
  user_first_name   TEXT,
  user_last_name    TEXT,
  user_email        TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Payment details
  payment_network   TEXT DEFAULT 'ethereum',
  payment_tx        TEXT,

  -- xRemit IDs (populated after purchase submission)
  xremit_id         INTEGER,
  xremit_account_id INTEGER,

  -- Financial details (populated from xRemit response/webhook)
  partner_revenue_share_percent NUMERIC,
  voucher_discount_percent      NUMERIC,
  base_currency     TEXT,
  voucher_currency  TEXT,
  face_value        NUMERIC,
  face_value_in_base_currency NUMERIC,
  cost              NUMERIC,
  commission        NUMERIC,
  phaze_commission  NUMERIC,
  delivery_fee      NUMERIC,
  transaction_fee   NUMERIC,
  transaction_type  TEXT,
  currency_conversions JSONB,

  -- Voucher details (populated from webhook)
  voucher_code      TEXT,
  voucher_pin       TEXT,
  voucher_validity_date TEXT,
  vouchers          JSONB,        -- Full voucher array from xRemit

  -- Product info (populated from xRemit response)
  product_name      TEXT,
  product_description TEXT,
  terms_and_conditions TEXT,
  how_to_use        TEXT,
  expiry_and_validity TEXT,
  product_image     TEXT,

  -- Error tracking
  error_message     TEXT,

  -- xRemit timestamps
  xremit_created_at TIMESTAMPTZ,
  xremit_updated_at TIMESTAMPTZ,

  -- Webhook audit
  webhook_received_at TIMESTAMPTZ,
  webhook_payload   JSONB,        -- Complete webhook payload for audit

  -- Record timestamps
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for order lookups
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_user_email ON orders (user_email);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);


-- 3. EXCHANGE RATES TABLE
-- Caches FX rates from API Layer to reduce API calls
-- ============================================
CREATE TABLE IF NOT EXISTS exchange_rates (
  id                TEXT PRIMARY KEY DEFAULT 'usd_rates',
  rates             JSONB NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with an empty rates row so upserts work
INSERT INTO exchange_rates (id, rates, updated_at)
VALUES ('usd_rates', '{}', NOW())
ON CONFLICT (id) DO NOTHING;


-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Brands: public read access, service role write
CREATE POLICY "brands_public_read" ON brands
  FOR SELECT USING (true);

CREATE POLICY "brands_service_write" ON brands
  FOR ALL USING (auth.role() = 'service_role');

-- Orders: service role only (all access through API routes)
CREATE POLICY "orders_service_all" ON orders
  FOR ALL USING (auth.role() = 'service_role');

-- Exchange rates: service role only
CREATE POLICY "exchange_rates_service_all" ON exchange_rates
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================
-- HELPER: Updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
