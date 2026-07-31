import { NextRequest, NextResponse } from 'next/server';
import { forceRefreshRates, getExchangeRateInfo } from '@/lib/exchange-rates';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Exchange Rate Refresh Cron
 *
 * Keeps the `exchange_rates` row warm so cache freshness doesn't depend on user
 * traffic. Without this, the cache is only ever written as a side effect of a
 * purchase — so a quiet period followed by a provider outage leaves settlement
 * pricing on a stale rate (or refusing outright, past the staleness ceiling).
 *
 * Run hourly. API Layer's free tier allows 100 calls/month, so hourly (~730)
 * needs a paid tier; drop to every 6h (~120) or daily if staying on free.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const queryToken = request.nextUrl.searchParams.get('secret') || '';
  // Vercel Cron sends "Bearer <CRON_SECRET>"
  return bearer === secret || queryToken === secret;
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await forceRefreshRates();
    const info = await getExchangeRateInfo();

    logger.info(`[Cron] Exchange rates refreshed: ${Object.keys(info.rates).length} currencies`);

    return NextResponse.json({
      success: true,
      currencies: Object.keys(info.rates).length,
      lastUpdated: info.lastUpdated,
      source: info.source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Cron] Exchange rate refresh failed:', message);

    // 500 so the scheduler surfaces the failure. The cached rate is still
    // serving requests until it crosses the staleness ceiling.
    return NextResponse.json(
      { success: false, error: `Exchange rate refresh failed: ${message}` },
      { status: 500 }
    );
  }
}
