import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { extractPaymentTrackingData, updatePaymentWithTxHash } from '@/lib/payment-tracker';
import { getUsdcAmount } from '@/lib/exchange-rates';
import { generateOrderToken } from '@/lib/auth-token';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// xRemit API configuration
// Priority: EXTERNAL_BRANDS_API_URL override > XREMIT_ENV selection > sandbox default
const XREMIT_BASE_URL = process.env.EXTERNAL_BRANDS_API_URL
  ? process.env.EXTERNAL_BRANDS_API_URL.replace(/\/api\/v1\/?$/, '')
  : (process.env.XREMIT_ENV === 'production'
    ? 'https://rewardsapi.xremit.io'
    : 'https://rewardsapi-sandbox.xremit.io');
const XREMIT_API_KEY = process.env.EXTERNAL_API_KEY;
const XREMIT_CLIENT_SECRET = process.env.EXTERNAL_CLIENT_SECRET;

// x402 Payment Configuration
const USDC_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const FACILITATOR_ADDRESS = '0xc10561c1c0d718b3d362df9d510a1b4e4331a4ee';
const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_MAINNET_PRIVATE_KEY || process.env.FACILITATOR_PRIVATE_KEY;
const ETHEREUM_RPC = process.env.ETHEREUM_MAINNET_RPC_URL || 'https://eth.llamarpc.com';
const CHAIN_ID = 1; // Ethereum Mainnet

