import { Resend } from 'resend';

// Initialize Resend only if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ============================================
// Voucher Email
// ============================================

interface VoucherEmailData {
  to: string;
  orderId: string;
  brandName: string;
  cardValue: string;
  currency: string;
  voucherCode: string;
  voucherPin?: string;
  redemptionUrl?: string;
  validityDate?: string;
  productImage?: string;
  howToUse?: string;
}

/**
 * Send voucher email to customer after successful purchase
 */
export async function sendVoucherEmail(data: VoucherEmailData): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY || !resend) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping email send');
    console.warn('⚠️ Please set RESEND_API_KEY in your .env.local file');
    return { success: false, error: 'Email service not configured - RESEND_API_KEY missing' };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    // Build the email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Gift Card is Ready!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #9333EA 0%, #7C3AED 100%); padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">🎁 Your Gift Card is Ready!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 30px;">

              <!-- Gift Card Display -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-radius: 12px; padding: 25px; margin-bottom: 25px; border: 2px solid #9333EA;">
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="120" valign="middle" style="padding-right: 15px;">
                          ${data.productImage && data.productImage.trim() !== '' ? `
                          <img src="${data.productImage}" alt="${data.brandName}" style="width: 100px; height: 100px; object-fit: contain; background: #ffffff; border-radius: 8px; padding: 10px; border: 2px solid #9333EA; display: block;" />
                          ` : `
                          <table width="100" height="100" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; border: 2px solid #9333EA;">
                            <tr>
                              <td align="center" valign="middle" style="padding: 10px;">
                                <span style="font-size: 60px; line-height: 1;">🎁</span>
                              </td>
                            </tr>
                          </table>
                          `}
                        </td>
                        <td valign="middle">
                          <h2 style="margin: 0 0 10px 0; color: #1a1a1a; font-size: 22px; font-weight: bold;">${data.brandName}</h2>
                          <p style="margin: 0; color: #9333EA; font-size: 32px; font-weight: bold;">${data.currency} ${data.cardValue}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Voucher Details -->
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 18px; font-weight: bold;">Voucher Details</h3>

                <table width="100%" cellpadding="8" cellspacing="0">
                  <tr>
                    <td style="color: #666666; font-size: 14px; padding: 8px 0; border-bottom: 1px solid #e0e0e0;">Order ID:</td>
                    <td style="color: #1a1a1a; font-size: 14px; font-weight: 500; padding: 8px 0; border-bottom: 1px solid #e0e0e0; text-align: right; font-family: monospace;">${data.orderId.substring(0, 8)}...</td>
                  </tr>
                  ${data.redemptionUrl ? `
                  <tr>
                    <td style="color: #666666; font-size: 14px; padding: 8px 0; border-bottom: 1px solid #e0e0e0;">Redemption URL:</td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; text-align: right;">
                      <a href="${data.redemptionUrl}" style="color: #9333EA; text-decoration: none; font-size: 14px; word-break: break-all;">Click to Redeem →</a>
                    </td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="color: #666666; font-size: 14px; padding: 8px 0; border-bottom: 1px solid #e0e0e0;">Code:</td>
                    <td style="color: #1a1a1a; font-size: 14px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #e0e0e0; text-align: right; font-family: monospace; word-break: break-all;">${data.voucherCode}</td>
                  </tr>
                  ${data.voucherPin ? `
                  <tr>
                    <td style="color: #666666; font-size: 14px; padding: 8px 0;">PIN:</td>
                    <td style="color: #1a1a1a; font-size: 14px; font-weight: bold; padding: 8px 0; text-align: right; font-family: monospace;">${data.voucherPin}</td>
                  </tr>
                  ` : `
                  <tr>
                    <td style="color: #666666; font-size: 14px; padding: 8px 0;">PIN:</td>
                    <td style="color: #999999; font-size: 14px; padding: 8px 0; text-align: right; font-style: italic;">Not required</td>
                  </tr>
                  `}
                </table>

                ${data.validityDate ? `
                <p style="margin: 15px 0 0 0; color: #666666; font-size: 13px; text-align: center;">
                  <strong>Valid until:</strong> ${new Date(data.validityDate).toLocaleDateString()}
                </p>
                ` : ''}
              </div>

              ${data.redemptionUrl ? `
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px;">
                <tr>
                  <td align="center">
                    <a href="${data.redemptionUrl}" style="display: inline-block; background-color: #9333EA; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">Redeem Your Gift Card</a>
                  </td>
                </tr>
              </table>
              ` : ''}

              ${data.howToUse ? `
              <!-- How to Use -->
              <div style="background-color: #f0f7ff; border-left: 4px solid #0066cc; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                <h3 style="margin: 0 0 10px 0; color: #1a1a1a; font-size: 16px; font-weight: bold;">How to Use:</h3>
                <div style="color: #333333; font-size: 14px; line-height: 1.6;">
                  ${data.howToUse.replace(/\n/g, '<br>')}
                </div>
              </div>
              ` : ''}

              <!-- Footer -->
              <p style="margin: 30px 0 0 0; color: #999999; font-size: 12px; text-align: center; line-height: 1.6;">
                Thank you for your purchase from CYM Studio!<br>
                If you have any questions, please contact support.
              </p>

            </td>
          </tr>

          <!-- Footer Bar -->
          <tr>
            <td style="background-color: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999999; font-size: 11px;">
                This email was sent to ${data.to}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Send the email
    const result = await resend.emails.send({
      from: fromEmail,
      to: data.to,
      subject: `Your ${data.brandName} Gift Card (${data.currency} ${data.cardValue}) is Ready! 🎁`,
      html: emailHtml,
    });

    console.log('✅ Email sent successfully:', result);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ============================================
// Email OTP (verification code)
// ============================================

interface OtpEmailData {
  to: string;
  code: string;
}

/**
 * Send a 6-digit OTP code to the user for email verification.
 * Used to ensure vouchers are delivered to a valid, owned address.
 */
export async function sendOtpEmail(data: OtpEmailData): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY || !resend) {
    console.warn('⚠️ RESEND_API_KEY not configured - cannot send OTP');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your CYM Studio verification code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #4F46E5 0%, #6366F1 100%); padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">Verify your email</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; color: #333; font-size: 15px; line-height: 1.6;">
                Enter this code in the gift card checkout to verify your email address:
              </p>
              <div style="background: #f5f3ff; border: 2px solid #6366F1; border-radius: 12px; padding: 25px; text-align: center; margin-bottom: 20px;">
                <p style="margin: 0; color: #4F46E5; font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${data.code}</p>
              </div>
              <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">This code expires in <strong>10 minutes</strong>.</p>
              <p style="margin: 0; color: #666; font-size: 14px;">If you did not request this code, you can safely ignore this email.</p>
              <p style="margin: 25px 0 0 0; color: #999; font-size: 12px; line-height: 1.6;">
                Why we ask: gift card vouchers are delivered by email and cannot be recovered if sent to a typo'd address. This one-time check protects your purchase.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f5f5f5; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999; font-size: 11px;">CYM Studio — Email verification</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const result = await resend.emails.send({
      from: fromEmail,
      to: data.to,
      subject: `Your CYM Studio verification code: ${data.code}`,
      html: emailHtml,
    });

    console.log('✅ OTP email sent:', result);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ============================================
// Order Delayed (customer-facing)
// ============================================

interface OrderDelayedEmailData {
  to: string;
  orderId: string;
  brandName?: string;
  cardValue?: string;
  currency?: string;
}

/**
 * Notify the customer that their order is delayed and being investigated.
 * Sent when an order enters pending_review or fails with refund pending.
 * Sets expectation: refund within ~48 hours if voucher cannot be delivered.
 */
export async function sendOrderDelayedEmail(data: OrderDelayedEmailData): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY || !resend) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping delayed-order email');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const productLine = data.brandName
      ? `${data.brandName}${data.cardValue && data.currency ? ` (${data.currency} ${data.cardValue})` : ''}`
      : 'your gift card';

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your CYM Studio order is being reviewed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">We're looking into your order</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px; color: #333; font-size: 15px; line-height: 1.6;">
              <p style="margin-top: 0;">Hi there,</p>
              <p>
                Thanks for your purchase of <strong>${productLine}</strong>. Your payment was received,
                but our gift card provider hasn't confirmed delivery of your voucher yet.
              </p>
              <p>
                Our team has been notified and is investigating. <strong>If we can't deliver your voucher,
                you'll be automatically refunded to the wallet you paid from within approximately 48 hours.</strong>
              </p>
              <p>
                If your voucher does come through in the meantime, we'll email it to you as soon as it arrives —
                no action needed on your end.
              </p>
              <table width="100%" cellpadding="10" cellspacing="0" style="margin-top: 20px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
                <tr>
                  <td style="font-size: 13px; color: #6b7280;">Order ID</td>
                  <td style="font-size: 13px; color: #111827; font-family: monospace; text-align: right;">${data.orderId}</td>
                </tr>
              </table>
              <p style="margin-top: 24px;">
                Questions? Reply to this email or reach us at
                <a href="mailto:info@ginsengswap.com" style="color: #d97706;">info@ginsengswap.com</a>
                with your order ID and we'll get back to you quickly.
              </p>
              <p style="margin-bottom: 0;">— The CYM Studio team</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f5f5f5; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999; font-size: 11px;">CYM Studio — Gift Cards Powered by x402</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const result = await resend.emails.send({
      from: fromEmail,
      to: data.to,
      subject: `We're looking into your order ${data.orderId.substring(0, 8)} — refund in ~48h if not resolved`,
      html: emailHtml,
    });

    console.log('✅ Delayed-order email sent:', result);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send delayed-order email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ============================================
