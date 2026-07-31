import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getPriceQuote,
  isQuotableCurrency,
  resolveRebateDiscount,
  QUOTABLE_CURRENCIES,
} from '@/lib/exchange-rates';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Quote Endpoint
 *
 * GET /api/quote?productId=123[&price=50]
 *
 * The ONLY place the client learns what a card costs. The fee formula, the
 * discount rebate, and the freshness policy all live server-side — the client
 * multiplies or displays, it never computes price.
 *
 * Prices on the same fresh rate /api/purchase settles against, and applies the
 * same catalogue-freshness guardrail to the rebate, so the quoted amount is the
 * amount charged.
 *
 * Without `price`: returns `effectiveRate` for cheap client-side previews across
 * many denominations (display only).
 * With `price`: returns the exact `usdcAmount` for that face value.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const productIdRaw = params.get('productId');
    const priceRaw = params.get('price');

    const productId = productIdRaw ? parseInt(productIdRaw, 10) : NaN;
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid productId' },
        { status: 400 }
      );
    }

    let price: number | null = null;
    if (priceRaw !== null) {
      price = Number(priceRaw);
      if (!Number.isFinite(price) || price <= 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid price' },
          { status: 400 }
        );
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Discount comes from our own catalogue row, never from the client — it
    // directly reduces what we charge.
    const { data: product, error: productError } = await supabase
      .from('brands')
      .select('product_id, currency, discount, cached_at')
      .eq('product_id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { success: false, error: `Product ID ${productId} not found` },
        { status: 404 }
      );
    }

    const currency = (product.currency || 'USD').toUpperCase();

    if (!isQuotableCurrency(currency)) {
      return NextResponse.json(
        {
          success: false,
          error: `${currency} is not available for purchase.`,
          code: 'CURRENCY_NOT_SUPPORTED',
          currency,
          supported: QUOTABLE_CURRENCIES,
        },
        { status: 400 }
      );
    }

    const rebateDiscount = resolveRebateDiscount(product.discount, product.cached_at);

    // Quote on 1 unit when no price given — effectiveRate is price-independent,
    // so this yields the multiplier without committing to a denomination.
    const quote = await getPriceQuote(price ?? 1, currency, rebateDiscount);

    return NextResponse.json({
      success: true,
      productId,
      currency,
      effectiveRate: quote.effectiveRate,
      effectiveFeePercent: quote.effectiveFeePercent,
      discountApplied: rebateDiscount,
      // Round up to the cent so the displayed figure is never under what the
      // signed authorization will ask for.
      usdcAmount: price !== null ? (Math.ceil(quote.amount * 100) / 100).toFixed(2) : null,
      rateAgeMs: quote.rateAgeMs,
      degraded: quote.degraded,
      quotedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Quote] Failed:', message);

    // Pricing failures are a service condition, not a bad request — the client
    // blocks submission on this rather than guessing an amount.
    return NextResponse.json(
      {
        success: false,
        error: 'Unable to price this item right now. Please try again in a moment.',
        code: 'QUOTE_UNAVAILABLE',
      },
      { status: 503 }
    );
  }
}
