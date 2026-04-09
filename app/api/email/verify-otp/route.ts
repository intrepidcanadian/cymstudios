import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;

function hashCode(code: string, email: string): string {
  return crypto.createHash('sha256').update(`${code}:${email}`).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json({ success: false, error: 'Email and code are required' }, { status: 400 });
    }

    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ success: false, error: 'Invalid code format' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch current OTP record
    const { data: otpRecord, error: fetchError } = await supabase
      .from('email_otps')
      .select('code_hash, expires_at, attempts')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (fetchError || !otpRecord) {
      return NextResponse.json(
        { success: false, error: 'No verification code found for this email. Please request a new code.' },
        { status: 404 }
      );
    }

    // Check expiration
    if (new Date(otpRecord.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Verification code has expired. Please request a new code.' },
        { status: 410 }
      );
    }

    // Check attempt count
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { success: false, error: 'Too many incorrect attempts. Please request a new code.' },
        { status: 429 }
      );
    }

    // Compare code (timing-safe)
    const expectedHash = hashCode(code, normalizedEmail);
    const isMatch = timingSafeEqual(otpRecord.code_hash, expectedHash);

    if (!isMatch) {
      // Increment attempts
      await supabase
        .from('email_otps')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('email', normalizedEmail);

      const remaining = MAX_ATTEMPTS - (otpRecord.attempts + 1);
      return NextResponse.json(
        {
          success: false,
          error: remaining > 0
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Too many incorrect attempts. Please request a new code.',
        },
        { status: 401 }
      );
    }

    // Success — mark email as verified, delete OTP record
    await supabase
      .from('verified_emails')
      .upsert({ email: normalizedEmail, verified_at: new Date().toISOString() }, { onConflict: 'email' });

    await supabase
      .from('email_otps')
      .delete()
      .eq('email', normalizedEmail);

    logger.info(`[OTP] Verified email: ${normalizedEmail}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[OTP] verify-otp error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
