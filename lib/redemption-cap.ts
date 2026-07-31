/**
 * Daily Redemption Cap
 *
 * Bounds the total gift-card face value redeemed per day (midnight-to-midnight
 * Eastern), so outstanding exposure is predictable and float can be replenished
 * on a fixed cycle.
 *
 * Measured in USD face value — the inventory actually issued — not the USDC
 * collected (which includes the service fee and isn't what needs replenishing).
 *
 * Reserve/release is done in Postgres under a row lock, not here. A
 * read-then-write in JS would let two concurrent purchases both see the same
 * remaining budget and both settle. See migration 007.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

/** Default cap in USD face value per Eastern day. Override with DAILY_REDEMPTION_CAP_USD. */
const DEFAULT_CAP_USD = 1000;

export function getDailyCapUsd(): number {
  const raw = process.env.DAILY_REDEMPTION_CAP_USD;
  if (!raw) return DEFAULT_CAP_USD;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(`[Cap] Invalid DAILY_REDEMPTION_CAP_USD="${raw}", falling back to $${DEFAULT_CAP_USD}`);
    return DEFAULT_CAP_USD;
  }
  return parsed;
}

/**
 * The cap resets at NOON Eastern. Using the IANA zone rather than a fixed
 * offset means DST is handled for us — EST/EDT switches automatically, so the
 * reset stays at local noon year-round instead of drifting an hour.
 */
const CAP_TIMEZONE = 'America/New_York';
const CAP_RESET_HOUR = 12;

/**
 * The ledger key for the period containing `now`, as YYYY-MM-DD.
 *
 * The label is the DATE THE PERIOD OPENED, not the calendar date of `now`:
 * period `2026-07-30` runs noon 30 Jul ET → noon 31 Jul ET. So 09:00 ET on the
 * 31st still belongs to `2026-07-30`.
 *
 * Implemented by reading the Eastern wall-clock hour and stepping back a
 * calendar day when it's before noon. Note this is NOT the same as subtracting
 * 12h of absolute time and taking the date — that approach is off by exactly
 * the lost hour on spring-forward, because the 12h before noon EDT spans the
 * skipped 02:00 hour. Comparing wall-clock hours sidesteps that entirely.
 */
export function currentCapDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23', // guarantee 0–23; some ICU builds emit "24" for midnight
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));

  // Before the reset, we're still inside the period that opened the previous day
  const startOfPeriod = Date.UTC(year, month - 1, day) - (hour < CAP_RESET_HOUR ? 86_400_000 : 0);

  // Pure calendar arithmetic on a UTC anchor — no timezone involved, so no DST risk
  return new Date(startOfPeriod).toISOString().slice(0, 10);
}

export interface CapReservation {
  allowed: boolean;
  usedUsd: number;
  remainingUsd: number;
  capUsd: number;
  day: string;
}

/**
 * Atomically reserve `amountUsd` against today's budget.
 *
 * Fails CLOSED: if the ledger can't be reached we refuse the purchase rather
 * than settle an unbounded amount. An outage should stop sales, not uncap them.
 */
export async function reserveDailyRedemption(
  supabase: SupabaseClient,
  amountUsd: number,
): Promise<CapReservation> {
  const day = currentCapDay();
  const capUsd = getDailyCapUsd();

  // Round to cents — the ledger column is NUMERIC(14,2) and would round anyway;
  // doing it here keeps the reserved and released figures identical.
  const amount = Math.ceil(amountUsd * 100) / 100;

  const { data, error } = await supabase.rpc('reserve_daily_redemption', {
    p_day: day,
    p_amount: amount,
    p_cap: capUsd,
  });

  if (error) {
    logger.error('[Cap] Reservation failed:', error.message);
    throw new Error('Unable to verify daily redemption capacity');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Unable to verify daily redemption capacity');
  }

  return {
    allowed: Boolean(row.allowed),
    usedUsd: Number(row.used_usd ?? 0),
    remainingUsd: Number(row.remaining_usd ?? 0),
    capUsd,
    day,
  };
}

/**
 * Return budget after a failed or refunded order. Never throws — a release
 * failure must not mask the original error that triggered it; it's logged loudly
 * because the day's budget will read high until corrected.
 */
export async function releaseDailyRedemption(
  supabase: SupabaseClient,
  day: string | null | undefined,
  amountUsd: number | null | undefined,
  context: string,
): Promise<void> {
  if (!day || !amountUsd || amountUsd <= 0) return;

  try {
    const { error } = await supabase.rpc('release_daily_redemption', {
      p_day: day,
      p_amount: amountUsd,
    });
    if (error) {
      logger.error(`[Cap] RELEASE FAILED (${context}) for ${day} / $${amountUsd} — daily budget will read high until corrected:`, error.message);
      return;
    }
    logger.info(`[Cap] Released $${amountUsd} back to ${day} (${context})`);
  } catch (err) {
    logger.error(`[Cap] RELEASE FAILED (${context}) for ${day} / $${amountUsd}:`, err instanceof Error ? err.message : 'Unknown');
  }
}

/** Read-only view of today's budget, for pre-flight checks and ops. */
export async function getDailyRedemptionStatus(
  supabase: SupabaseClient,
): Promise<{ day: string; usedUsd: number; remainingUsd: number; capUsd: number }> {
  const day = currentCapDay();
  const capUsd = getDailyCapUsd();

  const { data, error } = await supabase
    .from('daily_redemption_caps')
    .select('total_usd')
    .eq('day', day)
    .maybeSingle();

  if (error) {
    throw new Error('Unable to read daily redemption capacity');
  }

  const usedUsd = Number(data?.total_usd ?? 0);
  return { day, usedUsd, remainingUsd: Math.max(0, capUsd - usedUsd), capUsd };
}
