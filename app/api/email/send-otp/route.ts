import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendOtpEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// In-memory rate limit per email — 3 sends per 10 minutes
const recentSends = new Map<string, number[]>();
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 3;

function hashCode(code: string, email: string): string {
  return crypto.createHash('sha256').update(`${code}:${email}`).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: max 3 OTP sends per email per 10 minutes
    const now = Date.now();
    const sends = (recentSends.get(normalizedEmail) || []).filter(t => now - t < SEND_WINDOW_MS);
    if (sends.length >= MAX_SENDS_PER_WINDOW) {
      const oldestExpiresInSec = Math.ceil((SEND_WINDOW_MS - (now - sends[0])) / 1000);
      return NextResponse.json(
        { success: false, error: `Too many verification requests. Try again in ${Math.ceil(oldestExpiresInSec / 60)} minutes.` },
        { status: 429 }
      );
    }
    sends.push(now);
    recentSends.set(normalizedEmail, sends);

    // Cleanup old entries periodically
    if (recentSends.size > 1000) {
      const cutoff = now - SEND_WINDOW_MS;
      recentSends.forEach((times, key) => {
        const fresh = times.filter(t => t > cutoff);
        if (fresh.length === 0) recentSends.delete(key);
        else recentSends.set(key, fresh);
      });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // If email already verified, no need to send OTP
    const { data: existing } = await supabase
      .from('verified_emails')
      .select('email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }

    // Generate 6-digit code (cryptographically secure)
    const code = (crypto.randomInt(0, 1_000_000)).toString().padStart(6, '0');
    const codeHash = hashCode(code, normalizedEmail);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Upsert OTP record (replaces previous unverified attempts)
    const { error: upsertError } = await supabase
      .from('email_otps')
      .upsert(
        { email: normalizedEmail, code_hash: codeHash, expires_at: expiresAt, attempts: 0 },
        { onConflict: 'email' }
      );

    if (upsertError) {
      logger.error('[OTP] Failed to store OTP:', upsertError.message);
      return NextResponse.json({ success: false, error: 'Failed to generate verification code' }, { status: 500 });
    }

    // Send the email
    const emailResult = await sendOtpEmail({ to: email, code });
    if (!emailResult.success) {
      logger.error('[OTP] Failed to send OTP email:', emailResult.error);
      return NextResponse.json(
        { success: false, error: 'Unable to send verification email. Please check the address and try again.' },
        { status: 502 }
      );
    }

    logger.info(`[OTP] Sent code to ${normalizedEmail}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[OTP] send-otp error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
