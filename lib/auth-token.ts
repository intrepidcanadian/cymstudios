/**
 * HMAC-signed auth tokens for order lookups.
 *
 * When a purchase is made, the API returns a signed token that encodes
 * the orderId + userId. The client must present this token to look up
 * order status, preventing enumeration attacks.
 *
 * Token format: base64url({ orderId, userId, exp }) + "." + hmacSignature
 */

import crypto from 'crypto';

const TOKEN_SECRET = process.env.ORDER_TOKEN_SECRET || process.env.CRON_SECRET;
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

interface TokenPayload {
  orderId: string;
  userId: string;
  exp: number;
}

function getSecret(): string {
  if (!TOKEN_SECRET) {
    throw new Error('ORDER_TOKEN_SECRET or CRON_SECRET must be set');
  }
  return TOKEN_SECRET;
}

function hmacSign(data: string): string {
  return crypto
    .createHmac('sha256', getSecret())
    .update(data)
    .digest('base64url');
}

/**
 * Generate a signed token for order lookup.
 */
export function generateOrderToken(orderId: string, userId: string): string {
  const payload: TokenPayload = {
    orderId,
    userId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = hmacSign(payloadB64);
  return `${payloadB64}.${signature}`;
}

/**
 * Verify a signed token and return the payload.
 * Returns null if the token is invalid or expired.
 */
export function verifyOrderToken(
  token: string,
  orderId: string
): TokenPayload | null {
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    // Verify HMAC
    const expectedSig = hmacSign(payloadB64);
    if (!crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig)
    )) {
      return null;
    }

    // Decode payload
    const payload: TokenPayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    );

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    // Check orderId matches
    if (payload.orderId !== orderId) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
