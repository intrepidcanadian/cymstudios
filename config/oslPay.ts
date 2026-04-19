// OSL Pay Configuration
// Based on official documentation: https://www.osl-pay.com/api-doc/startHere/quickStart

export const OSL_PAY_CONFIG = {
  // Environment
  isTestMode: process.env.NODE_ENV === 'development',

  // Base URLs
  baseUrl: process.env.NODE_ENV === 'development'
    ? 'https://ramptest.osl-pay.com'
    : 'https://ramp.osl-pay.com',

  // Merchant Configuration (should be stored securely on server)
  merchant: {
    appId: process.env.NEXT_PUBLIC_OSL_APP_ID,
    secret: process.env.OSL_SECRET || '',
    webhookPublicKey: process.env.OSL_WEBHOOK_PUBLIC_KEY || '',
  },

  // Supported cryptocurrencies and networks (only those that actually produce quotes)
  supportedCryptos: [
    { value: 'BTC', label: 'Bitcoin (BTC)', networks: ['BTC', 'BEP20', 'LIGHTNING'] },
    { value: 'USDT', label: 'Tether (USDT)', networks: ['ERC20', 'BEP20', 'ArbitrumOne', 'SOL', 'Optimism', 'Polygon', 'AVAXC-Chain', 'Aptos', 'TON', 'Morph', 'TRC20'] },
    { value: 'USDC', label: 'USD Coin (USDC)', networks: ['ERC20', 'BEP20', 'SOL', 'Polygon', 'Aptos', 'BASE', 'ArbitrumOne', 'AVAXC-Chain', 'Noble', 'Morph'] },
    { value: 'ETH', label: 'Ethereum (ETH)', networks: ['ETH', 'BEP20', 'ArbitrumOne', 'Optimism', 'SCROLL', 'Starknet', 'zkSyncEra', 'Morph', 'LINEA', 'BASE'] },
    { value: 'BNB', label: 'Binance Coin (BNB)', networks: ['BEP20'] },
    { value: 'SOL', label: 'Solana (SOL)', networks: ['SOL'] }
  ],

  // Supported fiat currencies
  supportedFiat: [
    { value: 'USD', label: 'US Dollar' },
    { value: 'EUR', label: 'Euro' },
    { value: 'GBP', label: 'British Pound' },
    { value: 'HKD', label: 'Hong Kong Dollar' },
  ],

  // Payment methods
  paymentMethods: [
    { value: 'CARD_PAYMENT', label: 'Credit Card' },
    { value: 'GOOGLE_PAY', label: 'Google Pay' },
    { value: 'APPLE_PAY', label: 'Apple Pay' },
  ],

  // Amount limits
  amountLimits: {
    min: 15,
    max: 10000,
    default: 15,
  },

  // Callback URLs
  callbacks: {
    success: process.env.NEXT_PUBLIC_OSL_SUCCESS_URL || 'https://cymstudio.app/onramp?status=success',
    fail: process.env.NEXT_PUBLIC_OSL_FAIL_URL || 'https://cymstudio.app/onramp?status=fail',
    webhook: process.env.NEXT_PUBLIC_OSL_WEBHOOK_URL || '',
  },
};

// OSL Pay URL generation types
export interface OslPayUrlParams {
  appId: string;
  amount?: number;
  crypto?: string;
  network?: string;
  fiatCurrency?: string;
  payWayCode?: string;
  email?: string;
  accessToken?: string;
  merchantUser?: string;
  merchantOrder?: string;
  address?: string;
  successUrl?: string;
  failUrl?: string;
  callbackUrl?: string;
  checkType?: 'DEFI_AUTH' | 'DEFI_BIND';
  useBorder?: boolean;
  locale?: string;
}

// Generate merchant order ID
export function generateMerchantOrder(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `order_${timestamp}_${random}`;
}

// Generate merchant user ID
export function generateMerchantUser(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `user_${timestamp}_${random}`;
}

// Validate OSL Pay parameters
export function validateOslPayParams(params: OslPayUrlParams): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (params.amount) {
    if (params.amount < OSL_PAY_CONFIG.amountLimits.min || params.amount > OSL_PAY_CONFIG.amountLimits.max) {
      errors.push(`Amount must be between $${OSL_PAY_CONFIG.amountLimits.min} and $${OSL_PAY_CONFIG.amountLimits.max}`);
    }
  }

  if (params.crypto) {
    const supportedCrypto = OSL_PAY_CONFIG.supportedCryptos.find(c => c.value === params.crypto);
    if (!supportedCrypto) {
      errors.push(`Unsupported cryptocurrency: ${params.crypto}`);
    }
  }

  if (params.network && params.crypto) {
    const supportedCrypto = OSL_PAY_CONFIG.supportedCryptos.find(c => c.value === params.crypto);
    if (supportedCrypto && !supportedCrypto.networks.includes(params.network)) {
      errors.push(`Network ${params.network} not supported for ${params.crypto}`);
    }
  }

  if (params.payWayCode) {
    const supportedMethod = OSL_PAY_CONFIG.paymentMethods.find(m => m.value === params.payWayCode);
    if (!supportedMethod) {
      errors.push(`Unsupported payment method: ${params.payWayCode}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
