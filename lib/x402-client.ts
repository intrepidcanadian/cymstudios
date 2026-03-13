/**
 * x402 Client Wrapper
 *
 * Manual x402 implementation using ethers.js with Privy wallet support.
 * Handles dynamic imports and provides type-safe interface.
 */

'use client';

// Store Privy wallet provider globally
let privyWalletProvider: any = null;

export function setPrivyWalletProvider(provider: any) {
  privyWalletProvider = provider;
}

export interface PaymentOptions extends RequestInit {
  method: string;
  headers?: Record<string, string>;
  body?: string | FormData;
}

/**
 * Make a payment-protected request using x402
 *
 * This function handles the full x402 payment flow:
 * 1. Makes initial request
 * 2. Detects 402 Payment Required
 * 3. Opens wallet for payment approval
 * 4. Retries with X-Payment header
 * 5. Returns successful response
 */
export async function payWithX402(url: string, options: PaymentOptions): Promise<Response> {
  const { ethers } = await import('ethers');

  console.log('🔐 [x402] Initiating crypto payment flow...');
  console.log('🔐 [x402] Request URL:', url);
  console.log('🔐 [x402] Request method:', options.method);
  console.log('🔐 [x402] Request headers:', options.headers);
  if (options.body) {
    if (options.body instanceof FormData) {
      console.log('🔐 [x402] Request body: FormData');
    } else {
      try {
        const bodyObj = JSON.parse(options.body);
        console.log('🔐 [x402] Request body:', JSON.stringify(bodyObj, null, 2));
      } catch (e) {
        console.log('🔐 [x402] Request body (raw):', options.body.substring(0, 200));
      }
    }
  }

  // Make initial request
  console.log('🔐 [x402] Making initial request...');
  let response = await fetch(url, options);
  console.log('🔐 [x402] Initial response status:', response.status);
  console.log('🔐 [x402] Initial response headers:', Object.fromEntries(response.headers.entries()));

  // Check if payment is required
  if (response.status === 402) {
    console.log('💰 [x402] 402 Payment Required detected');

    const paymentInfo = await response.json();
    console.log('💰 [x402] Full 402 response:', JSON.stringify(paymentInfo, null, 2));

    // x402-next middleware returns payment info in the response
    // Extract amount and asset details from the 402 response
    // The response structure may vary, so we handle both nested and flat structures
    console.log('💰 [x402] Extracting payment details from 402 response...');
    console.log('💰 [x402] paymentInfo.amount:', paymentInfo.amount);
    console.log('💰 [x402] paymentInfo.price?.amount:', paymentInfo.price?.amount);
    console.log('💰 [x402] paymentInfo.maxAmountRequired:', paymentInfo.maxAmountRequired);
    console.log('💰 [x402] paymentInfo.accepts:', paymentInfo.accepts);

    // x402-next returns payment requirements in the 'accepts' array
    // The first accept entry contains the payment details
    let amount = paymentInfo.maxAmountRequired;
    if (!amount && paymentInfo.accepts && paymentInfo.accepts.length > 0) {
      amount = paymentInfo.accepts[0].maxAmountRequired;
      console.log('💰 [x402] Extracted amount from accepts[0].maxAmountRequired:', amount);
    }

    // Fallback to other possible locations
    if (!amount) {
      amount = paymentInfo.amount || paymentInfo.price?.amount || "100000";
      console.log('💰 [x402] Using fallback amount:', amount);
    }

    console.log('💰 [x402] Raw amount extracted:', amount, 'type:', typeof amount);

    // Ensure amount is a string (x402-next may return it as a number)
    if (typeof amount === 'number') {
      console.log('💰 [x402] Converting amount from number to string');
      amount = amount.toString();
    }

    // Validate amount is a valid number string
    if (!/^\d+$/.test(amount)) {
      console.error('❌ [x402] Invalid amount format:', amount);
      throw new Error(`Invalid payment amount format: ${amount}`);
    }
    console.log('✅ [x402] Amount validated:', amount);

    // Extract asset and payment details from accepts array if available
    let assetAddress = paymentInfo.asset?.address || paymentInfo.price?.asset?.address;
    let assetDecimals = paymentInfo.asset?.decimals || paymentInfo.price?.asset?.decimals;
    let eip712Name = paymentInfo.asset?.eip712?.name || paymentInfo.price?.asset?.eip712?.name;
    let eip712Version = paymentInfo.asset?.eip712?.version || paymentInfo.price?.asset?.eip712?.version;
    let network = paymentInfo.network;
    let recipient = paymentInfo.recipient || paymentInfo.payTo;

    // If we have accepts array, use the first entry for payment details
    if (paymentInfo.accepts && paymentInfo.accepts.length > 0) {
      const accept = paymentInfo.accepts[0];
      assetAddress = accept.asset || assetAddress;
      network = accept.network || network;
      recipient = accept.payTo || recipient;

      // EIP712 info is in the 'extra' field
      if (accept.extra) {
        eip712Name = accept.extra.name || eip712Name;
        eip712Version = accept.extra.version || eip712Version;
      }
    }

    // Fallback to defaults - ETHEREUM_MAINNET USDC contract
    assetAddress = assetAddress || "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    assetDecimals = assetDecimals || 6;
    eip712Name = eip712Name || "USD Coin";
    eip712Version = eip712Version || "2";
    network = network || "ethereum";
    recipient = recipient || "0xc10561c1c0d718b3d362df9d510a1b4e4331a4ee";

    console.log('💰 [x402] Extracted payment details:');
    console.log('  - Asset address:', assetAddress);
    console.log('  - Asset decimals:', assetDecimals);
    console.log('  - EIP712 name:', eip712Name);
    console.log('  - EIP712 version:', eip712Version);
    console.log('  - Network:', network);
    console.log('  - Recipient:', recipient);

    const requirement = {
      amount: amount, // Already a string
      asset: {
        address: assetAddress,
        decimals: assetDecimals,
        eip712: {
          name: eip712Name,
          version: eip712Version
        }
      },
      network: network,
      recipient: recipient
    };

    // Calculate USDC amount for display (handle decimals properly)
    const amountBigInt = BigInt(requirement.amount);
    const decimalsBigInt = BigInt(1000000);
    const wholePart = amountBigInt / decimalsBigInt;
    const fractionalPart = amountBigInt % decimalsBigInt;
    const usdcDisplay = fractionalPart === BigInt(0)
      ? wholePart.toString()
      : `${wholePart}.${fractionalPart.toString().padStart(6, '0').replace(/0+$/, '')}`;

    console.log('💰 [x402] Payment requirement object:', {
      amount: requirement.amount,
      amountType: typeof requirement.amount,
      usdc: usdcDisplay,
      asset: requirement.asset.address,
      recipient: requirement.recipient
    });

    // Connect to wallet (Privy only)
    console.log('🔗 [x402] Checking for Privy wallet...');

    if (!privyWalletProvider) {
      console.error('❌ [x402] No Privy wallet found');
      throw new Error('No wallet found. Please sign in with Privy to make payments.');
    }

    // Validate EIP-1193 provider has required methods
    if (typeof privyWalletProvider.request !== 'function') {
      console.error('❌ [x402] Invalid provider - missing request method:', {
        type: typeof privyWalletProvider,
        keys: Object.keys(privyWalletProvider || {}),
        hasRequest: typeof privyWalletProvider?.request
      });
      throw new Error('Invalid wallet provider. Please try signing out and back in.');
    }

    console.log('✅ [x402] Privy wallet provider validated:', {
      hasRequest: typeof privyWalletProvider.request === 'function',
      hasOn: typeof privyWalletProvider.on === 'function'
    });

    // Wrap the Privy EIP-1193 provider with ethers.js BrowserProvider
    console.log('🔗 [x402] Wrapping Privy provider with ethers.js...');
    let ethersProvider: InstanceType<typeof ethers.BrowserProvider>;
    try {
      ethersProvider = new ethers.BrowserProvider(privyWalletProvider);
    } catch (wrapError) {
      console.error('❌ [x402] Failed to wrap provider with BrowserProvider:', wrapError);
      console.error('Provider details:', {
        type: typeof privyWalletProvider,
        constructor: privyWalletProvider?.constructor?.name,
        keys: Object.keys(privyWalletProvider || {})
      });
      throw new Error('Failed to initialize wallet. Please try refreshing the page.');
    }
    console.log('✅ [x402] Ethers provider created');

    console.log('🔗 [x402] Getting signer...');
    const signer = await ethersProvider.getSigner();
    const signerAddress = await signer.getAddress();
    console.log('✅ [x402] Signer address:', signerAddress);

    // Get network from provider
    console.log('🌐 [x402] Checking network...');
    const providerNetwork = await ethersProvider.getNetwork();
    const requiredChainId = BigInt(1); // Ethereum Mainnet
    console.log('🌐 [x402] Provider chain ID:', providerNetwork.chainId.toString());
    console.log('🌐 [x402] Required chain ID:', requiredChainId.toString());

    if (providerNetwork.chainId !== requiredChainId) {
      console.error('❌ [x402] Wrong network! Expected Ethereum Mainnet (1)');
      throw new Error('Please switch to Ethereum Mainnet network in your wallet');
    }
    console.log('✅ [x402] Network verified: Ethereum Mainnet');

    // Build payment authorization
    console.log('📝 [x402] Building payment authorization...');
    const from = signerAddress;
    // Convert amount to BigInt then string to ensure proper uint256 format
    // The amount from 402 response is already in atomic units (string or number)
    const value = BigInt(requirement.amount).toString();
    console.log('📝 [x402] Payment value (uint256 string):', value);

    // Calculate USDC amount for display (handle decimals properly)
    const valueBigInt = BigInt(value);
    const usdcDecimals = BigInt(1000000);
    const valueWholePart = valueBigInt / usdcDecimals;
    const valueFractionalPart = valueBigInt % usdcDecimals;
    const valueUsdcDisplay = valueFractionalPart === BigInt(0)
      ? valueWholePart.toString()
      : `${valueWholePart}.${valueFractionalPart.toString().padStart(6, '0').replace(/0+$/, '')}`;
    console.log('📝 [x402] Payment value (USDC):', valueUsdcDisplay);

    const nonce = ethers.hexlify(ethers.randomBytes(32));
    console.log('📝 [x402] Nonce:', nonce);

    const validAfter = 0; // Immediately valid
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // Expires in 1 hour

    const domain = {
      name: requirement.asset.eip712.name,
      version: requirement.asset.eip712.version,
      chainId: Number(requiredChainId),
      verifyingContract: requirement.asset.address,
    };
    console.log('📝 [x402] EIP712 Domain:', JSON.stringify(domain, null, 2));

    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };
    console.log('📝 [x402] EIP712 Types:', JSON.stringify(types, null, 2));

    const message = {
      from,
      to: requirement.recipient,
      value,
      validAfter,
      validBefore,
      nonce,
    };
    console.log('📝 [x402] EIP712 Message:', JSON.stringify(message, null, 2));

    console.log('📝 [x402] Requesting signature from wallet...');
    const signature = await signer.signTypedData(domain, types, message);
    console.log('✅ [x402] Signature received:', signature.substring(0, 20) + '...' + signature.substring(signature.length - 20));

    // Build x402 payment header
    console.log('📦 [x402] Building payment payload...');
    const paymentPayload = {
      x402Version: 1,
      scheme: "exact",
      network: requirement.network,
      payload: {
        signature,
        authorization: {
          from,
          to: message.to,
          value,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        }
      }
    };
    console.log('📦 [x402] Payment payload:', JSON.stringify(paymentPayload, null, 2));

    const paymentHeader = btoa(JSON.stringify(paymentPayload));
    console.log('📦 [x402] Payment header (base64):', paymentHeader.substring(0, 50) + '...');
    console.log('📦 [x402] Payment header length:', paymentHeader.length);

    console.log('🔄 [x402] Retrying request with payment header...');

    // Retry with payment header
    const retryOptions = {
      ...options,
      headers: {
        ...options.headers,
        'X-PAYMENT': paymentHeader
      }
    };
    console.log('🔄 [x402] Retry request URL:', url);
    console.log('🔄 [x402] Retry request method:', retryOptions.method);
    console.log('🔄 [x402] Retry request headers:', Object.keys(retryOptions.headers || {}));

    response = await fetch(url, retryOptions);

    console.log('🔄 [x402] Retry response status:', response.status);
    console.log('🔄 [x402] Retry response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      // Clone response before reading so PurchaseModal can still read it
      const clonedResponse = response.clone();
      const errorText = await clonedResponse.text();
      console.error('❌ [x402] Retry request failed:', errorText);
      try {
        const errorJson = JSON.parse(errorText);
        console.error('❌ [x402] Error details:', JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.error('❌ [x402] Error response (raw):', errorText.substring(0, 500));
      }
      // Return the original response so PurchaseModal can read it
      return response;
    } else {
      console.log('✅ [x402] Payment successful!');
      // Clone response before reading so PurchaseModal can still read it
      const clonedResponse = response.clone();
      try {
        const successData = await clonedResponse.json();
        console.log('✅ [x402] Success response:', JSON.stringify(successData, null, 2));
      } catch (e) {
        console.log('✅ [x402] Success response (non-JSON)');
      }
    }
  } else {
    console.log('✅ [x402] No payment required, status:', response.status);
  }

  return response;
}