// Order Completed Alert (internal — ops notification)
// ============================================

interface OrderCompletedAlertData {
  orderId: string;
  productName?: string;
  productId?: number;
  price?: number | string;
  currency?: string;
  userEmail?: string;
  paymentTxHash?: string;
  paymentNetwork?: string;
  source: 'purchase' | 'webhook' | 'cron';
}

/**
 * Send internal alert to info@ginsengswap.com when an order is successfully placed/completed.
 * Used so the ops team has a real-time feed of sales activity.
 */
export async function sendOrderCompletedAlert(data: OrderCompletedAlertData): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY || !resend) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping completed-order alert');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const sourceLabel = {
      purchase: 'Order placed',
      webhook: 'Order completed (webhook)',
      cron: 'Order completed (cron recovery)',
    }[data.source];

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${sourceLabel}</title></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #16a34a; padding: 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px;">${sourceLabel}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 25px;">
              <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px; color: #333;">
                <tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee; width: 140px;">Order ID</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: monospace;">${data.orderId}</td></tr>
                ${data.productName ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Product</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.productName}${data.productId ? ` (${data.productId})` : ''}</td></tr>` : ''}
                ${data.price ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Amount</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.currency || ''} ${data.price}</td></tr>` : ''}
                ${data.userEmail ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Customer</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.userEmail}</td></tr>` : ''}
                ${data.paymentNetwork ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Network</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.paymentNetwork}</td></tr>` : ''}
                ${data.paymentTxHash ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Payment TX</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: monospace; font-size: 12px; word-break: break-all;">${data.paymentTxHash}</td></tr>` : ''}
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f5f5f5; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999; font-size: 11px;">CYM Studio — Automated Order Notification</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const result = await resend.emails.send({
      from: fromEmail,
      to: 'info@ginsengswap.com',
      subject: `[${data.source.toUpperCase()}] Order ${data.orderId.substring(0, 8)} — ${data.productName || 'Unknown Product'}`,
      html: emailHtml,
    });

    console.log('✅ Order completed alert sent:', result);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send completed-order alert:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ============================================
