/**
 * xRemit API utility functions
 * Handles authentication and API calls to xRemit
 */

import crypto from 'crypto';

// Helper to get environment variable (works in both Next.js and Node.js)
function getEnvVar(key: string): string | undefined {
  return process.env[key];
}

// xRemit API configuration
// Priority: EXTERNAL_BRANDS_API_URL override > XREMIT_ENV selection > sandbox default
const XREMIT_BASE_URL = process.env.EXTERNAL_BRANDS_API_URL
  ? process.env.EXTERNAL_BRANDS_API_URL.replace(/\/api\/v1\/?$/, '')
  : (process.env.XREMIT_ENV === 'production'
    ? 'https://rewardsapi.xremit.io'
    : 'https://rewardsapi-sandbox.xremit.io');

function getXremitConfig() {
  const apiKey = getEnvVar('EXTERNAL_API_KEY');
  const clientSecret = getEnvVar('EXTERNAL_CLIENT_SECRET');

  if (!apiKey || !clientSecret) {
    console.error('Missing xRemit credentials:');
    console.error('  EXTERNAL_API_KEY:', apiKey ? '✓ Set' : '✗ Missing');
    console.error('  EXTERNAL_CLIENT_SECRET:', clientSecret ? '✓ Set' : '✗ Missing');
  }

  return { apiKey, clientSecret };
}

/**
 * Generate HMAC SHA-256 signature for xRemit API
 */
export function generateXremitSignature(
  method: string,
  uri: string,
  body: string = '',
  clientSecret?: string
): string {
  const { clientSecret: defaultSecret } = getXremitConfig();
  const secret = clientSecret || defaultSecret;

  if (!secret) {
    throw new Error('EXTERNAL_CLIENT_SECRET not configured');
  }

  const payload = `${method}${uri}${secret}${body}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Fetch transaction details from xRemit by order ID
 * Use this as a fallback if webhook doesn't arrive
 */
export async function fetchXremitTransaction(orderId: string) {
  const { apiKey, clientSecret } = getXremitConfig();

  if (!apiKey || !clientSecret) {
    throw new Error('xRemit API credentials not configured');
  }

  const uri = `/transaction/${orderId}`;
  const signature = generateXremitSignature('GET', uri, '', clientSecret);

  const url = `${XREMIT_BASE_URL}/api/v1${uri}`;
  console.log(`Fetching from: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'API-Key': apiKey,
      'Signature': signature,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    let errorMessage = `xRemit API error: ${response.status} ${response.statusText}`;
    try {
      const error = await response.json();
      errorMessage = error.message || error.error || errorMessage;
    } catch (e) {
      // Response might not be JSON
    }
    throw new Error(errorMessage);
  }

  return await response.json();
}

/**
 * Process xRemit transaction data and format for database
 * Maps the xRemit transaction lookup response to our database schema
 */
export function processXremitTransaction(xremitData: any) {
  const vouchers = xremitData.vouchers || [];
  const firstVoucher = vouchers[0] || {};

  // Calculate cost (face value minus commission)
  const cost = xremitData.cost || (xremitData.faceValue - (xremitData.commission || 0));

  return {
    status: xremitData.status === 'processed' ? 'completed' : xremitData.status,

    // xRemit details
    xremit_id: xremitData.id,
    xremit_account_id: xremitData.accountId,
    partner_revenue_share_percent: xremitData.partnerRevenueSharePercent,
    voucher_discount_percent: xremitData.voucherDiscountPercent,

    // Financial details
    base_currency: xremitData.baseCurrency,
    face_value: xremitData.faceValue,
    face_value_in_base_currency: xremitData.faceValueInBaseCurrency,
    cost: cost,
    transaction_fee: xremitData.transactionFee || xremitData.fxSurcharge || 0,
    delivery_fee: xremitData.deliveryFee || 0,
    commission: xremitData.commission || xremitData.commissionInCAD,
    phaze_commission: xremitData.phazeCommission || xremitData.phazeCommissionInCAD,
    voucher_currency: xremitData.voucherCurrency,
    transaction_type: xremitData.transactionType,

    // Voucher details (from first voucher in array)
    voucher_code: firstVoucher.code,
    voucher_pin: firstVoucher.pin,
    voucher_validity_date: firstVoucher.validityDate,
    vouchers: vouchers, // Store complete array of all vouchers (JSONB)

    // Product info
    product_name: xremitData.productName,
    product_description: xremitData.productDescription,
    terms_and_conditions: xremitData.termsAndConditions,
    how_to_use: xremitData.howToUse,
    expiry_and_validity: xremitData.expiryAndValidity,

    // Error tracking
    error_message: xremitData.error,

    // Timestamps
    xremit_created_at: xremitData.created_at,
    xremit_updated_at: xremitData.updated_at,
    webhook_received_at: new Date().toISOString(),
    webhook_payload: xremitData, // Store complete response for reference (JSONB)
    completed_at: xremitData.status === 'processed' ? new Date().toISOString() : null,
  };
}