// USDC ABI (transferWithAuthorization function + transfer for refunds)
const USDC_ABI = [
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

    // CRITICAL: Validate purchase will succeed BEFORE processing payment
    // This prevents charging users for failed purchases

    // Verify productId exists in our database BEFORE payment
    logger.info('[Purchase] Verifying product:', productIdNumber);
    const { data: productData, error: productError } = await supabase
      .from('brands')
      .select('product_id, brand_name, country_name, currency, product_image')
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
      logger.warn('[Purchase] xRemit catalog check failed, continuing');
      // Continue with purchase attempt - verification is best effort
    }

    // Generate unique order ID
    const orderId = crypto.randomUUID();

    // NOW that we've validated the purchase will succeed, check for payment
    // Check for x402 payment header
    const paymentHeader = request.headers.get('x-payment');

    // Calculate USDC amount from price based on currency
    // For USD: 1:1 with USDC
    // For CAD/HKD: convert using exchange rate
    let usdcAmountFloat: number;
    try {
      usdcAmountFloat = await getUsdcAmount(price, currency || productData.currency);
      logger.info(`[Purchase] Conversion: ${price} ${currency || productData.currency} = ${usdcAmountFloat.toFixed(2)} USDC`);
    } catch (conversionError) {
      logger.error('[Purchase] Currency conversion failed');
      return NextResponse.json(
        {
          success: false,
          error: `Unable to convert ${currency || productData.currency} to USDC. Exchange rate service unavailable.`
        },
        { status: 503 }
      );
    }

    // If no payment header, return 402 Payment Required
    if (!paymentHeader) {
      // Calculate USDC amount in atomic units (6 decimals)
      const usdcAmount = Math.floor(usdcAmountFloat * 1000000).toString();

      const paymentRequirement = {
        asset: USDC_CONTRACT,
        network: 'ethereum',
        payTo: FACILITATOR_ADDRESS,
        maxAmountRequired: usdcAmount,
        extra: {
          name: 'USD Coin',
          version: '2',
          originalPrice: price.toString(),
          originalCurrency: currency || productData.currency
        }
      };

      // Extract payment tracking data for client
      const paymentTracking = extractPaymentTrackingData(
        paymentRequirement,
        'purchase_giftcard',
        '/api/purchase'
      );

      return NextResponse.json(
        {
          error: 'Payment Required',
          message: 'Please pay with USDC to complete this purchase',
          accepts: [paymentRequirement],
          x402Payment: paymentTracking
        },
        { status: 402 }
      );
    }

    // Decode and validate x402 payment format (but don't execute yet)
    // Store payment data to execute AFTER xRemit confirms purchase will succeed
    let paymentSignature: string;
    let paymentFrom: string;
    let paymentTo: string;
    let paymentValue: string;
    let paymentValidAfter: string;
    let paymentValidBefore: string;
    let paymentNonce: string;

    try {
      const paymentData = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
      logger.info('[x402] Payment data received');

      // Validate payment structure
      if (paymentData.x402Version !== 1 || paymentData.scheme !== 'exact') {
        return NextResponse.json(
          { success: false, error: 'Invalid payment format' },
          { status: 400 }
        );
      }

      const { signature, authorization } = paymentData.payload;
      const { from, to, value, validAfter, validBefore, nonce } = authorization;

      // Validate payment amount matches USDC amount (converted from currency)
      const expectedAmount = Math.floor(usdcAmountFloat * 1000000).toString();
      if (value !== expectedAmount) {
        return NextResponse.json(
          {
            success: false,
            error: `Payment amount mismatch. Expected ${expectedAmount} atomic units (${usdcAmountFloat.toFixed(2)} USDC for ${price} ${currency || productData.currency}), got ${value} atomic units`
          },
          { status: 400 }
        );
      }

      // Validate recipient
      if (to.toLowerCase() !== FACILITATOR_ADDRESS.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: 'Invalid payment recipient' },
          { status: 400 }
        );
      }

      // Store payment data for execution
      paymentSignature = signature;
      paymentFrom = from;
      paymentTo = to;
      paymentValue = value;
      paymentValidAfter = validAfter;
      paymentValidBefore = validBefore;
      paymentNonce = nonce;

      // Payment format validated - will execute BEFORE xRemit to ensure we can collect
      logger.info('[x402] Payment format validated');

    } catch (paymentError) {
      logger.error('[x402] Payment validation failed');
      return NextResponse.json(
        {
          success: false,
          error: paymentError instanceof Error ? paymentError.message : 'Payment validation failed'
        },
        { status: 400 }
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
        status: 'pending'
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
    logger.info('[x402] Executing payment on Ethereum Mainnet...');
    try {
      const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC);
      const facilitator = new ethers.Wallet(FACILITATOR_PRIVATE_KEY!, provider);
      const usdcContract = new ethers.Contract(USDC_CONTRACT, USDC_ABI, facilitator);

      // Split signature into v, r, s
      const sig = ethers.Signature.from(paymentSignature);

      // Execute transferWithAuthorization
      const tx = await usdcContract.transferWithAuthorization(
        paymentFrom,
        paymentTo,
        paymentValue,
        paymentValidAfter,
        paymentValidBefore,
        paymentNonce,
        sig.v,
        sig.r,
        sig.s
      );

      logger.info('[x402] TX submitted:', tx.hash);
      paymentTxHash = tx.hash;

      // Wait for confirmation
      const receipt = await tx.wait();
      logger.info('[x402] Payment confirmed, block:', receipt.blockNumber);
    } catch (paymentExecutionError) {
      logger.error('[x402] Payment execution failed:', paymentExecutionError instanceof Error ? paymentExecutionError.message : 'Unknown');

      // Update order status to failed
      await supabase
        .from('orders')
        .update({
          status: 'failed',
          error_message: JSON.stringify({
            error: 'Payment execution failed',
            payment_error: paymentExecutionError instanceof Error ? paymentExecutionError.message : 'Unknown payment error',
            reason: 'Insufficient balance or payment authorization failed'
          })
        })
        .eq('order_id', orderId);

      return NextResponse.json(
        {
          success: false,
          error: paymentExecutionError instanceof Error
            ? paymentExecutionError.message
            : 'Payment failed. Please ensure you have sufficient USDC balance.',
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
      price: price,
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

      // REFUND: xRemit failed but we collected payment - refund the user
      logger.info('[Refund] Initiating refund...');
      try {
        const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC);
        const facilitator = new ethers.Wallet(FACILITATOR_PRIVATE_KEY!, provider);
        const usdcContract = new ethers.Contract(USDC_CONTRACT, USDC_ABI, facilitator);

        const refundTx = await usdcContract.transfer(paymentFrom, paymentValue);
        logger.info('[Refund] Refund TX submitted:', refundTx.hash);
        const refundReceipt = await refundTx.wait();
        logger.info('[Refund] Refund confirmed, block:', refundReceipt.blockNumber);

        // Update order with refund info
        await supabase
          .from('orders')
          .update({
            status: 'failed',
            error_message: JSON.stringify({
              error: isTimeout ? 'xRemit API timeout' : 'xRemit network error',
              message: 'Purchase request timed out - payment refunded',
              payment_tx: paymentTxHash,
              refund_tx: refundTx.hash
            })
          })
          .eq('order_id', orderId);

        return NextResponse.json(
          {
            success: false,
            error: isTimeout
              ? 'The gift card provider is taking too long to respond. Your payment has been automatically refunded. Please try again later.'
              : 'Unable to reach gift card provider. Your payment has been automatically refunded. Please try again later.',
            orderId: orderId,
            refunded: true,
            refundTxHash: refundTx.hash,
            paymentTxHash: paymentTxHash
          },
          { status: 503 }
        );
      } catch (refundError) {
        logger.error('[Refund] Auto-refund failed, manual refund required');

        await supabase
          .from('orders')
          .update({
            status: 'failed',
            error_message: JSON.stringify({
              error: isTimeout ? 'xRemit API timeout' : 'xRemit network error',
              message: 'Purchase request timed out - REFUND REQUIRED',
              payment_tx: paymentTxHash,
              refund_error: refundError instanceof Error ? refundError.message : 'Unknown refund error',
              requires_manual_refund: true
            })
          })
          .eq('order_id', orderId);

        return NextResponse.json(
          {
            success: false,
            error: 'Gift card provider timed out. Payment was collected but automatic refund failed. Please contact support for manual refund.',
            orderId: orderId,
            refunded: false,
            paymentTxHash: paymentTxHash,
            requiresManualRefund: true
          },
          { status: 500 }
        );
      }
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
        const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC);
        const facilitator = new ethers.Wallet(FACILITATOR_PRIVATE_KEY!, provider);
        const usdcContract = new ethers.Contract(USDC_CONTRACT, USDC_ABI, facilitator);

        // Refund: Transfer back from facilitator to user
        const refundTx = await usdcContract.transfer(
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

    // Create payment tracking data with transaction hash
    const usdcAmountAtomic = Math.floor(usdcAmountFloat * 1000000).toString();
    const paymentTracking = extractPaymentTrackingData(
      {
        asset: USDC_CONTRACT,
        network: 'ethereum',
        payTo: FACILITATOR_ADDRESS,
        maxAmountRequired: usdcAmountAtomic,
        extra: {
          name: 'USD Coin',
          version: '2',
          originalPrice: price.toString(),
          originalCurrency: currency || productData.currency
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
