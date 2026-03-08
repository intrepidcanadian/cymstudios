/**
 * In-memory rate limiter for API routes.
 *
 * Uses a sliding window counter per IP address.
 * Suitable for single-instance deployments (VPS with PM2).
 * For multi-instance, swap to Redis-backed store.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  });
}, 5 * 60 * 1000);

interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    const resetAt = now + config.windowSeconds * 1000;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.limit - 1, resetAt };
  }

  if (entry.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

// Preset configs for different route types
export const RATE_LIMITS = {
  /** Purchase endpoint: 10 requests per minute per IP */
  purchase: { limit: 10, windowSeconds: 60 },
  /** Webhook: 30 requests per minute per IP (xRemit may batch) */
  webhook: { limit: 30, windowSeconds: 60 },
  /** Sync brands: 2 requests per 10 minutes per IP */
  sync: { limit: 2, windowSeconds: 600 },
  /** Order lookup: 30 requests per minute per IP */
  orders: { limit: 30, windowSeconds: 60 },
  /** Read-only catalogue: 60 requests per minute per IP */
  catalogue: { limit: 60, windowSeconds: 60 },
  /** Exchange rate: 60 requests per minute per IP */
  exchangeRate: { limit: 60, windowSeconds: 60 },
} as const;
