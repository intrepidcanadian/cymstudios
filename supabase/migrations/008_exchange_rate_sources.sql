-- ============================================
-- Migration 008: Record which providers priced each FX snapshot
-- ============================================
-- Rates now come from an oracle (lib/fx-oracle.ts) that takes the median across
-- several independent providers rather than trusting one. This column stores
-- which sources responded, which were discarded as outliers, and how far apart
-- they were — so any order can be traced back to the evidence behind its rate.
--
-- Nullable: a snapshot written before this migration simply has no provenance.
--
-- Idempotent: safe to run on any environment.
-- ============================================

ALTER TABLE exchange_rates
  ADD COLUMN IF NOT EXISTS sources JSONB;

COMMENT ON COLUMN exchange_rates.sources IS
  'FX oracle provenance: respondedIds, failed[], perCurrency{sources,spreadPercent,excluded}';

-- Reload PostgREST schema cache so the new column is writable immediately
NOTIFY pgrst, 'reload schema';
