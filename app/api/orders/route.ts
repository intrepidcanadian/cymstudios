import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateOrderToken } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * GET /api/orders?email=<email>&address=<wallet_address>
 *
 * Looks up orders by user email or wallet address.
 * With WalletConnect replacing Privy, we no longer have server-side
 * access token verification. Orders are looked up by the email
 * the user provided at purchase time.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const walletAddress = searchParams.get('address');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    if (!email && !walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Email or wallet address required' },
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

    const selectFields =
      'order_id, product_id, brand_name, country_name, currency, price, status, ' +
      'face_value, voucher_currency, product_name, payment_network, ' +
      'created_at, completed_at, error_message';

    // Query by both email and wallet address to catch all orders
    // Fetch extra rows per source to ensure correct deduplication with offset
    const fetchLimit = limit + offset + 10;
    const queries = [];
    if (email) {
      queries.push(
        supabase
          .from('orders')
          .select(selectFields)
          .eq('user_email', email)
          .order('created_at', { ascending: false })
          .limit(fetchLimit)
      );
      queries.push(
        supabase
          .from('orders')
          .select(selectFields)
          .eq('user_id', email)
          .order('created_at', { ascending: false })
          .limit(fetchLimit)
      );
    }
    if (walletAddress) {
      queries.push(
        supabase
          .from('orders')
          .select(selectFields)
          .eq('payment_from', walletAddress.toLowerCase())
          .order('created_at', { ascending: false })
          .limit(fetchLimit)
      );
    }

    const results = await Promise.all(queries);

    // Check for errors
    for (const result of results) {
      if (result.error) {
        console.error('[Orders] Error fetching orders:', result.error.message);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch orders' },
          { status: 500 }
        );
      }
    }

    // Merge and deduplicate by order_id
    const merged = new Map<string, any>();
    for (const result of results) {
      for (const row of (result.data as any[]) || []) {
        if (!merged.has(row.order_id)) merged.set(row.order_id, row);
      }
    }

    const orders = Array.from(merged.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(offset, offset + limit);

    // Fetch product images
    const productIds = Array.from(new Set(orders.map((o: any) => o.product_id).filter(Boolean)));
    let imageMap: Record<number, string> = {};
    if (productIds.length > 0) {
      const { data: brands } = await supabase
        .from('brands')
        .select('product_id, product_image')
        .in('product_id', productIds);
      if (brands) {
        for (const b of brands as any[]) {
          imageMap[b.product_id] = b.product_image;
        }
      }
    }

    const data = orders.map((order: any) => ({
      ...order,
      product_image: imageMap[order.product_id] || null,
    }));

    // Generate orderTokens for status lookups
    const userEmail = email || walletAddress || '';
    const ordersWithTokens = data.map((order: any) => ({
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
