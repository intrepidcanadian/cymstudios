import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchXremitTransaction, processXremitTransaction } from '@/lib/xremit';
import { sendVoucherEmail } from '@/lib/email';

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

    // Get authentication from request headers or query params
    const userId = request.headers.get('x-user-id') || request.nextUrl.searchParams.get('userId');
    const userEmail = request.headers.get('x-user-email') || request.nextUrl.searchParams.get('userEmail');

    // Require at least one authentication method
    if (!userId && !userEmail) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required. Please provide userId or userEmail.'
        },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    // Fetch order with authentication check
    let query = supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId);

    // Add user verification - must match BOTH order_id AND user identity
    if (userId) {
      query = query.eq('user_id', userId);
    } else if (userEmail) {
      query = query.eq('user_email', userEmail);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json(
        {
          success: false,
          error: 'Order not found or you do not have permission to view it'
        },
        { status: 404 }
      );
    }

    // Fallback: If order is stuck in processing and webhook hasn't arrived,
    // try fetching from xRemit API
    if ((data.status === 'processing' || data.status === 'pending') &&
        !data.voucher_code) {

      try {
        console.log(`Order ${orderId} still processing, checking xRemit for updates...`);

        const xremitData = await fetchXremitTransaction(orderId);

        // If xRemit has the voucher ready, update our database
        if (xremitData.status === 'processed' && xremitData.vouchers?.length > 0) {
          console.log(`Voucher found for order ${orderId}, updating database...`);

          const updateData = processXremitTransaction(xremitData);

          const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update(updateData)
            .eq('order_id', orderId)
            .select()
            .single();

          if (!updateError && updatedOrder) {
            console.log(`Order ${orderId} updated successfully from xRemit fallback`);

            // Send email notification if order is now completed with voucher
            if (updatedOrder.status === 'completed' && updatedOrder.voucher_code && data.user_email) {
              try {
                // Fetch product image from brands table
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

                // Extract redemption URL if voucher code is a URL
                const voucherCode = updatedOrder.voucher_code;
                const redemptionUrl = (voucherCode.startsWith('http://') || voucherCode.startsWith('https://'))
                  ? voucherCode
                  : undefined;

                // Send voucher email
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
                  console.log(`Voucher email sent successfully to ${data.user_email} (fallback path)`);
                } else {
                  console.warn(`Failed to send voucher email (fallback path):`, emailResult.error);
                }
              } catch (emailError) {
                console.error(`Error sending voucher email (fallback path):`, emailError);
                // Don't fail the request if email fails
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
        // Log error but don't fail the request
        console.error(`xRemit fallback failed for order ${orderId}:`, xremitError);
      }
    }

    return NextResponse.json({
      success: true,
      data: data,
      source: 'database'
    });

  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch order'
      },
      { status: 500 }
    );
  }
}
