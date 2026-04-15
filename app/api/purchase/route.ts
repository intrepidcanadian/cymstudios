import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { extractPaymentTrackingData, updatePaymentWithTxHash } from '@/lib/payment-tracker';
import { getUsdcAmount, getUsdcAmountFresh, convertToUsd } from '@/lib/exchange-rates';
import { generateOrderToken } from '@/lib/auth-token';
import { sendOrderDelayedEmail, sendOrderCompletedAlert } from '@/lib/email';
import { logger } from '@/lib/logger';
import { NETWORKS, FACILITATOR_ADDRESS, getNetwork, type NetworkConfig } from '@/config/networks';

export const dynamic = 'force-dynamic';

// Server-side rate limiting per wallet address (10s window)
const recentPurchaseAttempts = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 10_000;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// xRemit API configuration
const XREMIT_BASE_URL = process.env.EXTERNAL_BRANDS_API_URL
  ? process.env.EXTERNAL_BRANDS_API_URL.replace(/\/api\/v1\/?$/, '')
  : (process.env.XREMIT_ENV === 'production'
    ? 'https://rewardsapi.xremit.io'
    : 'https://rewardsapi-sandbox.xremit.io');
const XREMIT_API_KEY = process.env.EXTERNAL_API_KEY;
const XREMIT_CLIENT_SECRET = process.env.EXTERNAL_CLIENT_SECRET;

const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_MAINNET_PRIVATE_KEY || process.env.FACILITATOR_PRIVATE_KEY;

