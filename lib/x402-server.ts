/**
 * x402 Server-Side Payment Verification and Settlement
 *
 * Supports two settlement strategies:
 * - eip3009: transferWithAuthorization (USDC on Ethereum/Base, USDT0 on Conflux eSpace)
 * - direct:  transferFrom after user approval (tokens without EIP-3009)
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { extractPaymentTrackingData } from './payment-tracker';
import { NETWORKS, FACILITATOR_ADDRESS, getNetwork, type NetworkConfig } from '@/config/networks';

// Token ABI covering both strategies
const TOKEN_ABI = [
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
  'function authorizationState(address authorizer, bytes32 nonce) external view returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function transferFrom(address from, address to, uint256 value) external returns (bool)',
];

export interface PaymentConfig {
  priceUsdc: number;
  endpointName: string;
  description?: string;
  network?: string;
}

export interface X402VerificationResult {
  verified: boolean;
  payerAddress?: string;
  errorResponse?: NextResponse;
  paymentTracking?: any;
  transactionHash?: string;
}

interface SettlementResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

/**
 * Settle via EIP-3009 transferWithAuthorization (gasless for user)
 */
async function settleEip3009(
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  },
  signature: string,
  networkConfig: NetworkConfig
): Promise<SettlementResult> {
  const facilitatorPrivateKey = process.env.FACILITATOR_MAINNET_PRIVATE_KEY || process.env.FACILITATOR_PRIVATE_KEY;
  if (!facilitatorPrivateKey) {
    return { success: false, error: 'Facilitator private key not configured' };
  }

  try {
    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    const facilitator = new ethers.Wallet(facilitatorPrivateKey, provider);
    const tokenContract = new ethers.Contract(networkConfig.tokenAddress, TOKEN_ABI, facilitator);

    // Check nonce
    const isUsed = await tokenContract.authorizationState(authorization.from, authorization.nonce);
    if (isUsed) {
      return { success: true, transactionHash: 'already-settled' };
    }

    // Check balance
    const balance = await tokenContract.balanceOf(authorization.from);
    if (balance < BigInt(authorization.value)) {
      console.error(`[x402] Insufficient balance: required ${Number(authorization.value) / 1_000_000}, available ${Number(balance) / 1_000_000}`);
      return {
        success: false,
        error: `Insufficient ${networkConfig.tokenSymbol} balance to complete this payment.`,
      };
    }

    const sig = ethers.Signature.from(signature);
    console.log(`[x402] Submitting transferWithAuthorization on ${networkConfig.name}...`);

    const tx = await tokenContract.transferWithAuthorization(
      authorization.from, authorization.to, authorization.value,
      authorization.validAfter, authorization.validBefore, authorization.nonce,
      sig.v, sig.r, sig.s
    );

    console.log(`[x402] TX submitted: ${tx.hash}`);
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      return { success: true, transactionHash: tx.hash };
    }
    return { success: false, error: 'Transaction failed on-chain' };

  } catch (error) {
    console.error('[x402] EIP-3009 settlement error:', error);
    if (error instanceof Error) {
      if (error.message.includes('insufficient funds')) {
        return { success: false, error: `Facilitator has insufficient ${networkConfig.nativeSymbol} for gas` };
      }
      if (error.message.includes('authorization is used')) {
        return { success: true, transactionHash: 'already-settled' };
      }
    }
    return { success: false, error: error instanceof Error ? error.message : 'Settlement failed' };
  }
}

/**
 * Settle via transferFrom after user approved the facilitator (Conflux USDT0 etc.)
 */
