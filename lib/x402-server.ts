/**
 * x402 Server-Side Payment Verification and Settlement for Ethereum Mainnet
 *
 * This module handles x402 payments using USDC on Ethereum mainnet.
 * Only used for specific endpoints (e.g., vision-analysis) that require mainnet payments.
 *
 * IMPORTANT: This uses REAL USDC on Ethereum mainnet - not testnet!
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { extractPaymentTrackingData } from './payment-tracker';

// USDC contract on Ethereum Mainnet
export const USDC_CONTRACT_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
export const ETHEREUM_MAINNET_CHAIN_ID = 1;
export const FACILITATOR_ADDRESS_MAINNET = process.env.X402_MAINNET_FACILITATOR_ADDRESS || process.env.X402_FACILITATOR_ADDRESS || '0xc10561c1c0d718b3d362df9d510a1b4e4331a4ee';

// Ethereum Mainnet RPC URL
const ETHEREUM_MAINNET_RPC = process.env.ETHEREUM_MAINNET_RPC_URL || 'https://eth.llamarpc.com';

// EIP-3009 transferWithAuthorization ABI (subset of USDC contract)
const USDC_ABI = [
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
  'function authorizationState(address authorizer, bytes32 nonce) external view returns (bool)',
  'function balanceOf(address account) external view returns (uint256)'
];

/**
 * Payment requirement configuration for an endpoint
 */
export interface PaymentConfig {
  /** Price in USDC atomic units (6 decimals, e.g., 10000 = $0.01) */
  priceUsdc: number;
  /** Human-readable name for the endpoint */
  endpointName: string;
  /** Description for the payment */
  description?: string;
}

/**
 * Result of x402 verification
 */
export interface X402VerificationResult {
  /** Whether payment is verified */
  verified: boolean;
  /** The payer's address (if verified) */
  payerAddress?: string;
  /** Error response to return (if not verified) */
  errorResponse?: NextResponse;
  /** Payment tracking data (if verified) */
  paymentTracking?: any;
  /** Transaction hash if payment was settled on-chain */
  transactionHash?: string;
}

/**
 * Result of on-chain settlement
 */
interface SettlementResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

/**
 * Execute transferWithAuthorization on-chain to settle the payment (Ethereum Mainnet)
 */
