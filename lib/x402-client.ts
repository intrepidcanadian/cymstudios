/**
 * x402 Client — Multi-strategy payment with WalletConnect/wagmi
 *
 * Strategies:
 * - eip3009: Gasless transferWithAuthorization (USDC on Ethereum, USDT0 on Conflux eSpace)
 * - direct:  User sends approve tx, server calls transferFrom (tokens without EIP-3009)
 */

'use client';

import { NETWORKS, FACILITATOR_ADDRESS, type NetworkConfig } from '@/config/networks';

export interface PaymentOptions extends RequestInit {
  method: string;
  headers?: Record<string, string>;
  body?: string | FormData;
}

/**
 * Build EIP-3009 payment header (gasless — USDC on Ethereum, USDT0 on Conflux)
 */
async function buildEip3009Payment(
  network: NetworkConfig,
  amount: string,
  recipient: string,
  eip712Name: string,
  eip712Version: string,
  assetAddress: string,
  walletProvider: any,
): Promise<string> {
  const { ethers } = await import('ethers');

  const ethersProvider = new ethers.BrowserProvider(walletProvider);
  const signer = await ethersProvider.getSigner();
  const signerAddress = await signer.getAddress();

  // Verify correct chain
  const providerNetwork = await ethersProvider.getNetwork();
  if (providerNetwork.chainId !== BigInt(network.chainId)) {
    throw new Error(`Please switch to ${network.name} network in your wallet`);
  }

  const value = BigInt(amount).toString();
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 3600;

  const domain = {
    name: eip712Name,
    version: eip712Version,
    chainId: Number(network.chainId),
    verifyingContract: assetAddress,
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
    from: signerAddress,
    to: recipient,
    value,
    validAfter,
    validBefore,
    nonce,
  };

  console.log('[x402] Requesting EIP-3009 signature...');
  const signature = await signer.signTypedData(domain, types, message);

  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: network.x402Network,
    strategy: 'eip3009',
    payload: {
      signature,
      authorization: {
        from: signerAddress,
        to: recipient,
        value,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };

  return btoa(JSON.stringify(paymentPayload));
}

/**
 * Build direct payment header (approve + transferFrom)
 *
 * The user sends an on-chain approve tx, then the server calls transferFrom.
 * Used for tokens that don't support EIP-3009 transferWithAuthorization.
 */
async function buildDirectPayment(
  network: NetworkConfig,
  amount: string,
  recipient: string,
  assetAddress: string,
  walletProvider: any,
): Promise<string> {
  const { ethers } = await import('ethers');

  const ethersProvider = new ethers.BrowserProvider(walletProvider);
  const signer = await ethersProvider.getSigner();
  const signerAddress = await signer.getAddress();

  // Verify correct chain
  const providerNetwork = await ethersProvider.getNetwork();
  if (providerNetwork.chainId !== BigInt(network.chainId)) {
    throw new Error(`Please switch to ${network.name} network in your wallet`);
  }

  const tokenContract = new ethers.Contract(
    assetAddress,
    ['function approve(address spender, uint256 amount) returns (bool)'],
    signer
  );

  const value = BigInt(amount).toString();

  console.log(`[x402] Requesting approve(${recipient}, ${value}) on ${network.name}...`);
  const approveTx = await tokenContract.approve(recipient, value);
  console.log(`[x402] Approve tx submitted: ${approveTx.hash}`);

  const receipt = await approveTx.wait();
  console.log(`[x402] Approve confirmed, block: ${receipt.blockNumber}`);

  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: network.x402Network,
    strategy: 'direct',
    payload: {
      approvalTxHash: approveTx.hash,
      from: signerAddress,
      to: recipient,
      value,
    },
  };

  return btoa(JSON.stringify(paymentPayload));
}

/**
 * Make a payment-protected request using x402
 *
 * @param url - API endpoint
 * @param options - fetch options
 * @param networkKey - which network to pay on
 * @param walletProvider - EIP-1193 provider from the connected wallet
 */
