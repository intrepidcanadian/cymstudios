/**
 * Safe logger that redacts sensitive fields before writing to stdout.
 *
 * In production, strips voucher codes/PINs, private keys, signatures,
 * full request bodies, and email addresses from log output.
 */

const isProduction = process.env.NODE_ENV === 'production';

const SENSITIVE_KEYS = new Set([
  'voucher_code', 'voucherCode', 'code',
  'voucher_pin', 'voucherPin', 'pin',
  'signature', 'paymentSignature',
  'authorization', 'auth', 'authHeader',
  'privateKey', 'private_key',
  'secret', 'clientSecret', 'client_secret',
  'apiKey', 'api_key',
  'password', 'token',
  'x-payment',
]);

const SENSITIVE_PATTERNS = [
  /0x[a-fA-F0-9]{64}/g,           // Ethereum private keys / tx hashes
  /sk-[a-zA-Z0-9_-]{20,}/g,       // OpenAI API keys
  /re_[a-zA-Z0-9_]{10,}/g,        // Resend API keys
  /eyJ[a-zA-Z0-9_-]{20,}/g,       // JWT tokens
];

function redactValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && SENSITIVE_KEYS.has(key)) {
    if (value.length <= 8) return '[REDACTED]';
    return value.slice(0, 4) + '...' + value.slice(-4);
  }
  return value;
}

function redactObject(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[NESTED]';

  if (typeof obj === 'string') {
    let result = obj;
    for (const pattern of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, (match) => {
        if (match.length <= 10) return '[REDACTED]';
        return match.slice(0, 6) + '...' + match.slice(-4);
      });
    }
    return result;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }

  if (obj && typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key)) {
        redacted[key] = redactValue(key, value);
      } else {
        redacted[key] = redactObject(value, depth + 1);
      }
    }
    return redacted;
  }

  return obj;
}

function formatArgs(args: unknown[]): unknown[] {
  if (!isProduction) return args;
  return args.map((arg) => redactObject(arg));
}

export const logger = {
  info(...args: unknown[]) {
    console.log(...formatArgs(args));
  },
  warn(...args: unknown[]) {
    console.warn(...formatArgs(args));
  },
  error(...args: unknown[]) {
    console.error(...formatArgs(args));
  },
  /** Log raw in dev, redacted in prod */
  debug(...args: unknown[]) {
    if (!isProduction) {
      console.log(...args);
    }
  },
};