async function settleDirect(
  payload: { from: string; to: string; value: string; approvalTxHash: string },
  networkConfig: NetworkConfig
): Promise<SettlementResult> {
  const facilitatorPrivateKey = process.env.FACILITATOR_MAINNET_PRIVATE_KEY || process.env.FACILITATOR_PRIVATE_KEY;
  if (!facilitatorPrivateKey) {
    return { success: false, error: 'Facilitator private key not configured' };
  }

  try {
    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    const facilitator = new ethers.Wallet(facilitatorPrivateKey, provider);
    const tokenContract = new ethers.Contract(networkConfig.tokenAddress, TOKEN_ABI, facilitator);

    // Verify the approval tx was mined
    const approvalReceipt = await provider.getTransactionReceipt(payload.approvalTxHash);
    if (!approvalReceipt || approvalReceipt.status !== 1) {
      return { success: false, error: 'Approval transaction not confirmed' };
    }

    // Verify allowance
    const allowance = await tokenContract.allowance(payload.from, facilitator.address);
    const requiredAmount = BigInt(payload.value);
    if (allowance < requiredAmount) {
      console.error(`[x402] Insufficient allowance: required ${Number(requiredAmount) / 1_000_000}, approved ${Number(allowance) / 1_000_000}`);
      return {
        success: false,
        error: `Insufficient token allowance. Please re-approve the transaction.`,
      };
    }

    // Verify balance
    const balance = await tokenContract.balanceOf(payload.from);
    if (balance < requiredAmount) {
      console.error(`[x402] Insufficient balance: required ${Number(requiredAmount) / 1_000_000}, available ${Number(balance) / 1_000_000}`);
      return {
        success: false,
        error: `Insufficient ${networkConfig.tokenSymbol} balance to complete this payment.`,
      };
    }

    console.log(`[x402] Submitting transferFrom on ${networkConfig.name}...`);
    const tx = await tokenContract.transferFrom(payload.from, payload.to, payload.value);
    console.log(`[x402] TX submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt.status === 1) {
      return { success: true, transactionHash: tx.hash };
    }
    return { success: false, error: 'TransferFrom failed on-chain' };

  } catch (error) {
    console.error('[x402] Direct settlement error:', error);
    if (error instanceof Error && error.message.includes('insufficient funds')) {
      return { success: false, error: `Facilitator has insufficient ${networkConfig.nativeSymbol} for gas` };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Settlement failed' };
  }
}

/**
 * Resolve network from payment data
 */
function resolveNetwork(paymentData: any, config: PaymentConfig): NetworkConfig {
  const networkKey = paymentData?.network || config.network || 'ethereum';
  return getNetwork(networkKey);
}

/**
 * Verify x402 payment header or return 402 Payment Required
 */
export async function verifyX402Payment(
  req: NextRequest,
  config: PaymentConfig
): Promise<X402VerificationResult> {
  const { priceUsdc, endpointName, description } = config;

  if (priceUsdc === 0) {
    return { verified: true };
  }

  const paymentHeader = req.headers.get('x-payment');

  if (!paymentHeader) {
    // Return 402 with requirements for all supported networks
    const accepts = Object.entries(NETWORKS).map(([key, net]) => ({
      asset: net.tokenAddress,
      network: net.x402Network,
      chainId: net.chainId,
      payTo: FACILITATOR_ADDRESS,
      maxAmountRequired: priceUsdc.toString(),
      strategy: net.paymentStrategy,
      extra: {
        name: net.eip712Name,
        version: net.eip712Version,
      },
    }));

    const paymentTracking = extractPaymentTrackingData(
      accepts[0], endpointName, req.nextUrl.pathname
    );

    return {
      verified: false,
      errorResponse: NextResponse.json({
        error: 'Payment required',
        accepts,
        maxAmountRequired: priceUsdc.toString(),
        x402Payment: paymentTracking,
        endpoint_name: endpointName,
        description: description || `Payment for ${endpointName}`,
      }, { status: 402 }),
    };
  }

  // Verify payment
  try {
    const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
    const paymentData = JSON.parse(decoded);
    const { payload } = paymentData;

    if (!payload) {
      return {
        verified: false,
        errorResponse: NextResponse.json(
          { success: false, error: 'Invalid x402 payment format.' },
          { status: 400 }
        ),
      };
    }

    const networkConfig = resolveNetwork(paymentData, config);
    const strategy = paymentData.strategy || networkConfig.paymentStrategy;

    let settlement: SettlementResult;
    let payerAddress: string;

    if (strategy === 'direct') {
      // Direct strategy: user already approved, we call transferFrom
      const { from, to, value, approvalTxHash } = payload;
      if (!from || !to || !value || !approvalTxHash) {
        return {
          verified: false,
          errorResponse: NextResponse.json(
            { success: false, error: 'Invalid direct payment payload' },
            { status: 400 }
          ),
        };
      }

      payerAddress = from.toLowerCase();

      // Validate amount
      if (BigInt(value) < BigInt(priceUsdc)) {
        return {
          verified: false,
          errorResponse: NextResponse.json(
            { success: false, error: `Insufficient payment. Required: ${priceUsdc}, provided: ${value}` },
            { status: 402 }
          ),
        };
      }

      // Validate recipient
      if (to.toLowerCase() !== FACILITATOR_ADDRESS.toLowerCase()) {
        return {
          verified: false,
          errorResponse: NextResponse.json(
            { success: false, error: 'Invalid payment recipient' },
            { status: 400 }
          ),
        };
      }

      console.log(`[x402] Direct payment from ${payerAddress}, settling on ${networkConfig.name}...`);
      settlement = await settleDirect(payload, networkConfig);

    } else {
      // EIP-3009 strategy: verify signature then call transferWithAuthorization
      const { signature, authorization } = payload;
      if (!signature || !authorization) {
        return {
          verified: false,
          errorResponse: NextResponse.json(
            { success: false, error: 'Invalid eip3009 payment payload' },
            { status: 400 }
          ),
        };
      }

      const { from, to, value, validAfter, validBefore, nonce } = authorization;

      // Reconstruct EIP-712 domain and verify signature
      const domain = {
        name: networkConfig.eip712Name,
        version: networkConfig.eip712Version,
        chainId: networkConfig.chainId,
        verifyingContract: networkConfig.tokenAddress,
      };

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

      const message = {
        from, to, value,
        validAfter: parseInt(validAfter),
        validBefore: parseInt(validBefore),
        nonce,
      };

      const recovered = ethers.verifyTypedData(domain, types, message, signature);
      payerAddress = recovered.toLowerCase();

      if (payerAddress !== from.toLowerCase()) {
        return {
          verified: false,
          errorResponse: NextResponse.json(
            { success: false, error: 'Payment signature does not match sender address' },
            { status: 400 }
          ),
        };
      }

      if (BigInt(value) < BigInt(priceUsdc)) {
        return {
          verified: false,
          errorResponse: NextResponse.json(
            { success: false, error: `Insufficient payment. Required: ${priceUsdc}, provided: ${value}` },
            { status: 402 }
          ),
        };
      }

      if (to.toLowerCase() !== FACILITATOR_ADDRESS.toLowerCase()) {
        return {
          verified: false,
          errorResponse: NextResponse.json(
            { success: false, error: 'Invalid payment recipient' },
            { status: 400 }
          ),
        };
      }

      const now = Math.floor(Date.now() / 1000);
      if (now < parseInt(validAfter) || now > parseInt(validBefore)) {
        return {
          verified: false,
          errorResponse: NextResponse.json(
            { success: false, error: 'Payment authorization expired or not yet valid' },
            { status: 400 }
          ),
        };
      }

      console.log(`[x402] EIP-3009 verified for ${payerAddress}, settling on ${networkConfig.name}...`);
      settlement = await settleEip3009(authorization, signature, networkConfig);
    }

    if (!settlement.success) {
      return {
        verified: false,
        errorResponse: NextResponse.json(
          { success: false, error: settlement.error || 'Payment settlement failed' },
          { status: 402 }
        ),
      };
    }

    const paymentRequirement = {
      asset: networkConfig.tokenAddress,
      network: networkConfig.x402Network,
      chainId: networkConfig.chainId,
      payTo: FACILITATOR_ADDRESS,
      maxAmountRequired: priceUsdc.toString(),
      extra: { name: networkConfig.eip712Name, version: networkConfig.eip712Version },
    };
    const paymentTracking = extractPaymentTrackingData(
      paymentRequirement, endpointName, req.nextUrl.pathname
    );

    console.log(`[x402] Payment settled: ${payerAddress} paid ${priceUsdc / 1_000_000} ${networkConfig.tokenSymbol} (tx: ${settlement.transactionHash})`);

    return {
      verified: true,
      payerAddress,
      paymentTracking,
      transactionHash: settlement.transactionHash,
    };

  } catch (error) {
    console.error('[x402] Payment verification error:', error);
    return {
      verified: false,
      errorResponse: NextResponse.json(
        { success: false, error: `Invalid payment: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 400 }
      ),
    };
  }
}

/**
 * Get x402 payment requirement (for client-side use)
 */
export function getX402PaymentRequirement(priceUsdc: number, endpointName: string, networkKey: string = 'ethereum') {
  const network = getNetwork(networkKey);
  return {
    asset: network.tokenAddress,
    network: network.x402Network,
    chainId: network.chainId,
    payTo: FACILITATOR_ADDRESS,
    maxAmountRequired: priceUsdc.toString(),
    strategy: network.paymentStrategy,
    extra: {
      name: network.eip712Name,
      version: network.eip712Version,
    },
    endpoint_name: endpointName,
  };
}
