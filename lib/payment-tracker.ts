/**
 * x402 Payment Tracker
 * Helper utilities for tracking x402 payments across API routes
 */

export interface PaymentTrackingData {
  amount: string; // USDC amount in atomic units
  amountUSDC: string; // Human-readable USDC amount
  asset: string; // Token contract address
  recipient: string; // Payment recipient address
  network: string; // Network (e.g., ethereum)
  signature?: string; // EIP-712 signature
  transactionHash?: string; // On-chain tx hash (if executed)
  paymentStatus: 'pending' | 'signed' | 'executed' | 'failed';
  timestamp: number;
  toolName?: string; // Associated tool name
  apiEndpoint?: string; // API endpoint that required payment
}

/**
 * Extract payment tracking data from x402 payment requirement
 */
export function extractPaymentTrackingData(
  paymentRequirement: any,
  toolName?: string,
  apiEndpoint?: string
): PaymentTrackingData {
  // Extract amount
  const amount = paymentRequirement.maxAmountRequired || '0';

  // Convert to human-readable USDC (6 decimals)
  const amountBigInt = BigInt(amount);
  const usdcDecimals = BigInt(1000000);
  const wholePart = amountBigInt / usdcDecimals;
  const fractionalPart = amountBigInt % usdcDecimals;
  const amountUSDC = fractionalPart === BigInt(0)
    ? wholePart.toString()
    : `${wholePart}.${fractionalPart.toString().padStart(6, '0').replace(/0+$/, '')}`;

  // Extract asset and network info
  const asset = typeof paymentRequirement.asset === 'string'
    ? paymentRequirement.asset
    : paymentRequirement.asset?.address || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  const network = paymentRequirement.network || 'ethereum';
  const recipient = paymentRequirement.payTo || paymentRequirement.recipient || '';

  return {
    amount,
    amountUSDC,
    asset,
    recipient,
    network,
    paymentStatus: 'pending',
    timestamp: Date.now(),
    toolName,
    apiEndpoint
  };
}

/**
 * Update payment tracking with signature
 */
export function updatePaymentWithSignature(
  tracking: PaymentTrackingData,
  signature: string
): PaymentTrackingData {
  return {
    ...tracking,
    signature,
    paymentStatus: 'signed',
    timestamp: Date.now()
  };
}

/**
 * Update payment tracking with transaction hash
 */
export function updatePaymentWithTxHash(
  tracking: PaymentTrackingData,
  transactionHash: string
): PaymentTrackingData {
  return {
    ...tracking,
    transactionHash,
    paymentStatus: 'executed',
    timestamp: Date.now()
  };
}

/**
 * Mark payment as failed
 */
export function markPaymentFailed(
  tracking: PaymentTrackingData,
  error?: string
): PaymentTrackingData {
  return {
    ...tracking,
    paymentStatus: 'failed',
    timestamp: Date.now()
  };
}

/**
 * Format payment tracking for API response
 * This can be included in API responses so the client can add it to MCP logs
 */
export function formatPaymentTrackingForResponse(tracking: PaymentTrackingData) {
  return {
    x402Payment: tracking
  };
}
