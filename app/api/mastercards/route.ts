import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUPPORTED_CURRENCIES = ['USD', 'CAD'];

const COUNTRY_ALIASES: Record<string, string> = {
  'usa': 'United States of America',
  'us': 'United States of America',
  'united states': 'United States of America',
  'uk': 'United Kingdom',
  'gb': 'United Kingdom',
  'great britain': 'United Kingdom',
  'hk': 'Hong Kong',
  'ca': 'Canada',
};

export async function GET(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { searchParams } = new URL(req.url);
    const currency = searchParams.get('currency');
    const countryParam = searchParams.get('country');

    let query = supabase
      .from('brands')
      .select(`
        product_id,
        brand_name,
        country_name,
        currency,
        product_image,
        value_restrictions,
        denominations,
        product_description,
        terms_and_conditions,
        how_to_use,
        expiry_and_validity
      `)
      .ilike('brand_name', '%Mastercard%')
      .gt('discount', 0);

    if (countryParam && countryParam !== 'all') {
      const normalized = COUNTRY_ALIASES[countryParam.toLowerCase()] || countryParam;
      query = query.eq('country_name', normalized);
    }

    if (currency && currency !== 'all') {
      query = query.eq('currency', currency);
    } else {
      query = query.in('currency', SUPPORTED_CURRENCIES);
    }

    const { data, error } = await query.order('currency');

    if (error) {
      console.error('Supabase error fetching Mastercards:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch Mastercard products' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching Mastercards:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Mastercard products' },
      { status: 500 }
    );
  }
}
