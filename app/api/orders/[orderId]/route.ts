import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchXremitTransaction, processXremitTransaction } from '@/lib/xremit';
import { sendVoucherEmail } from '@/lib/email';
import { verifyOrderToken } from '@/lib/auth-token';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Authentication: require a signed order token
    // Token is issued by the purchase endpoint and encodes orderId + userId
    const authHeader = request.headers.get('authorization');
    const tokenParam = request.nextUrl.searchParams.get('token');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : tokenParam;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required. Provide a valid order token.' },
        { status: 401 }
      );
    }

    const tokenPayload = verifyOrderToken(token, orderId);
    if (!tokenPayload) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired order token.' },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    // Fetch order — token already proves ownership via signed orderId + userId
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .eq('user_id', tokenPayload.userId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    // Fallback: If order is stuck in processing and webhook hasn't arrived,
    // try fetching from xRemit API
    if ((data.status === 'processing' || data.status === 'pending') &&
        !data.voucher_code) {

      try {
        logger.info(`[Orders] Order ${orderId} still processing, checking xRemit...`);

        const xremitData = await fetchXremitTransaction(orderId);

        if (xremitData.status === 'processed' && xremitData.vouchers?.length > 0) {
          logger.info(`[Orders] Voucher found for order ${orderId}, updating...`);

          const updateData = processXremitTransaction(xremitData);

          const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update(updateData)
            .eq('order_id', orderId)
            .select()
            .single();

          if (!updateError && updatedOrder) {
            logger.info(`[Orders] Order ${orderId} updated from xRemit fallback`);

            // Only send voucher email if we just transitioned to completed
            // (order was previously in processing/pending, not already completed with voucher)
            // This prevents duplicate emails when multiple status-check requests race
            if (updatedOrder.status === 'completed' && updatedOrder.voucher_code && data.user_email
                && !data.voucher_code) {
              try {
                let productImage: string | null = null;
                if (data.product_id) {
                  const { data: brandData } = await supabase
                    .from('brands')
                    .select('product_image')
                    .eq('product_id', data.product_id)
                    .single();

                  if (brandData?.product_image) {
                    productImage = brandData.product_image;
                  }
                }

                const voucherCode = updatedOrder.voucher_code;
                const redemptionUrl = (voucherCode.startsWith('http://') || voucherCode.startsWith('https://'))
                  ? voucherCode
                  : undefined;

                const emailResult = await sendVoucherEmail({
                  to: data.user_email,
                  orderId: orderId,
                  brandName: updatedOrder.product_name || data.brand_name,
                  cardValue: updatedOrder.face_value?.toString() || data.price?.toString(),
                  currency: updatedOrder.voucher_currency || data.currency,
                  voucherCode: voucherCode,
                  voucherPin: updatedOrder.voucher_pin || undefined,
                  redemptionUrl: redemptionUrl,
                  validityDate: updatedOrder.voucher_validity_date || undefined,
                  productImage: productImage || undefined,
                  howToUse: updatedOrder.how_to_use || undefined,
                });

                if (emailResult.success) {
                  logger.info(`[Orders] Voucher email sent for order ${orderId} (fallback)`);
                } else {
                  logger.warn(`[Orders] Failed to send voucher email (fallback)`);
                }
              } catch (emailError) {
                logger.error(`[Orders] Email error (fallback):`, emailError instanceof Error ? emailError.message : 'Unknown');
              }
            }

            return NextResponse.json({
              success: true,
              data: updatedOrder,
              source: 'xremit_fallback'
            });
          }
        }
      } catch (xremitError) {
        logger.error(`[Orders] xRemit fallback failed for ${orderId}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: data,
      source: 'database'
    });

  } catch (error) {
    logger.error('[Orders] Error fetching order:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch order' },
      { status: 500 }
    );
  }
}
