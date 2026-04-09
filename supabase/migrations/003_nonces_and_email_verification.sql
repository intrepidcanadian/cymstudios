-- ============================================
-- Migration 003: Nonce tracking + email verification + pending review resolution
-- Implements M7 (replay protection), M8 (OTP), M10 (cron support)
-- ============================================

-- ============================================
-- M7: used_nonces — replay protection for x402 EIP-3009 authorizations
-- ============================================
-- The on-chain contract enforces nonce uniqueness, but only after settlement confirms.
-- Race window: between signature submission and on-chain confirmation, the same nonce
-- could be replayed. This table closes the window by INSERT-then-settle.
CREATE TABLE IF NOT EXISTS used_nonces (
  from_address  TEXT NOT NULL,
  nonce         TEXT NOT NULL,
  network       TEXT NOT NULL,
  order_id      UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (from_address, nonce)
);

CREATE INDEX IF NOT EXISTS idx_used_nonces_created_at ON used_nonces (created_at DESC);

ALTER TABLE used_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "used_nonces_service_all" ON used_nonces
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================
-- M8: email_otps — short-lived OTP codes for email verification
-- ============================================
CREATE TABLE IF NOT EXISTS email_otps (
  email         TEXT PRIMARY KEY,
  code_hash     TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_expires_at ON email_otps (expires_at);

ALTER TABLE email_otps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_otps_service_all" ON email_otps
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================
-- M8: verified_emails — emails that have completed OTP verification
-- ============================================
CREATE TABLE IF NOT EXISTS verified_emails (
  email         TEXT PRIMARY KEY,
  verified_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE verified_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verified_emails_service_all" ON verified_emails
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================
-- M10: Index to make pending_review cron query fast
-- ============================================
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
  ON orders (status, created_at)
  WHERE status IN ('pending_review', 'pending', 'processing');
