import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Next.js middleware — applies rate limiting to all API routes.
 */

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { success: false, error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
      },
    }
  );
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const ip = getClientIp(request);

  // Determine which rate limit config to use
  let config;
  let key: string;

  if (path.startsWith('/api/purchase')) {
    config = RATE_LIMITS.purchase;
    key = `purchase:${ip}`;
  } else if (path.startsWith('/api/webhook')) {
    config = RATE_LIMITS.webhook;
    key = `webhook:${ip}`;
  } else if (path.startsWith('/api/sync-brands')) {
    config = RATE_LIMITS.sync;
    key = `sync:${ip}`;
  } else if (path.startsWith('/api/orders')) {
    config = RATE_LIMITS.orders;
    key = `orders:${ip}`;
  } else if (path.startsWith('/api/brands') || path.startsWith('/api/mastercards')) {
    config = RATE_LIMITS.catalogue;
    key = `catalogue:${ip}`;
  } else if (path.startsWith('/api/exchange-rate')) {
    config = RATE_LIMITS.exchangeRate;
    key = `exchange:${ip}`;
  } else {
    // No rate limit for non-API routes
    return NextResponse.next();
  }

  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    return rateLimitResponse(result.resetAt);
  }

  // Add rate limit headers to the response
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
