import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import { fetchXremitTransaction, processXremitTransaction } from '@/lib/xremit';
import { sendVoucherEmail, sendOrderFailureAlert, sendOrderCompletedAlert } from '@/lib/email';
import { NETWORKS, getNetwork } from '@/config/networks';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FACILITATOR_PRIVATE_KEY =
  process.env.FACILITATOR_MAINNET_PRIVATE_KEY || process.env.FACILITATOR_PRIVATE_KEY;

const TOKEN_ABI = [
  'function transfer(address to, uint256 value) external returns (bool)',
];

// Orders older than this with no resolution are eligible for refund
const REFUND_AFTER_MS = 24 * 60 * 60 * 1000; // 24h
// Don't touch orders younger than this — give xRemit time to process
const MIN_AGE_MS = 5 * 60 * 1000; // 5 min
// Cap how many orders we resolve per invocation
const MAX_ORDERS_PER_RUN = 25;

interface ResolutionSummary {
  orderId: string;
  action: 'completed' | 'refunded' | 'still_pending' | 'manual_required' | 'error';
  detail?: string;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const queryToken = request.nextUrl.searchParams.get('secret') || '';
  // Vercel Cron sends "Bearer <CRON_SECRET>"
  return bearer === secret || queryToken === secret;
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoffMaxAge = new Date(Date.now() - MIN_AGE_MS).toISOString();