// Order Failure Alert (internal)
// ============================================

interface OrderFailureAlertData {
  orderId: string;
  productName?: string;
  productId?: number;
  price?: number;
  currency?: string;
  userEmail?: string;
  errorMessage?: string;
  paymentTxHash?: string;
  paymentNetwork?: string;
  paymentFrom?: string;
  paymentValue?: string;
  requiresRefund: boolean;
}

/**
 * Send internal alert to info@ginsengswap.com when an order fails
 * and may require manual refund.
 */
export async function sendOrderFailureAlert(data: OrderFailureAlertData): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY || !resend) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping failure alert');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order Failure Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #dc2626; padding: 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px;">Order Failed${data.requiresRefund ? ' — Refund Required' : ''}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 25px;">
              <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px; color: #333;">
                <tr>
                  <td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee; width: 140px;">Order ID</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: monospace;">${data.orderId}</td>
                </tr>
                ${data.productName ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Product</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.productName} (${data.productId})</td></tr>` : ''}
                ${data.price ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Amount</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.currency} ${data.price}</td></tr>` : ''}
                ${data.userEmail ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Customer</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.userEmail}</td></tr>` : ''}
                ${data.errorMessage ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Error</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #dc2626;">${data.errorMessage}</td></tr>` : ''}
                ${data.paymentTxHash ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Payment TX</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: monospace; font-size: 12px; word-break: break-all;">${data.paymentTxHash}</td></tr>` : ''}
                ${data.paymentNetwork ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Network</td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.paymentNetwork}</td></tr>` : ''}
                ${data.paymentFrom ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Refund To</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: monospace; font-size: 12px; word-break: break-all;">${data.paymentFrom}</td></tr>` : ''}
                ${data.paymentValue ? `<tr><td style="font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee;">Refund Amount</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: monospace;">${data.paymentValue} atomic units (${(parseInt(data.paymentValue) / 1e6).toFixed(2)} tokens)</td></tr>` : ''}
              </table>

              ${data.requiresRefund ? `
              <div style="margin-top: 20px; padding: 15px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
                <p style="margin: 0; color: #dc2626; font-weight: bold;">Action required: Manual refund needed for this order.</p>
              </div>
              ` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f5f5f5; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999; font-size: 11px;">CYM Studio — Automated Order Alert</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const result = await resend.emails.send({
      from: fromEmail,
      to: 'info@ginsengswap.com',
      subject: `${data.requiresRefund ? '[REFUND REQUIRED]' : '[FAILED]'} Order ${data.orderId.substring(0, 8)} — ${data.productName || 'Unknown Product'}`,
      html: emailHtml,
    });

    console.log('✅ Failure alert sent:', result);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send failure alert:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
