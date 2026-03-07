import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendVoucherEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * xRemit Webhook Callback Handler
 *
 * Receives voucher details after a successful purchase.
 *
 * Expected payload structure (from xRemit documentation):
 * {
 *   "id": 120389,
 *   "accountId": 12138,
 *   "orderID": "b8018601-c90d-48d4-8d02-bd68ad100110",  // Note: capital ID
 *   "productId": 12000000037,  // number
 *   "productName": "H&M",
 *   "externalUserId": "user_id_001",
 *   "voucherDiscountPercent": 6,
 *   "baseCurrency": "USD",
 *   "faceValue": 10,
 *   "currencyConversions": {"USDCAD": 1.332704},
 *   "cost": 9.665,
 *   "status": "pending" | "failed",
 *   "error": null | "error message" | stringified array,
 *   "commission": 0.335,
 *   "phazeCommission": 0.335,
 *   "voucherCurrency": "USD",
 *   "productDescription": "...",
 *   "termsAndConditions": "...",
 *   "howToUse": "...",
 *   "expiryAndValidity": "...",
 *   "created_at": "2020-10-31T18:46:24.869Z",
 *   "updated_at": "2020-10-31T18:46:40.869Z",
 *   "vouchers": [...]  // Array of vouchers
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook API key (if configured)
    const authHeader = request.headers.get('authorization');
    const expectedApiKey = process.env.XREMIT_WEBHOOK_API_KEY;

    console.log('[Webhook] Received, verifying authorization...');

    if (expectedApiKey) {
      if (!authHeader || authHeader !== expectedApiKey) {
        console.error('[Webhook] Invalid authorization');
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
      console.log('[Webhook] Authorization verified');
    } else {
      console.warn('[Webhook] XREMIT_WEBHOOK_API_KEY not configured, skipping auth check');
    }

    const body = await request.text();
    const webhookData = JSON.parse(body);

    console.log('=================================');
    console.log('XREMIT WEBHOOK RECEIVED');
    console.log('=================================');
    console.log('Full webhook payload:', JSON.stringify(webhookData, null, 2));
    console.log('=================================');

    // Handle both orderID (capital) and orderId (camelCase) for compatibility
    const orderId = webhookData.orderID || webhookData.orderId;

    console.log('[Webhook] Summary:', {
      orderId: orderId,
      status: webhookData.status,
      productId: webhookData.productId,
      productName: webhookData.productName,
      vouchersCount: webhookData.vouchers?.length || 0,
      hasError: !!webhookData.error
    });

    // Validate webhook data
    if (!orderId) {
      console.error('[Webhook] Missing orderId/orderID');
      return NextResponse.json(
        { success: false, error: 'Missing orderId' },
        { status: 400 }
      );
    }

    // Check Supabase configuration
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Webhook] Supabase configuration missing');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
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

    // Find the order
    const { data: existingOrder, error: findError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (findError || !existingOrder) {
      console.error('[Webhook] Order not found:', orderId);
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    console.log('[Webhook] Order found in database');

    // Prepare update data - map all xRemit fields according to documentation
    const updateData: any = {
      webhook_received_at: new Date().toISOString(),
      webhook_payload: webhookData, // Store complete payload for audit
      updated_at: new Date().toISOString()
    };

    // Map status - xRemit sends "pending" or "failed", but we also handle "processed" (from transaction lookup)
    if (webhookData.status === 'processed' || webhookData.status === 'completed') {
      updateData.status = 'completed';
      updateData.completed_at = new Date().toISOString();
    } else if (webhookData.status === 'failed') {
      updateData.status = 'failed';
    } else if (webhookData.status === 'pending') {
      updateData.status = 'processing'; // Keep as processing until completed
    } else {
      updateData.status = webhookData.status || 'processing';
    }

    // Extract xRemit transaction data
    if (webhookData.id) updateData.xremit_id = webhookData.id;
    if (webhookData.accountId) updateData.xremit_account_id = webhookData.accountId;
    if (webhookData.partnerRevenueSharePercent !== undefined) {
      updateData.partner_revenue_share_percent = webhookData.partnerRevenueSharePercent;
    }
    if (webhookData.voucherDiscountPercent !== undefined) {
      updateData.voucher_discount_percent = webhookData.voucherDiscountPercent;
    }

    // Financial details
    if (webhookData.baseCurrency) updateData.base_currency = webhookData.baseCurrency;
    if (webhookData.faceValue !== undefined) updateData.face_value = webhookData.faceValue;
    if (webhookData.faceValueInBaseCurrency !== undefined) {
      updateData.face_value_in_base_currency = webhookData.faceValueInBaseCurrency;
    }
    if (webhookData.cost !== undefined) updateData.cost = webhookData.cost; // xRemit provides cost directly
    if (webhookData.commission !== undefined) updateData.commission = webhookData.commission;
    if (webhookData.phazeCommission !== undefined) updateData.phaze_commission = webhookData.phazeCommission;
    if (webhookData.voucherCurrency) updateData.voucher_currency = webhookData.voucherCurrency;
    if (webhookData.deliveryFee !== undefined) updateData.delivery_fee = webhookData.deliveryFee;
    if (webhookData.transactionFee !== undefined) updateData.transaction_fee = webhookData.transactionFee;
    if (webhookData.transactionType !== undefined) updateData.transaction_type = webhookData.transactionType;

    // Currency conversions (store as JSONB)
    if (webhookData.currencyConversions) {
      updateData.currency_conversions = webhookData.currencyConversions;
    }

    // Product information
    if (webhookData.productName) updateData.product_name = webhookData.productName;
    if (webhookData.productDescription) updateData.product_description = webhookData.productDescription;
    if (webhookData.termsAndConditions) updateData.terms_and_conditions = webhookData.termsAndConditions;
    if (webhookData.howToUse) updateData.how_to_use = webhookData.howToUse;
    if (webhookData.expiryAndValidity) updateData.expiry_and_validity = webhookData.expiryAndValidity;

    // xRemit timestamps
    if (webhookData.created_at) updateData.xremit_created_at = webhookData.created_at;
    if (webhookData.updated_at) updateData.xremit_updated_at = webhookData.updated_at;

    // Handle error field - can be null, string, or stringified array
    if (webhookData.error !== null && webhookData.error !== undefined) {
      let errorMessage = webhookData.error;
      // If error is a stringified array, parse it
      if (typeof errorMessage === 'string' && errorMessage.startsWith('[')) {
        try {
          const errorArray = JSON.parse(errorMessage);
          errorMessage = Array.isArray(errorArray) ? errorArray.join('; ') : errorMessage;
        } catch (e) {
          // If parsing fails, use as-is
        }
      }
      updateData.error_message = errorMessage;
    }

    // Extract voucher information - xRemit sends array of vouchers
    if (webhookData.vouchers && Array.isArray(webhookData.vouchers) && webhookData.vouchers.length > 0) {
      // Store complete vouchers array as JSONB
      updateData.vouchers = webhookData.vouchers;

      // Extract first voucher to main fields for easy access
      const firstVoucher = webhookData.vouchers[0];
      if (firstVoucher.code) updateData.voucher_code = firstVoucher.code;
      if (firstVoucher.pin) updateData.voucher_pin = firstVoucher.pin;
      if (firstVoucher.validityDate) updateData.voucher_validity_date = firstVoucher.validityDate;
      if (firstVoucher.voucherCurrency) updateData.voucher_currency = firstVoucher.voucherCurrency || updateData.voucher_currency;
      if (firstVoucher.faceValue !== undefined) {
        // Use voucher faceValue if provided, otherwise keep webhook faceValue
        if (!updateData.face_value) updateData.face_value = firstVoucher.faceValue;
      }
    }

    // Update order with all webhook data
    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('order_id', orderId);

    if (updateError) {
      console.error('[Webhook] Failed to update order:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update order' },
        { status: 500 }
      );
    }

    console.log('=================================');
    console.log('ORDER UPDATED SUCCESSFULLY');
    console.log('=================================');
    console.log('Order ID:', orderId);
    console.log('Status:', updateData.status);
    console.log('Product:', webhookData.productName || 'N/A');
    console.log('Face Value:', updateData.face_value || 'N/A');
    console.log('Cost:', updateData.cost || 'N/A');
    console.log('Commission:', updateData.commission || 'N/A');
    console.log('Voucher Code:', updateData.voucher_code || 'N/A');
    console.log('Voucher PIN:', updateData.voucher_pin || 'N/A');
    console.log('Vouchers Count:', webhookData.vouchers?.length || 0);
    console.log('=================================');

    // Send email notification to customer with voucher details
    if (updateData.status === 'completed' && updateData.voucher_code && existingOrder.user_email) {
      try {
        // Fetch product image from brands table
        let productImage: string | null = null;
        if (existingOrder.product_id) {
          try {
            const { data: brandData } = await supabase
              .from('brands')
              .select('product_image')
              .eq('product_id', existingOrder.product_id)
              .single();

            if (brandData && brandData.product_image) {
              productImage = brandData.product_image;
            }
          } catch (err) {
            console.warn('Could not fetch product image for email:', err);
          }
        }

        // Extract redemption URL from voucher code if it's a URL
        const voucherCode = updateData.voucher_code;
        const redemptionUrl = (voucherCode.startsWith('http://') || voucherCode.startsWith('https://'))
          ? voucherCode
          : undefined;

        // Send email
        const emailResult = await sendVoucherEmail({
          to: existingOrder.user_email,
          orderId: orderId,
          brandName: updateData.product_name || existingOrder.brand_name,
          cardValue: updateData.face_value?.toString() || existingOrder.price.toString(),
          currency: updateData.voucher_currency || existingOrder.currency,
          voucherCode: voucherCode,
          voucherPin: updateData.voucher_pin || undefined,
          redemptionUrl: redemptionUrl,
          validityDate: updateData.voucher_validity_date || undefined,
          productImage: productImage || undefined,
          howToUse: updateData.how_to_use || undefined,
        });

        if (emailResult.success) {
          console.log('Voucher email sent successfully to:', existingOrder.user_email);
        } else {
          console.warn('Failed to send voucher email:', emailResult.error);
        }
      } catch (emailError) {
        console.error('Error sending voucher email:', emailError);
        // Don't fail the webhook if email fails - order is still updated successfully
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      orderId: orderId,
      status: updateData.status,
      voucherCode: updateData.voucher_code
    });

  } catch (error) {
    console.error('[Webhook] Processing error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Webhook processing failed'
      },
      { status: 500 }
    );
  }
}