  // Fetch stuck orders: pending_review or processing, no voucher yet.
  // We deliberately exclude bare 'pending' — those rows are inserted before
  // payment settlement. If a server crash leaves one in 'pending' with no
  // payment_tx, we MUST NOT refund it (no funds were ever received).
  const { data: stuckOrders, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .in('status', ['pending_review', 'processing'])
    .is('voucher_code', null)
    .lt('created_at', cutoffMaxAge)
    .order('created_at', { ascending: true })
    .limit(MAX_ORDERS_PER_RUN);

  if (fetchError) {
    logger.error('[CronResolve] Failed to fetch stuck orders:', fetchError.message);
    return NextResponse.json({ success: false, error: 'Failed to query orders' }, { status: 500 });
  }

  const summaries: ResolutionSummary[] = [];

  for (const order of stuckOrders || []) {
    try {
      const summary = await resolveOrder(supabase, order);
      summaries.push(summary);
    } catch (err) {
      logger.error(`[CronResolve] Unhandled error resolving ${order.order_id}:`, err instanceof Error ? err.message : 'Unknown');
      summaries.push({
        orderId: order.order_id,
        action: 'error',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // Cleanup expired OTP records (older than 1 hour) to prevent unbounded DB growth
  let otpCleaned = 0;
  try {
    const otpCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
    const { count, error: otpDeleteError } = await supabase
      .from('email_otps')
      .delete({ count: 'exact' })
      .lt('expires_at', otpCutoff);

    if (otpDeleteError) {
      logger.warn('[CronResolve] OTP cleanup failed:', otpDeleteError.message);
    } else {
      otpCleaned = count || 0;
      if (otpCleaned > 0) {
        logger.info(`[CronResolve] Cleaned up ${otpCleaned} expired OTP record(s).`);
      }
    }
  } catch (otpErr) {
    logger.warn('[CronResolve] OTP cleanup error:', otpErr instanceof Error ? otpErr.message : 'Unknown');
  }

  logger.info(`[CronResolve] Run complete. Processed ${summaries.length} order(s), cleaned ${otpCleaned} OTP(s).`);

  return NextResponse.json({
    success: true,
    processed: summaries.length,
    otpsCleaned: otpCleaned,
    results: summaries,
  });
}

async function resolveOrder(supabase: any, order: any): Promise<ResolutionSummary> {
  const orderId = order.order_id;

  // 1. Try fetching from xRemit — voucher may now be available
  let xremitData: any = null;
  try {
    xremitData = await fetchXremitTransaction(orderId);
  } catch (err) {
    logger.warn(`[CronResolve] xRemit lookup failed for ${orderId}: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  if (xremitData?.status === 'processed' && xremitData.vouchers?.length > 0) {
    // Voucher available — mark complete and email user
    const updateData = processXremitTransaction(xremitData);
    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('order_id', orderId)
      .select()
      .single();

    if (updateError) {
      return { orderId, action: 'error', detail: `DB update failed: ${updateError.message}` };
    }

    if (updated?.voucher_code && order.user_email) {
      try {
        let productImage: string | undefined;
        if (order.product_id) {
          const { data: brand } = await supabase
            .from('brands')
            .select('product_image')
            .eq('product_id', order.product_id)
            .single();
          productImage = brand?.product_image || undefined;
        }

        const voucherCode = updated.voucher_code as string;
        const redemptionUrl = voucherCode.startsWith('http') ? voucherCode : undefined;

        await sendVoucherEmail({
          to: order.user_email,
          orderId,
          brandName: updated.product_name || order.brand_name,
          cardValue: updated.face_value?.toString() || order.price?.toString(),
          currency: updated.voucher_currency || order.currency,
          voucherCode,
          voucherPin: updated.voucher_pin || undefined,
          redemptionUrl,
          validityDate: updated.voucher_validity_date || undefined,
          productImage,
          howToUse: updated.how_to_use || undefined,
        });
        logger.info(`[CronResolve] Voucher email sent for ${orderId}`);
      } catch (emailErr) {
        logger.error(`[CronResolve] Failed to send voucher email for ${orderId}:`, emailErr instanceof Error ? emailErr.message : 'Unknown');
      }
    }

    // Ops alert — recovered stuck order
    const meta = safeParse(order.error_message) || {};
    sendOrderCompletedAlert({
      orderId,
      productName: updated?.product_name || order.brand_name,
      productId: order.product_id,
      price: updated?.face_value || order.price,
      currency: updated?.voucher_currency || order.currency,
      userEmail: order.user_email,
      paymentTxHash: meta.payment_tx,
      paymentNetwork: meta.payment_network,
      source: 'cron',
    }).catch(err => logger.error(`[CronResolve] Alert send failed for ${orderId}:`, err instanceof Error ? err.message : 'Unknown'));

    return { orderId, action: 'completed' };
  }

  // 2. Not yet processed at xRemit. If still under refund threshold, leave it.
  const ageMs = Date.now() - new Date(order.created_at).getTime();
  if (ageMs < REFUND_AFTER_MS) {
    return { orderId, action: 'still_pending', detail: `Age ${Math.round(ageMs / 60000)}m < 24h threshold` };
  }

  // 3. Past 24h with no voucher — attempt refund
  return await refundOrder(supabase, order);
}

async function refundOrder(supabase: any, order: any): Promise<ResolutionSummary> {
  const orderId = order.order_id;

  // SAFETY: refuse to refund unless we have positive proof of inbound payment.
  // payment_tx is set only after settlement broadcasts the on-chain transfer.
  // Without it, this could be a row that crashed mid-flow before any payment
  // was ever collected — refunding would be a free withdrawal from the facilitator.
  const meta = safeParse(order.error_message) || {};
  const paymentTx: string | undefined = order.payment_tx || meta.payment_tx;
  if (!paymentTx) {
    await supabase
      .from('orders')
      .update({
        status: 'failed',
        error_message: JSON.stringify({
          ...meta,
          message: 'Pending >24h with no payment_tx — flagged for manual review (no refund issued)',
          requires_manual_review: true,
          flagged_by: 'cron_resolve',
          flagged_at: new Date().toISOString(),
        }),
      })
      .eq('order_id', orderId);

    await sendOrderFailureAlert({
      orderId,
      productName: order.brand_name,
      productId: order.product_id,
      price: order.price,
      currency: order.currency,
      userEmail: order.user_email,
      errorMessage: 'Order pending >24h with NO payment_tx — refund SKIPPED (could be unpaid). Manual review required.',
      requiresRefund: false,
    }).catch(err => logger.error(`[CronResolve] Alert send failed for ${orderId}:`, err instanceof Error ? err.message : 'Unknown'));

    return { orderId, action: 'manual_required', detail: 'No payment_tx — refund skipped' };
  }

  // Need payment metadata stored on the order or in error_message JSON
  let paymentFrom: string | undefined;
  let paymentValue: string | undefined;
  let paymentNetwork: string | undefined;

  // Try direct columns first
  paymentFrom = order.payment_from;
  paymentValue = order.payment_value;
  paymentNetwork = order.payment_network;

  // Fall back to parsing error_message JSON (where pending_review path stores it)
  if (!paymentFrom || !paymentValue || !paymentNetwork) {
    paymentFrom = paymentFrom || meta.payment_from;
    paymentValue = paymentValue || meta.payment_value;
    paymentNetwork = paymentNetwork || meta.payment_network;
  }

  if (!paymentFrom || !paymentValue || !paymentNetwork) {
    await supabase
      .from('orders')
      .update({
        status: 'failed',
        error_message: JSON.stringify({
          ...(safeParse(order.error_message) || {}),
          message: 'Pending >24h, payment metadata missing — manual refund required',
          requires_manual_refund: true,
          flagged_by: 'cron_resolve',
          flagged_at: new Date().toISOString(),
        }),
      })
      .eq('order_id', orderId);

    await sendOrderFailureAlert({
      orderId,
      productName: order.brand_name,
      productId: order.product_id,
      price: order.price,
      currency: order.currency,
      userEmail: order.user_email,
      errorMessage: 'Order pending >24h with no voucher and payment metadata missing from DB',
      requiresRefund: true,
    }).catch(err => logger.error(`[CronResolve] Alert send failed for ${orderId}:`, err instanceof Error ? err.message : 'Unknown'));

    return { orderId, action: 'manual_required', detail: 'Missing payment metadata' };
  }

  // Map x402Network string back to NETWORKS config
  const networkKey = Object.keys(NETWORKS).find(
    (k) => NETWORKS[k as keyof typeof NETWORKS].x402Network === paymentNetwork
  );
  if (!networkKey) {
    return { orderId, action: 'manual_required', detail: `Unknown network ${paymentNetwork}` };
  }
  const cfg = getNetwork(networkKey as any);

  if (!FACILITATOR_PRIVATE_KEY) {
    return { orderId, action: 'error', detail: 'Facilitator key not configured' };
  }

  try {
    const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
    const facilitator = new ethers.Wallet(FACILITATOR_PRIVATE_KEY, provider);
    const token = new ethers.Contract(cfg.tokenAddress, TOKEN_ABI, facilitator);

    const refundTx = await token.transfer(paymentFrom, paymentValue);
    logger.info(`[CronResolve] Refund TX submitted for ${orderId}: ${refundTx.hash}`);
    const receipt = await refundTx.wait();
    logger.info(`[CronResolve] Refund confirmed for ${orderId} in block ${receipt.blockNumber}`);

    await supabase
      .from('orders')
      .update({
        status: 'failed',
        error_message: JSON.stringify({
          ...(safeParse(order.error_message) || {}),
          message: 'Auto-refunded by cron after 24h with no voucher',
          refund_tx: refundTx.hash,
          refunded_at: new Date().toISOString(),
        }),
      })
      .eq('order_id', orderId);

    // FYI alert — refund went through, no manual action needed but ops should know
    await sendOrderFailureAlert({
      orderId,
      productName: order.brand_name,
      productId: order.product_id,
      price: order.price,
      currency: order.currency,
      userEmail: order.user_email,
      errorMessage: 'Auto-refunded by cron after 24h with no voucher from xRemit',
      paymentTxHash: safeParse(order.error_message)?.payment_tx,
      paymentNetwork: paymentNetwork,
      paymentFrom: paymentFrom,
      paymentValue: paymentValue,
      requiresRefund: false,
    }).catch(err => logger.error(`[CronResolve] Alert send failed for ${orderId}:`, err instanceof Error ? err.message : 'Unknown'));

    return { orderId, action: 'refunded', detail: refundTx.hash };
  } catch (refundErr) {
    logger.error(`[CronResolve] Refund failed for ${orderId}:`, refundErr instanceof Error ? refundErr.message : 'Unknown');
    await supabase
      .from('orders')
      .update({
        status: 'failed',
        error_message: JSON.stringify({
          ...(safeParse(order.error_message) || {}),
          message: 'Auto-refund attempt failed — manual refund required',
          refund_error: refundErr instanceof Error ? refundErr.message : 'Unknown',
          requires_manual_refund: true,
          flagged_by: 'cron_resolve',
          flagged_at: new Date().toISOString(),
        }),
      })
      .eq('order_id', orderId);

    await sendOrderFailureAlert({
      orderId,
      productName: order.brand_name,
      productId: order.product_id,
      price: order.price,
      currency: order.currency,
      userEmail: order.user_email,
      errorMessage: `Auto-refund attempt failed: ${refundErr instanceof Error ? refundErr.message : 'Unknown error'}`,
      paymentTxHash: safeParse(order.error_message)?.payment_tx,
      paymentNetwork: paymentNetwork,
      paymentFrom: paymentFrom,
      paymentValue: paymentValue,
      requiresRefund: true,
    }).catch(err => logger.error(`[CronResolve] Alert send failed for ${orderId}:`, err instanceof Error ? err.message : 'Unknown'));

    return { orderId, action: 'manual_required', detail: 'Refund attempt failed' };
  }
}

function safeParse(s: any): any | null {
  if (!s || typeof s !== 'string') return null;
  try { return JSON.parse(s); } catch { return null; }
}
