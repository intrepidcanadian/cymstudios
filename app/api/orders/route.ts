import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PrivyClient } from '@privy-io/node';
import { generateOrderToken } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const privyClient = new PrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

export async function GET(request: NextRequest) {
  try {
    // Verify Privy access token
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    let verifiedClaims;
    try {
      verifiedClaims = await privyClient.utils().auth().verifyAccessToken(accessToken);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired access token' },
        { status: 401 }
      );
    }

    // Derive email from the authenticated Privy user — never trust the client param
    const privyUserId = verifiedClaims.user_id;
    let userEmail: string | null = null;

    try {
      const privyUser = await privyClient.users()._get(privyUserId);
      for (const account of privyUser.linked_accounts) {
        if (account.type === 'email') {
          userEmail = account.address;
          break;
        }
        if (account.type === 'google_oauth' && account.email) {
          userEmail = account.email;
          break;
        }
      }
    } catch (err) {
      console.error('[Orders] Failed to fetch Privy user:', err);
      return NextResponse.json(
        { success: false, error: 'Failed to verify user identity' },
        { status: 500 }
      );
    }

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: 'No email associated with your account' },
        { status: 400 }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('orders')
      .select(
        'order_id, brand_name, country_name, currency, price, status, ' +
        'face_value, voucher_currency, product_name, ' +
        'created_at, completed_at, error_message'
      )
      .eq('user_email', userEmail)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Orders] Error fetching user orders:', error.message);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    // Generate fresh orderToken for each order so the client can
    // open OrderStatusModal to view full details (including voucher info)
    const ordersWithTokens = (data || []).map((order: any) => ({
      ...order,
      orderToken: generateOrderToken(order.order_id, userEmail),
    }));

    return NextResponse.json({ success: true, data: ordersWithTokens, userEmail });
  } catch (error) {
    console.error('[Orders] Error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}