/**
 * Check if x402 is available
 * Returns true if Privy wallet provider has been set
 */
export async function isX402Available(): Promise<boolean> {
  // Check if Privy wallet provider is available (set via setPrivyWalletProvider)
  return !!privyWalletProvider;
}

/**
 * Execute an API endpoint with x402 payment
 * Wrapper around payWithX402 for easier API execution
 */
export async function executeAPIWithX402(url: string, body: any): Promise<any> {
  const response = await payWithX402(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API execution failed');
  }

  return response.json();
}

/**
 * Create an X-PAYMENT header by signing a payment authorization
 *
 * This function handles only the signing part of the x402 flow:
 * 1. Connects to wallet (Privy or MetaMask)
 * 2. Builds EIP-712 authorization
 * 3. Signs with wallet
 * 4. Returns the base64-encoded payment header
 *
 * Use this when you need to create a payment header separately
 * from making the request (e.g., for FormData uploads where
 * the body can't be reused).
 */
export async function createPaymentHeader(paymentInfo: {
  maxAmountRequired?: string;
  accepts?: Array<{
    asset?: string;
    network?: string;
    payTo?: string;
    maxAmountRequired?: string;
    extra?: { name?: string; version?: string };
  }>;
}): Promise<string> {
  const { ethers } = await import('ethers');

  console.log('🔐 [x402] Creating payment header...');

  // Extract payment requirement from 402 response
  const accept = paymentInfo.accepts?.[0];
  const amount = paymentInfo.maxAmountRequired || accept?.maxAmountRequired || '0';
  // ETHEREUM_MAINNET USDC contract
  const assetAddress = accept?.asset || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const recipient = accept?.payTo || process.env.NEXT_PUBLIC_X402_FACILITATOR_ADDRESS || '0xc10561c1c0d718b3d362df9d510a1b4e4331a4ee';
  const eip712Name = accept?.extra?.name || 'USD Coin';
  const eip712Version = accept?.extra?.version || '2';

  console.log('💰 [x402] Payment details:', {
    amount,
    asset: assetAddress,
    recipient
  });

  // Connect to wallet (Privy only)
  if (!privyWalletProvider) {
    throw new Error('No wallet found. Please sign in with Privy to make payments.');
  }

  // Validate EIP-1193 provider
  if (typeof privyWalletProvider.request !== 'function') {
    console.error('❌ [x402] Invalid provider in createPaymentHeader:', {
      type: typeof privyWalletProvider,
      keys: Object.keys(privyWalletProvider || {})
    });
    throw new Error('Invalid wallet provider. Please try signing out and back in.');
  }
  console.log('✅ [x402] Privy wallet provider found');

  // Wrap the Privy EIP-1193 provider with ethers.js BrowserProvider
  let ethersProvider: InstanceType<typeof ethers.BrowserProvider>;
  try {
    ethersProvider = new ethers.BrowserProvider(privyWalletProvider);
  } catch (wrapError) {
    console.error('❌ [x402] Failed to wrap provider:', wrapError);
    throw new Error('Failed to initialize wallet. Please try refreshing the page.');
  }

  const signer = await ethersProvider.getSigner();
  const signerAddress = await signer.getAddress();
  console.log('✅ [x402] Signer address:', signerAddress);

  // Verify network
  const providerNetwork = await ethersProvider.getNetwork();
  const requiredChainId = BigInt(1); // Ethereum Mainnet
  if (providerNetwork.chainId !== requiredChainId) {
    throw new Error('Please switch to Ethereum Mainnet network in your wallet');
  }

  // Build payment authorization
  const value = BigInt(amount).toString();
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const validAfter = 0; // Immediately valid
  const validBefore = Math.floor(Date.now() / 1000) + 3600; // Expires in 1 hour

  const domain = {
    name: eip712Name,
    version: eip712Version,
    chainId: Number(requiredChainId),
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
    value: value,
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
  };

  console.log('📝 [x402] Signing EIP-712 authorization...');
  const signature = await signer.signTypedData(domain, types, message);
  console.log('✅ [x402] Signature obtained:', signature.substring(0, 20) + '...');

  // Build payment payload
  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'ethereum',
    payload: {
      signature: signature,
      authorization: {
        from: signerAddress,
        to: recipient,
        value: value,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce,
      }
    }
  };

  const paymentHeader = btoa(JSON.stringify(paymentPayload));
  console.log('✅ [x402] Payment header created');

  return paymentHeader;
}