export async function payWithX402(
  url: string,
  options: PaymentOptions,
  networkKey: string,
  walletProvider: any,
): Promise<Response> {
  const network = NETWORKS[networkKey];
  if (!network) throw new Error(`Unknown network: ${networkKey}`);

  console.log(`[x402] Initiating payment on ${network.name} (${network.tokenSymbol}, strategy: ${network.paymentStrategy})`);

  // Make initial request
  let response = await fetch(url, options);

  if (response.status === 402) {
    console.log('[x402] 402 Payment Required detected');

    const paymentInfo = await response.json();

    // Extract amount
    let amount = paymentInfo.maxAmountRequired;
    if (!amount && paymentInfo.accepts?.length > 0) {
      amount = paymentInfo.accepts[0].maxAmountRequired;
    }
    if (!amount) {
      amount = paymentInfo.amount || paymentInfo.price?.amount || '100000';
    }
    if (typeof amount === 'number') amount = amount.toString();
    if (!/^\d+$/.test(amount)) {
      throw new Error(`Invalid payment amount format: ${amount}`);
    }

    // Extract payment details from accepts, matching the user's selected network
    let assetAddress = network.tokenAddress;
    let eip712Name = network.eip712Name;
    let eip712Version = network.eip712Version;
    // M19/L11: Use configured FACILITATOR_ADDRESS if available, else fall back to 402 response payTo
    let recipient = FACILITATOR_ADDRESS;

    if (paymentInfo.accepts?.length > 0) {
      // Find the accepts entry matching the user's network (by chainId or network name)
      const accept = paymentInfo.accepts.find(
        (a: any) => a.chainId === network.chainId || a.network === network.x402Network
      ) || paymentInfo.accepts[0];

      assetAddress = accept.asset || assetAddress;

      if (FACILITATOR_ADDRESS) {
        // Validate payTo matches configured facilitator (merchant protection)
        if (accept.payTo && accept.payTo.toLowerCase() !== FACILITATOR_ADDRESS.toLowerCase()) {
          console.warn('x402: payTo mismatch — using configured facilitator address');
        }
        recipient = FACILITATOR_ADDRESS; // Always use configured facilitator, never trust 402 response
      } else if (accept.payTo) {
        // Client-side fallback: FACILITATOR_ADDRESS not set via env var — use server's payTo
        // Server-side always validates this is the correct facilitator address
        recipient = accept.payTo;
        console.warn('x402: using server-provided payTo address (FACILITATOR_ADDRESS not configured client-side)');
      } else {
        throw new Error('No facilitator address available. Payment cannot proceed.');
      }
      if (accept.extra) {
        eip712Name = accept.extra.name || eip712Name;
        eip712Version = accept.extra.version || eip712Version;
      }
      // Use network-specific amount if available
      if (accept.maxAmountRequired) {
        amount = accept.maxAmountRequired;
      }
    }

    if (!walletProvider) {
      throw new Error('No wallet connected. Please connect your wallet to make payments.');
    }
    if (typeof walletProvider.request !== 'function') {
      throw new Error('Invalid wallet provider. Please reconnect your wallet.');
    }

    // Build payment header based on strategy
    let paymentHeader: string;

    if (network.paymentStrategy === 'eip3009') {
      paymentHeader = await buildEip3009Payment(
        network, amount, recipient, eip712Name, eip712Version, assetAddress, walletProvider,
      );
    } else {
      paymentHeader = await buildDirectPayment(
        network, amount, recipient, assetAddress, walletProvider,
      );
    }

    // Retry with payment header
    response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-PAYMENT': paymentHeader,
      },
    });

    if (!response.ok) {
      const cloned = response.clone();
      console.error('[x402] Payment request failed:', await cloned.text());
    } else {
      console.log('[x402] Payment successful!');
    }
  }

  return response;
}

/**
 * Check if x402 payment is available (wallet connected)
 */
export function isX402Available(walletProvider: any): boolean {
  return !!walletProvider && typeof walletProvider?.request === 'function';
}
