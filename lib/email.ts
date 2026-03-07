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