async function settlePaymentOnChain(
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  },
  signature: string
): Promise<SettlementResult> {
  const facilitatorPrivateKey = process.env.FACILITATOR_MAINNET_PRIVATE_KEY || process.env.FACILITATOR_PRIVATE_KEY;

  if (!facilitatorPrivateKey) {
    console.error('[x402] FACILITATOR_MAINNET_PRIVATE_KEY not configured');
    return {
      success: false,
      error: 'Payment settlement not configured. Please set FACILITATOR_MAINNET_PRIVATE_KEY.'
    };
  }

  try {
    console.log('[x402] Connecting to Ethereum Mainnet for settlement...');

    // Connect to Ethereum Mainnet
    const provider = new ethers.JsonRpcProvider(ETHEREUM_MAINNET_RPC);
    const facilitatorWallet = new ethers.Wallet(facilitatorPrivateKey, provider);

    // Verify facilitator address matches
    const walletAddress = facilitatorWallet.address.toLowerCase();
    if (walletAddress !== FACILITATOR_ADDRESS_MAINNET.toLowerCase()) {
      console.warn(`[x402] Facilitator wallet mismatch: ${walletAddress} vs ${FACILITATOR_ADDRESS_MAINNET}`);
    }

    // Create USDC contract instance
    const usdcContract = new ethers.Contract(USDC_CONTRACT_MAINNET, USDC_ABI, facilitatorWallet);

    // Check if authorization has already been used
    const isUsed = await usdcContract.authorizationState(authorization.from, authorization.nonce);
    if (isUsed) {
      console.log('[x402] Authorization nonce already used - payment already settled');
      return {
        success: true,
        transactionHash: 'already-settled'
      };
    }

    // Check payer's USDC balance
    const payerBalance = await usdcContract.balanceOf(authorization.from);
    const requiredAmount = BigInt(authorization.value);
    if (payerBalance < requiredAmount) {
      console.error(`[x402] Insufficient USDC balance: ${payerBalance} < ${requiredAmount}`);
      return {
        success: false,
        error: `Insufficient USDC balance. Required: ${Number(requiredAmount) / 1_000_000} USDC, Available: ${Number(payerBalance) / 1_000_000} USDC`
      };
    }

    // Split signature into v, r, s components
    const sig = ethers.Signature.from(signature);
    const v = sig.v;
    const r = sig.r;
    const s = sig.s;

    console.log('[x402] Submitting transferWithAuthorization on Ethereum Mainnet...');
    console.log(`  From: ${authorization.from}`);
    console.log(`  To: ${authorization.to}`);
    console.log(`  Value: ${authorization.value} (${Number(authorization.value) / 1_000_000} USDC)`);
    console.log(`  Nonce: ${authorization.nonce}`);

    // Call transferWithAuthorization
    const tx = await usdcContract.transferWithAuthorization(
      authorization.from,
      authorization.to,
      authorization.value,
      authorization.validAfter,
      authorization.validBefore,
      authorization.nonce,
      v,
      r,
      s
    );

    console.log(`[x402] Transaction submitted: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      console.log(`[x402] Payment settled on Ethereum Mainnet: ${tx.hash}`);
      return {
        success: true,
        transactionHash: tx.hash
      };
    } else {
      console.error('[x402] Transaction failed:', receipt);
      return {
        success: false,
        error: 'Transaction failed on-chain'
      };
    }

  } catch (error) {
    console.error('[x402] Settlement error:', error);

    if (error instanceof Error) {
      if (error.message.includes('insufficient funds')) {
        return {
          success: false,
          error: 'Facilitator has insufficient ETH for gas'
        };
      }
      if (error.message.includes('authorization is used')) {
        return {
          success: true,
          transactionHash: 'already-settled'
        };
      }
      if (error.message.includes('invalid signature')) {
        return {
          success: false,
          error: 'Invalid payment signature'
        };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Settlement failed'
    };
  }
}

/**
 * Verify x402 payment header or return 402 Payment Required (Ethereum Mainnet USDC)
 *
 * Usage:
 * ```ts
 * const verification = await verifyX402Payment(req, {
 *   priceUsdc: 10000, // $0.01
 *   endpointName: 'Vision Analysis'
 * });
 *
 * if (!verification.verified) {
 *   return verification.errorResponse;
 * }
 * ```
 */
export async function verifyX402Payment(
  req: NextRequest,
  config: PaymentConfig
): Promise<X402VerificationResult> {
  const { priceUsdc, endpointName, description } = config;

  // If endpoint is free, skip payment verification
  if (priceUsdc === 0) {
    return { verified: true };
  }

  // Check for x402 payment header
  const paymentHeader = req.headers.get('x-payment');

  if (!paymentHeader) {
    // No payment provided - return 402 Payment Required
    const paymentRequirement = {
      asset: USDC_CONTRACT_MAINNET,
      network: 'ethereum',
      chainId: ETHEREUM_MAINNET_CHAIN_ID,
      payTo: FACILITATOR_ADDRESS_MAINNET,
      maxAmountRequired: priceUsdc.toString(),
      extra: {
        name: 'USD Coin',
        version: '2'
      }
    };

    const paymentTracking = extractPaymentTrackingData(
      paymentRequirement,
      endpointName,
      req.nextUrl.pathname
    );

    const errorResponse = NextResponse.json(
      {
        error: 'Payment required',
        accepts: [paymentRequirement],
        maxAmountRequired: priceUsdc.toString(),
        x402Payment: paymentTracking,
        endpoint_name: endpointName,
        description: description || `Payment for ${endpointName}`,
      },
      { status: 402 }
    );

    return { verified: false, errorResponse };
  }

  // Payment header exists - verify signature
  try {
    const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
    const paymentData = JSON.parse(decoded);

    const { payload } = paymentData;

    if (!payload || !payload.signature || !payload.authorization) {
      return {
        verified: false,
        errorResponse: NextResponse.json(
          { success: false, error: 'Invalid x402 payment format. Expected payload.authorization.' },
          { status: 400 }
        )
      };
    }

    const { signature, authorization } = payload;
    const { from, to, value, validAfter, validBefore, nonce } = authorization;

    // Reconstruct EIP-712 domain for USDC on Ethereum Mainnet
    // IMPORTANT: USDC contract uses "USD Coin" as the domain name (from contract.name())
    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId: ETHEREUM_MAINNET_CHAIN_ID,
      verifyingContract: USDC_CONTRACT_MAINNET,
    };

    // EIP-712 types for TransferWithAuthorization
    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    // Reconstruct message
    const message = {
      from,
      to,
      value,
      validAfter: parseInt(validAfter),
      validBefore: parseInt(validBefore),
      nonce,
    };

    // Recover signer address
    const recoveredAddress = ethers.verifyTypedData(domain, types, message, signature);
    const payerAddress = recoveredAddress.toLowerCase();

    // Verify recovered address matches 'from'
    if (payerAddress !== from.toLowerCase()) {
      return {
        verified: false,
        errorResponse: NextResponse.json(
          { success: false, error: 'Payment signature does not match sender address' },
          { status: 400 }
        )
      };
    }

    // Verify payment amount
    if (BigInt(value) < BigInt(priceUsdc)) {
      return {
        verified: false,
        errorResponse: NextResponse.json(
          {
            success: false,
            error: `Insufficient payment. Required: ${priceUsdc}, provided: ${value}`,
          },
          { status: 402 }
        )
      };
    }

    // Verify recipient
    const recipientAddress = to.toLowerCase();
    if (recipientAddress !== FACILITATOR_ADDRESS_MAINNET.toLowerCase()) {
      return {
        verified: false,
        errorResponse: NextResponse.json(
          { success: false, error: 'Invalid payment recipient' },
          { status: 400 }
        )
      };
    }

    // Verify timing
    const now = Math.floor(Date.now() / 1000);
    if (now < parseInt(validAfter)) {
      return {
        verified: false,
        errorResponse: NextResponse.json(
          { success: false, error: 'Payment authorization not yet valid' },
          { status: 400 }
        )
      };
    }
    if (now > parseInt(validBefore)) {
      return {
        verified: false,
        errorResponse: NextResponse.json(
          { success: false, error: 'Payment authorization has expired' },
          { status: 400 }
        )
      };
    }

    // Signature verified - now settle the payment on-chain
    console.log(`[x402] Signature verified for ${payerAddress}, settling payment on Ethereum Mainnet...`);

    const settlement = await settlePaymentOnChain(authorization, signature);

    if (!settlement.success) {
      console.error(`[x402] Settlement failed: ${settlement.error}`);
      return {
        verified: false,
        errorResponse: NextResponse.json(
          { success: false, error: settlement.error || 'Payment settlement failed' },
          { status: 402 }
        )
      };
    }

    // Create payment tracking data
    const paymentRequirement = {
      asset: USDC_CONTRACT_MAINNET,
      network: 'ethereum',
      chainId: ETHEREUM_MAINNET_CHAIN_ID,
      payTo: FACILITATOR_ADDRESS_MAINNET,
      maxAmountRequired: priceUsdc.toString(),
      extra: { name: 'USD Coin', version: '2' }
    };
    const paymentTracking = extractPaymentTrackingData(
      paymentRequirement,
      endpointName,
      req.nextUrl.pathname
    );

    console.log(`[x402] Payment settled: ${payerAddress} paid ${priceUsdc / 1_000_000} USDC for ${endpointName} (tx: ${settlement.transactionHash})`);

    return {
      verified: true,
      payerAddress,
      paymentTracking,
      transactionHash: settlement.transactionHash
    };

  } catch (error) {
    console.error('[x402] Payment verification error:', error);
    return {
      verified: false,
      errorResponse: NextResponse.json(
        { success: false, error: `Invalid payment signature: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 400 }
      )
    };
  }
}

/**
 * Get x402 payment requirement for Ethereum Mainnet (for client-side use)
 */
export function getX402PaymentRequirement(priceUsdc: number, endpointName: string) {
  return {
    asset: USDC_CONTRACT_MAINNET,
    network: 'ethereum',
    chainId: ETHEREUM_MAINNET_CHAIN_ID,
    payTo: FACILITATOR_ADDRESS_MAINNET,
    maxAmountRequired: priceUsdc.toString(),
    extra: {
      name: 'USD Coin',
      version: '2'
    },
    endpoint_name: endpointName
  };
}