// EIP-3009 ABI (shared across all supported tokens)
const TOKEN_ABI = [
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
  'function transfer(address to, uint256 value) external returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

function generateXremitSignature(
  method: string,
  uri: string,
  body: string = ''
): string {
  const payload = `${method}${uri}${XREMIT_CLIENT_SECRET}${body}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      productId,
      price,
      userId,
      userFirstName,
      userLastName,
      userEmail,
      brandName,
      countryName,
      currency
    } = body;

    logger.info('[Purchase] Received productId:', productId, 'type:', typeof productId);
    logger.debug('[Purchase] Full request body:', JSON.stringify(body, null, 2));

    // Validate required fields
    if (!productId || !price || !userId || !userEmail) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate email format to prevent voucher loss from malformed addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address format. Please provide a valid email to receive your voucher.' },
        { status: 400 }
      );
    }

    // Convert and validate productId early (before any other operations)
    // xRemit API expects productId as a number (based on curl example)
    // But we need to ensure it's a valid integer, not a float
    let productIdNumber: number;

    if (typeof productId === 'string') {
      productIdNumber = parseInt(productId, 10);
    } else if (typeof productId === 'number') {
      productIdNumber = Math.floor(productId); // Ensure it's an integer
    } else {
      logger.error('[Purchase] Invalid productId type:', typeof productId);
      return NextResponse.json(
        { success: false, error: 'Invalid productId format' },
        { status: 400 }
      );
    }

    logger.debug('[Purchase] Converted productId:', productIdNumber);

    if (isNaN(productIdNumber) || !Number.isInteger(productIdNumber) || productIdNumber <= 0) {
      logger.error('[Purchase] Invalid productId format');
      return NextResponse.json(
        { success: false, error: `Invalid productId format: ${productId}. Must be a positive integer.` },
        { status: 400 }
      );
    }

    // Check Supabase configuration
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Check xRemit configuration
    if (!XREMIT_API_KEY || !XREMIT_CLIENT_SECRET) {
      return NextResponse.json(
        { success: false, error: 'Payment provider configuration error' },
        { status: 500 }
      );
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    // M8: Enforce email verification before allowing purchase.
    // Vouchers are delivered by email and cannot be recovered if sent to a typo.
    // OTP verification ensures the address is owned + reachable.
    {
      const normalizedEmail = userEmail.toLowerCase().trim();
      const { data: verified } = await supabase
        .from('verified_emails')
        .select('email')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (!verified) {
        return NextResponse.json(
          {
            success: false,
            error: 'Email not verified. Please verify your email before completing the purchase.',
            code: 'EMAIL_NOT_VERIFIED',
          },
          { status: 403 }
        );
      }
    }

    // Minimum order value guard — orders below $1 USD cost more in facilitator gas than they generate
    if (typeof price === 'number' && price > 0 && price < 1 && (!currency || currency === 'USD')) {
      return NextResponse.json(
        { success: false, error: 'Minimum order value is $1 USD. Smaller orders are not economically viable due to settlement costs.' },
        { status: 400 }
      );
    }

    // M31: Maximum order value ceiling — limits exposure per transaction (merchant protection)
    // Convert non-USD currencies to USD equivalent before checking cap
    const MAX_ORDER_VALUE_USD = 5000;
    if (typeof price === 'number') {
      const effectiveCurr = currency || 'USD';
      let priceInUsd = price;
      if (effectiveCurr !== 'USD' && effectiveCurr !== 'USDC') {
        try {
          priceInUsd = await convertToUsd(price, effectiveCurr);
        } catch {
          // If conversion fails, fall back to raw price comparison (conservative)
          priceInUsd = price;
        }
      }
      if (priceInUsd > MAX_ORDER_VALUE_USD) {
        logger.warn(`[Purchase] Order value ${price} ${effectiveCurr} (~$${priceInUsd.toFixed(0)} USD) exceeds maximum $${MAX_ORDER_VALUE_USD}`);
        return NextResponse.json(
          { success: false, error: `Maximum order value is $${MAX_ORDER_VALUE_USD} USD per transaction. Your order of ${price} ${effectiveCurr} exceeds this limit. Please reduce the amount or split into multiple orders.` },
          { status: 400 }
        );
      }
    }

    // CRITICAL: Validate purchase will succeed BEFORE processing payment
    // This prevents charging users for failed purchases

    // Verify productId exists in our database BEFORE payment
    logger.info('[Purchase] Verifying product:', productIdNumber);
    const { data: productData, error: productError } = await supabase
      .from('brands')
      .select('product_id, brand_name, country_name, currency, product_image, denominations, value_restrictions')
      .eq('product_id', productIdNumber)
      .single();

    if (productError || !productData) {
      logger.error('[Purchase] Product not found:', productIdNumber);
      return NextResponse.json(
        {
          success: false,
          error: `Product ID ${productIdNumber} not found in catalog. Please select a valid product.`
        },
        { status: 404 }
      );
    }

    logger.info('[Purchase] Product verified:', productData.brand_name);

    // Validate price against product denominations or value restrictions.
    // Prevents charging users (and burning facilitator gas on refunds) for amounts
    // that xRemit would reject.
    if (productData.denominations && Array.isArray(productData.denominations) && productData.denominations.length > 0) {
      const validDenoms = productData.denominations.map((d: number) => Number(d));
      if (!validDenoms.includes(Number(price))) {
        logger.warn(`[Purchase] Invalid denomination ${price} for product ${productIdNumber}. Valid: ${validDenoms.join(', ')}`);
        return NextResponse.json(
          {
            success: false,
            error: `Invalid amount ${price} ${productData.currency}. Valid denominations: ${validDenoms.join(', ')} ${productData.currency}.`,
          },
          { status: 400 }
        );
      }
    } else if (productData.value_restrictions) {
      const vr = productData.value_restrictions;
      const min = vr.minVal ?? vr.min;
      const max = vr.maxVal ?? vr.max;
      if (min !== undefined && Number(price) < Number(min)) {
        logger.warn(`[Purchase] Price ${price} below minimum ${min} for product ${productIdNumber}`);
        return NextResponse.json(
          { success: false, error: `Amount ${price} ${productData.currency} is below the minimum of ${min}.` },
          { status: 400 }
        );
      }
      if (max !== undefined && Number(price) > Number(max)) {
        logger.warn(`[Purchase] Price ${price} above maximum ${max} for product ${productIdNumber}`);
        return NextResponse.json(
          { success: false, error: `Amount ${price} ${productData.currency} exceeds the maximum of ${max}.` },
          { status: 400 }
        );
      }
    }

    // Normalize price to 2 decimal places — xRemit expects standard currency precision.
    // Prevents fractional cent amounts (e.g. 50.001) that could be rejected by the provider.
    const normalizedPrice = Math.round(Number(price) * 100) / 100;

    // Verify productId exists in xRemit's catalog BEFORE payment
    // This prevents payment for products that don't exist in xRemit
    logger.info('[Purchase] Verifying xRemit catalog for:', productIdNumber);
    try {
      const verifyEndpoint = `/brands/${productIdNumber}`;
      const verifySignature = generateXremitSignature('GET', verifyEndpoint);
      const verifyUrl = `${XREMIT_BASE_URL}/api/v1${verifyEndpoint}`;

      const verifyResponse = await fetch(verifyUrl, {
        method: 'GET',
        headers: {
          'API-Key': XREMIT_API_KEY!,
          'Signature': verifySignature,
          'Content-Type': 'application/json',
        },
      });

      if (!verifyResponse.ok) {
        logger.error('[Purchase] Product not in xRemit catalog:', productIdNumber);

        // Return 402 to request payment, but this will fail validation before payment executes
        // Actually, we should return error immediately to prevent payment attempt
        return NextResponse.json(
          {
            success: false,
            error: `Product ID ${productIdNumber} (${productData.brand_name}) is not available in xRemit's catalog. This product may have been removed. Please select a different product.`,
            productId: productIdNumber,
            brandName: productData.brand_name,
            suggestion: 'The catalog may need to be re-synced. Please try a different product or contact support.'
          },
          { status: 404 }
        );
      }

      const verifyData = await verifyResponse.json();
      logger.info('[Purchase] xRemit catalog verified:', verifyData.brandName || verifyData.productName);
    } catch (verifyError) {
      logger.error('[Purchase] xRemit catalog check failed:', verifyError instanceof Error ? verifyError.message : 'Unknown');
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to verify product availability with the gift card provider. Please try again in a moment.',
        },
        { status: 503 }
      );
    }

    // Generate unique order ID
    const orderId = crypto.randomUUID();

    // NOW that we've validated the purchase will succeed, check for payment
    // Check for x402 payment header
    const paymentHeader = request.headers.get('x-payment');
    const effectiveCurrency = currency || productData.currency;

    // If no payment header, return 402 with estimated USDC amount (24h cache OK)
    if (!paymentHeader) {
      let usdcAmountFloat: number;
      try {
        usdcAmountFloat = await getUsdcAmount(price, effectiveCurrency);
        logger.info(`[Purchase] Estimate: ${price} ${effectiveCurrency} = ${usdcAmountFloat.toFixed(2)} USDC (cached rate)`);
      } catch (conversionError) {
        logger.error('[Purchase] Currency conversion failed');
        return NextResponse.json(
          {
            success: false,
            error: `Unable to convert ${effectiveCurrency} to USDC. Exchange rate service unavailable.`
          },
          { status: 503 }
        );
      }
      const usdcAmount = Math.floor(usdcAmountFloat * 1000000).toString();

      const accepts = Object.entries(NETWORKS).map(([key, net]) => ({
        asset: net.tokenAddress,
        network: net.x402Network,
        chainId: net.chainId,
        payTo: FACILITATOR_ADDRESS,
        maxAmountRequired: usdcAmount,
        extra: {
          name: net.eip712Name,
          version: net.eip712Version,
          originalPrice: price.toString(),
          originalCurrency: effectiveCurrency
        }
      }));

      const paymentTracking = extractPaymentTrackingData(
        accepts[0],
        'purchase_giftcard',
        '/api/purchase'
      );

      return NextResponse.json(
        {
          error: 'Payment Required',
          message: 'Please pay to complete this purchase',
          accepts,
          x402Payment: paymentTracking
        },
        { status: 402 }
      );
    }

    // Settlement path: use fresh exchange rate (max 30 min old) for accurate pricing
    let usdcAmountFloat: number;
    try {
      usdcAmountFloat = await getUsdcAmountFresh(price, effectiveCurrency);
      logger.info(`[Purchase] Fresh rate: ${price} ${effectiveCurrency} = ${usdcAmountFloat.toFixed(2)} USDC`);
    } catch (conversionError) {
      logger.error('[Purchase] Currency conversion failed at settlement');
      return NextResponse.json(
        {
          success: false,
          error: `Unable to convert ${effectiveCurrency} to USDC. Exchange rate service unavailable.`
        },
        { status: 503 }
      );
    }

    // Decode and validate x402 payment format (but don't execute yet)
    let paymentData: any;
    let paymentStrategy: string;
    let paymentFrom: string;
    let paymentTo: string;
    let paymentValue: string;
    let paymentNetworkConfig: NetworkConfig;
    // EIP-3009 specific
    let paymentSignature: string | undefined;
    let paymentValidAfter: string | undefined;
    let paymentValidBefore: string | undefined;
    let paymentNonce: string | undefined;
    // Direct specific
    let paymentApprovalTxHash: string | undefined;

    try {
      paymentData = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
      logger.info('[x402] Payment data received');

      if (paymentData.x402Version !== 1 || paymentData.scheme !== 'exact') {
        return NextResponse.json(
          { success: false, error: 'Invalid payment format' },
          { status: 400 }
        );
      }

      const networkKey = paymentData.network || 'ethereum';
      paymentNetworkConfig = getNetwork(networkKey);
      paymentStrategy = paymentData.strategy || paymentNetworkConfig.paymentStrategy;
      logger.info(`[x402] Payment network: ${paymentNetworkConfig.name} (${paymentNetworkConfig.tokenSymbol}), strategy: ${paymentStrategy}`);

      const { payload } = paymentData;
      // Settlement amount = fresh rate + 1.5% merchant fee.
      // User signed based on the 402 estimate (24h cache + fee), so their
      // signed amount will typically be >= the fresh settlement amount.
      const settlementAmount = Math.floor(usdcAmountFloat * 1000000).toString();

      if (paymentStrategy === 'direct') {
        // Direct: user already approved, we call transferFrom for the settlement amount
        const { from, to, value, approvalTxHash } = payload;
        if (!from || !to || !value || !approvalTxHash) {
          return NextResponse.json(
            { success: false, error: 'Invalid direct payment payload' },
            { status: 400 }
          );
        }
        if (BigInt(value) < BigInt(settlementAmount)) {
          return NextResponse.json(
            { success: false, error: `Payment amount insufficient. Required ${settlementAmount}, got ${value}. The exchange rate may have changed — please try again.` },
            { status: 400 }
          );
        }
        if (to.toLowerCase() !== FACILITATOR_ADDRESS.toLowerCase()) {
          return NextResponse.json(
            { success: false, error: 'Invalid payment recipient' },
            { status: 400 }
          );
        }
        paymentFrom = from;
        paymentTo = to;
        // Transfer exactly the settlement amount (fresh rate + fee), not the full approval
        paymentValue = settlementAmount;
        paymentApprovalTxHash = approvalTxHash;
      } else {
        // EIP-3009: signature-based authorization
        // Amount is baked into the signature — we must transfer the signed value
        const { signature, authorization } = payload;
        const { from, to, value, validAfter, validBefore, nonce } = authorization;

        if (BigInt(value) < BigInt(settlementAmount)) {
          return NextResponse.json(
            { success: false, error: `Payment amount insufficient. Required ${settlementAmount}, got ${value}. The exchange rate may have changed — please try again.` },
            { status: 400 }
          );
        }

        // M14: Overpayment protection — EIP-3009 transfers the full signed value on-chain.
        // If the exchange rate moved favorably between quote (24h cache) and settlement (fresh),
        // the user would overpay. Reject if overpayment exceeds 5% to protect users.
        const overpaymentRatio = Number(BigInt(value) - BigInt(settlementAmount)) / Number(BigInt(settlementAmount));
        if (overpaymentRatio > 0.05) {
          logger.warn(`[x402] Overpayment rejected: signed=${value}, settlement=${settlementAmount}, overpay=${(overpaymentRatio * 100).toFixed(1)}%`);
          return NextResponse.json(
            {
              success: false,
              error: 'The exchange rate has changed significantly since your quote. Please go back and retry to get a fresh quote — this protects you from overpaying.',
              code: 'RATE_CHANGED',
            },
            { status: 400 }
          );
        }

        if (to.toLowerCase() !== FACILITATOR_ADDRESS.toLowerCase()) {
          return NextResponse.json(
            { success: false, error: 'Invalid payment recipient' },
            { status: 400 }
          );
        }

        // Verify the authorization hasn't expired — prevents wasting facilitator gas
        // on an on-chain call that would revert. Client sets validBefore = now + 3600s.
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (validBefore && Number(validBefore) <= nowSeconds) {
          logger.warn(`[x402] Expired authorization: validBefore=${validBefore}, now=${nowSeconds}`);
          return NextResponse.json(
            { success: false, error: 'Payment authorization has expired. Please try again with a fresh signature.' },
            { status: 400 }
          );
        }
        // Also check validAfter hasn't been set in the future
        if (validAfter && Number(validAfter) > nowSeconds) {
          logger.warn(`[x402] Premature authorization: validAfter=${validAfter}, now=${nowSeconds}`);
          return NextResponse.json(
            { success: false, error: 'Payment authorization is not yet valid. Please try again.' },
            { status: 400 }
          );
        }

        paymentSignature = signature;
        paymentFrom = from;
        paymentTo = to;
        paymentValue = value; // Must match signed authorization
        paymentValidAfter = validAfter;
        paymentValidBefore = validBefore;
        paymentNonce = nonce;
      }

      logger.info('[x402] Payment format validated');

      // Server-side rate limit per wallet address
      const walletKey = paymentFrom.toLowerCase();
      const lastAttempt = recentPurchaseAttempts.get(walletKey);
      if (lastAttempt && Date.now() - lastAttempt < RATE_LIMIT_WINDOW_MS) {
        logger.warn(`[Purchase] Rate limited wallet: ${walletKey}`);
        return NextResponse.json(
          { success: false, error: 'Too many purchase attempts. Please wait a few seconds.' },
          { status: 429 }
        );
      }
      recentPurchaseAttempts.set(walletKey, Date.now());
      // Cleanup old entries periodically
      if (recentPurchaseAttempts.size > 1000) {
        const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
        recentPurchaseAttempts.forEach((v, k) => {
          if (v < cutoff) recentPurchaseAttempts.delete(k);
        });
      }

    } catch (paymentError) {
      logger.error('[x402] Payment validation failed');
      return NextResponse.json(
        { success: false, error: paymentError instanceof Error ? paymentError.message : 'Payment validation failed' },
        { status: 400 }
      );
    }

    // M7: Nonce replay protection — INSERT into used_nonces before settlement.
    // The on-chain contract enforces nonce uniqueness, but only once a tx confirms.
    // Between signature submission and confirmation, the same nonce could be replayed.
    // Inserting first (with PK on (from_address, nonce)) closes this race window.
    if (paymentStrategy === 'eip3009' && paymentNonce) {
      const { error: nonceInsertError } = await supabase
        .from('used_nonces')
        .insert({
          from_address: paymentFrom.toLowerCase(),
          nonce: paymentNonce,
          network: paymentNetworkConfig.x402Network,
          order_id: orderId,
        });

      if (nonceInsertError) {
        // 23505 = unique_violation in PostgreSQL
        if (nonceInsertError.code === '23505') {
          logger.warn(`[x402] Nonce replay blocked: ${paymentFrom} / ${paymentNonce}`);
          return NextResponse.json(
            { success: false, error: 'This payment authorization has already been submitted. Please try again with a fresh signature.' },
            { status: 409 }
          );
        }
        // Non-duplicate DB error — log and fail safely (do not settle)
        logger.error('[x402] Nonce insert failed:', nonceInsertError.message);
        return NextResponse.json(
          { success: false, error: 'Unable to record payment authorization. Please try again.' },
          { status: 500 }
        );
      }
    }

    // Idempotency guard: check for duplicate pending order from same wallet with same amount in last 60s
    const { data: recentDuplicates } = await supabase
      .from('orders')
      .select('order_id, status, created_at')
      .eq('payment_from', paymentFrom.toLowerCase())
      .eq('payment_value', paymentValue)
      .eq('product_id', productIdNumber)
      .in('status', ['pending', 'processing'])
      .gte('created_at', new Date(Date.now() - 300_000).toISOString())
      .limit(1);

    if (recentDuplicates && recentDuplicates.length > 0) {
      const existingOrder = recentDuplicates[0];
      logger.warn(`[Purchase] Duplicate submission blocked. Existing order: ${existingOrder.order_id}`);
      return NextResponse.json(
        {
          success: false,
          error: 'A purchase for this product is already being processed. Please wait for it to complete.',
          existingOrderId: existingOrder.order_id,
        },
        { status: 409 }
      );
    }

    // Create order record in database (pending status)
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_id: orderId,
        product_id: productIdNumber, // Use validated/converted productId
        brand_name: brandName,
        country_name: countryName,
        currency: currency,
        price: price,
        user_id: userId,
        user_first_name: userFirstName,
        user_last_name: userLastName,
        user_email: userEmail,
        product_image: productData.product_image || null,
        status: 'pending',
        payment_from: paymentFrom.toLowerCase(),
        payment_network: paymentNetworkConfig.x402Network,
        payment_value: paymentValue
      })
      .select()
      .single();

    if (orderError) {
      logger.error('[Purchase] Failed to create order record');
      return NextResponse.json(
        { success: false, error: 'Failed to create order' },
        { status: 500 }
      );
    }

    // Execute payment FIRST to ensure we can collect before ordering gift card
    // If payment fails (insufficient balance), no order is placed
    let paymentTxHash: string | null = null;
    logger.info(`[x402] Executing ${paymentStrategy} payment on ${paymentNetworkConfig.name}...`);
    try {
      const provider = new ethers.JsonRpcProvider(paymentNetworkConfig.rpcUrl);
      const facilitator = new ethers.Wallet(FACILITATOR_PRIVATE_KEY!, provider);
      const tokenContract = new ethers.Contract(paymentNetworkConfig.tokenAddress, TOKEN_ABI, facilitator);

      // M6: Pre-check facilitator has enough native token for gas before settlement (native-unit floor)
      const facilitatorGasBalance = await provider.getBalance(facilitator.address);
      const minGasBalance = ethers.parseEther(paymentNetworkConfig.minGasBalance.toString());
      if (facilitatorGasBalance < minGasBalance) {
        logger.error(`[x402] Facilitator ${paymentNetworkConfig.nativeSymbol} balance too low: ${ethers.formatEther(facilitatorGasBalance)}`);
        // Update order to failed before returning
        await supabase
          .from('orders')
          .update({
            status: 'failed',
            error_message: JSON.stringify({
              error: 'Settlement infrastructure temporarily unavailable',
              reason: 'Facilitator gas balance insufficient',
            })
          })
          .eq('order_id', orderId);

        return NextResponse.json(
          {
            success: false,
            error: 'Payment settlement is temporarily unavailable. Please try again later or contact support.',
            orderId: orderId,
          },
          { status: 503 }
        );
      }

      let tx: any;

      if (paymentStrategy === 'direct') {
        // Verify the user's approve tx was confirmed
        const approvalReceipt = await provider.getTransactionReceipt(paymentApprovalTxHash!);
        if (!approvalReceipt || approvalReceipt.status !== 1) {
          throw new Error('Approval transaction not confirmed');
        }

        // Verify allowance
        const allowance = await tokenContract.allowance(paymentFrom, facilitator.address);
        if (allowance < BigInt(paymentValue)) {
          throw new Error(`Insufficient allowance. Required: ${paymentValue}, Approved: ${allowance}`);
        }

        // Execute transferFrom
        tx = await tokenContract.transferFrom(paymentFrom, paymentTo, paymentValue);
      } else {
        // EIP-3009: transferWithAuthorization
        const sig = ethers.Signature.from(paymentSignature!);
        tx = await tokenContract.transferWithAuthorization(
          paymentFrom, paymentTo, paymentValue,
          paymentValidAfter, paymentValidBefore, paymentNonce,
          sig.v, sig.r, sig.s
        );
      }

      logger.info('[x402] TX submitted:', tx.hash);
      paymentTxHash = tx.hash;

      // Wait for on-chain confirmation with 90s timeout to prevent indefinite hangs
      const SETTLEMENT_TIMEOUT_MS = 90_000;
      const receipt = await Promise.race([
        tx.wait(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Settlement confirmation timed out after 90s')), SETTLEMENT_TIMEOUT_MS)
        ),
      ]);
      logger.info('[x402] Payment confirmed, block:', (receipt as any).blockNumber);
    } catch (paymentExecutionError) {
      const errorMsg = paymentExecutionError instanceof Error ? paymentExecutionError.message : 'Unknown';
      const isTimeout = errorMsg.includes('timed out');
      logger.error(`[x402] Payment execution ${isTimeout ? 'timed out' : 'failed'}:`, errorMsg);

      if (isTimeout && paymentTxHash) {
        // TX was submitted but confirmation timed out — mark as pending_review for cron resolution
        await supabase
          .from('orders')
          .update({
            status: 'pending_review',
            error_message: JSON.stringify({
              error: 'Settlement confirmation timed out',
              payment_tx: paymentTxHash,
              reason: 'Transaction was submitted but on-chain confirmation took too long. The cron job will resolve this order.',
            })
          })
          .eq('order_id', orderId);

        return NextResponse.json(
          {
            success: false,
            error: 'Payment was submitted but confirmation is taking longer than expected. Your order is under review and will be processed automatically.',
            orderId: orderId,
          },
          { status: 202 }
        );
      }

      // Update order status to failed
      await supabase
        .from('orders')
        .update({
          status: 'failed',
          error_message: JSON.stringify({
            error: 'Payment execution failed',
            payment_error: errorMsg,
            reason: 'Insufficient balance or payment authorization failed'
          })
        })
        .eq('order_id', orderId);

      return NextResponse.json(
        {
          success: false,
          error: paymentExecutionError instanceof Error
            ? paymentExecutionError.message
            : `Payment failed. Please ensure you have sufficient ${paymentNetworkConfig.tokenSymbol} balance.`,
          orderId: orderId
        },
        { status: 400 }
      );
    }

    // Prepare xRemit purchase request
    // productIdNumber is already validated above
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://cymstudio.app';
    const purchaseBody = {
      orderId: orderId,
      price: normalizedPrice,
      productId: productIdNumber, // xRemit expects number (integer)
      externalUserId: userId,
      externalUserFirstName: userFirstName || 'Customer',
      externalUserLastName: userLastName || '',
      externalUserEmail: userEmail,
      // Callback URL for xRemit to send webhook when order is processed
      callbackUrl: `${baseUrl}/api/webhook/xremit`
    };

    const uri = '/purchase/';
    const bodyString = JSON.stringify(purchaseBody);
    const signature = generateXremitSignature('POST', uri, bodyString);

    logger.info(`[Purchase] Submitting order ${orderId} to xRemit...`);

    // Submit purchase to xRemit AFTER payment is collected
    // If xRemit fails, we can refund the payment
    // Add timeout to prevent hanging requests (xRemit sandbox can be slow)
    const xremitController = new AbortController();
    const xremitTimeout = setTimeout(() => xremitController.abort(), 60000); // 60 second timeout

    let xremitResponse: Response;
    let xremitData: any;

    try {
      xremitResponse = await fetch(`${XREMIT_BASE_URL}/api/v1${uri}`, {
        method: 'POST',
        headers: {
          'API-Key': XREMIT_API_KEY!,
          'Signature': signature,
          'Content-Type': 'application/json',
        },
        body: bodyString,
        signal: xremitController.signal
      });
      clearTimeout(xremitTimeout);
      xremitData = await xremitResponse.json();
    } catch (fetchError: any) {
      clearTimeout(xremitTimeout);

      // Handle timeout or network errors
      const isTimeout = fetchError.name === 'AbortError';
      logger.error(`[Purchase] xRemit ${isTimeout ? 'timeout' : 'network error'}, payment TX: ${paymentTxHash}`);

      // Do NOT auto-refund on timeout — xRemit may still be processing the order.
      // Mark as pending_review so a manual/cron process can check xRemit order status
      // before deciding whether to refund.
      await supabase
        .from('orders')
        .update({
          status: 'pending_review',
          error_message: JSON.stringify({
            error: isTimeout ? 'xRemit API timeout' : 'xRemit network error',
            message: 'Purchase request timed out - awaiting manual review before refund',
            payment_tx: paymentTxHash,
            payment_network: paymentNetworkConfig.x402Network,
            payment_from: paymentFrom,
            payment_value: paymentValue,
          })
        })
        .eq('order_id', orderId);

      // Customer-facing: tell them we're investigating and a refund is coming if we can't deliver
      sendOrderDelayedEmail({
        to: userEmail,
        orderId,
        brandName: productData.brand_name,
        cardValue: price.toString(),
        currency: effectiveCurrency,
      }).catch(err => logger.error(`[Purchase] Failed to send delayed-order email for ${orderId}:`, err instanceof Error ? err.message : 'Unknown'));

      return NextResponse.json(
        {
          success: false,
          error: isTimeout
            ? 'The gift card provider is taking longer than expected. Your payment has been received and your order is being reviewed. Please contact info@ginsengswap.com if you need assistance.'
            : 'Unable to reach gift card provider. Your payment has been received and your order is being reviewed. Please contact info@ginsengswap.com if you need assistance.',
          orderId: orderId,
          status: 'pending_review',
          paymentTxHash: paymentTxHash
        },
        { status: 202 }
      );
    }

    logger.info('[Purchase] xRemit response status:', xremitResponse.status);

    // CRITICAL: If xRemit fails AFTER payment, we need to refund
    if (!xremitResponse.ok) {
      logger.error('[Purchase] xRemit failed, payment TX:', paymentTxHash);

      // If product not found, provide helpful error message
      let errorMessage = xremitData.error || 'Purchase failed';
      if (xremitData.error === 'Product is not found' || xremitData.httpStatusCode === 404) {
        errorMessage = `Product ID ${purchaseBody.productId} (${productData.brand_name}) is not available in xRemit's catalog. This product may have been removed or the catalog needs to be re-synced. Please try selecting a different product.`;
      }

      // REFUND: xRemit failed but we collected payment - refund the user
      logger.info('[Refund] Initiating refund due to xRemit failure...');
      try {
        const provider = new ethers.JsonRpcProvider(paymentNetworkConfig.rpcUrl);
        const facilitator = new ethers.Wallet(FACILITATOR_PRIVATE_KEY!, provider);
        const tokenContract = new ethers.Contract(paymentNetworkConfig.tokenAddress, TOKEN_ABI, facilitator);

        // Refund: Transfer back from facilitator to user
        const refundTx = await tokenContract.transfer(
          paymentFrom,
          paymentValue
        );

        logger.info('[Refund] Refund TX submitted:', refundTx.hash);
        const refundReceipt = await refundTx.wait();
        logger.info('[Refund] Refund confirmed, block:', refundReceipt.blockNumber);

        // Update order with refund info
        await supabase
          .from('orders')
          .update({
            status: 'failed',
            error_message: JSON.stringify({
              xremit_error: xremitData.error,
              productId: purchaseBody.productId,
              brand_name: productData.brand_name,
              message: 'xRemit purchase failed - payment refunded',
              payment_tx: paymentTxHash,
              refund_tx: refundTx.hash
            })
          })
          .eq('order_id', orderId);

        return NextResponse.json(
          {
            success: false,
            error: `${errorMessage} Payment has been automatically refunded.`,
            orderId: orderId,
            refunded: true,
            refundTxHash: refundTx.hash,
            paymentTxHash: paymentTxHash
          },
          { status: xremitResponse.status }
        );
      } catch (refundError) {
        logger.error('[Refund] Auto-refund failed after xRemit error, manual refund required');

        // Update order - manual refund required
        await supabase
          .from('orders')
          .update({
            status: 'failed',
            error_message: JSON.stringify({
              xremit_error: xremitData.error,
              productId: purchaseBody.productId,
              brand_name: productData.brand_name,
              message: 'xRemit purchase failed - REFUND REQUIRED',
              payment_tx: paymentTxHash,
              refund_error: refundError instanceof Error ? refundError.message : 'Unknown refund error',
              requires_manual_refund: true
            })
          })
          .eq('order_id', orderId);

        sendOrderDelayedEmail({
          to: userEmail,
          orderId,
          brandName: productData.brand_name,
          cardValue: price.toString(),
          currency: effectiveCurrency,
        }).catch(err => logger.error(`[Purchase] Failed to send delayed-order email for ${orderId}:`, err instanceof Error ? err.message : 'Unknown'));

        return NextResponse.json(
          {
            success: false,
            error: `${errorMessage} Payment was collected but xRemit purchase failed. Automatic refund failed - please contact support for manual refund.`,
            orderId: orderId,
            refunded: false,
            paymentTxHash: paymentTxHash,
            requiresManualRefund: true
          },
          { status: 500 }
        );
      }
    }

    // Update order with full xRemit purchase response data
    await supabase
      .from('orders')
      .update({
        status: 'processing',

        // xRemit IDs
        xremit_id: xremitData.id,
        xremit_account_id: xremitData.accountId,

        // Financial details
        partner_revenue_share_percent: xremitData.partnerRevenueSharePercent,
        voucher_discount_percent: xremitData.voucherDiscountPercent,
        base_currency: xremitData.baseCurrency,
        voucher_currency: xremitData.voucherCurrency,
        face_value: xremitData.faceValue,
        cost: xremitData.cost,
        commission: xremitData.commission,
        phaze_commission: xremitData.phazeCommission,
        delivery_fee: xremitData.deliveryFee,

        // Product information
        product_name: xremitData.productName,
        product_description: xremitData.productDescription,
        terms_and_conditions: xremitData.termsAndConditions,
        how_to_use: xremitData.howToUse,
        expiry_and_validity: xremitData.expiryAndValidity,

        // xRemit timestamps
        xremit_created_at: xremitData.created_at,
        xremit_updated_at: xremitData.updated_at,

        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId);

    logger.info(`[Purchase] Order ${orderId} submitted, xRemit ID: ${xremitData.id}`);

    // Ops alert — order successfully placed at xRemit
    sendOrderCompletedAlert({
      orderId,
      productName: productData.brand_name,
      productId: productIdNumber,
      price: price,
      currency: effectiveCurrency,
      userEmail: userEmail,
      paymentTxHash: paymentTxHash || undefined,
      paymentNetwork: paymentNetworkConfig.x402Network,
      source: 'purchase',
    }).catch(err => logger.error(`[Purchase] Failed to send completed-order alert for ${orderId}:`, err instanceof Error ? err.message : 'Unknown'));

    // Create payment tracking data with transaction hash
    const usdcAmountAtomic = Math.floor(usdcAmountFloat * 1000000).toString();
    const paymentTracking = extractPaymentTrackingData(
      {
        asset: paymentNetworkConfig.tokenAddress,
        network: paymentNetworkConfig.x402Network,
        payTo: FACILITATOR_ADDRESS,
        maxAmountRequired: usdcAmountAtomic,
        extra: {
          name: paymentNetworkConfig.eip712Name,
          version: paymentNetworkConfig.eip712Version,
          originalPrice: price.toString(),
          originalCurrency: effectiveCurrency
        }
      },
      'purchase_giftcard',
      '/api/purchase'
    );

    // Update with transaction hash
    const trackedPayment = updatePaymentWithTxHash(paymentTracking, paymentTxHash!);
    trackedPayment.paymentStatus = 'executed';

    // Generate signed token for order status lookups
    const orderToken = generateOrderToken(orderId, userId);

    return NextResponse.json({
      success: true,
      orderId: orderId,
      orderToken: orderToken,
      message: 'Order submitted successfully. Voucher details will be sent to your email.',
      data: {
        orderId: orderId,
        status: 'processing',
        productId: productId,
        price: price,
        currency: currency || productData.currency,
        usdcAmount: usdcAmountFloat.toFixed(2)
      },
      x402Payment: trackedPayment
    });

  } catch (error) {
    logger.error('[Purchase] Error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Purchase failed'
      },
      { status: 500 }
    );
  }
}
