import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service_role key for server-side API routes
// This bypasses RLS and gives full database access (safe because it's server-only)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Only return cards in currencies we support for FX conversion to USDC
const SUPPORTED_CURRENCIES = ['USD', 'CAD', 'HKD', 'GBP', 'EUR'];

export async function GET(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase configuration missing. Please add SUPABASE_SERVICE_ROLE_KEY to your .env.local' },
        { status: 500 }
      );
    }

    // Create admin client with service role key (server-side only)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'Prefer': 'count=exact',
        },
      },
    });

    const { searchParams } = new URL(req.url);
    let country = searchParams.get('country');
    const currency = searchParams.get('currency');
    const brand = searchParams.get('brand');

    // Normalize country names for common variations
    if (country && country !== 'all') {
      const countryLower = country.toLowerCase().trim();
      // Map common variations to standard names
      const countryMap: Record<string, string> = {
        'usa': 'United States',
        'us': 'United States',
        'united states': 'United States',
        'united states of america': 'United States',
        'america': 'United States',
        'uk': 'United Kingdom',
        'united kingdom': 'United Kingdom',
        'great britain': 'United Kingdom',
        'gb': 'United Kingdom',
        'hk': 'Hong Kong',
        'hong kong': 'Hong Kong',
        'hongkong': 'Hong Kong',
        'ca': 'Canada',
        'canada': 'Canada',
        'de': 'Germany',
        'germany': 'Germany',
        'fr': 'France',
        'france': 'France',
        'it': 'Italy',
        'italy': 'Italy',
        'es': 'Spain',
        'spain': 'Spain',
        'nl': 'Netherlands',
        'netherlands': 'Netherlands',
        'the netherlands': 'Netherlands',
        'pt': 'Portugal',
        'portugal': 'Portugal',
        'ie': 'Ireland',
        'ireland': 'Ireland',
        'at': 'Austria',
        'austria': 'Austria',
        'be': 'Belgium',
        'belgium': 'Belgium',
        'pl': 'Poland',
        'poland': 'Poland',
        'se': 'Sweden',
        'sweden': 'Sweden',
        'dk': 'Denmark',
        'denmark': 'Denmark',
        'fi': 'Finland',
        'finland': 'Finland',
      };

      // Use mapped name if available, otherwise use original
      country = countryMap[countryLower] || country;
    }

    // Build query - explicitly exclude 'discount' column (seller profit margin)
    // Also exclude 'cached_at' (internal timestamp)
    let query = supabase.from('brands').select(`
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
    `);

    // Validate currency filter against supported currencies
    if (currency && currency !== 'all' && !SUPPORTED_CURRENCIES.includes(currency.toUpperCase())) {
      return NextResponse.json({
        success: true,
        data: [],
        message: `Currency ${currency} is not currently supported. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`
      });
    }

    // Supabase has a default limit of 1000 rows per query
    // To get all brands, we need to paginate through results
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Clone the query for each page (rebuild filters)
      let pageQuery = supabase.from('brands').select(`
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
      `);

      // Re-apply filters for this page query
      // Only show products with discount > 0 (we earn no commission on 0% discount cards)
      pageQuery = pageQuery.gt('discount', 0);

      if (country && country !== 'all') {
        pageQuery = pageQuery.ilike('country_name', `%${country}%`);
      }
      if (currency && currency !== 'all') {
        pageQuery = pageQuery.eq('currency', currency);
      } else {
        // Always limit to supported currencies for FX conversion
        pageQuery = pageQuery.in('currency', SUPPORTED_CURRENCIES);
      }
      if (brand && brand !== 'all') {
        pageQuery = pageQuery.ilike('brand_name', `%${brand}%`);
      }

      const { data: pageData, error } = await pageQuery
        .order('brand_name')
        .range(from, to);

      if (error) {
        console.error('Supabase error:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch brands from database' },
          { status: 500 }
        );
      }

      if (pageData && pageData.length > 0) {
        allData = [...allData, ...pageData];
        // If we got less than PAGE_SIZE, we've reached the end
        hasMore = pageData.length === PAGE_SIZE;
        page++;
      } else {
        hasMore = false;
      }

      // Safety limit to prevent infinite loops
      if (page > 20) {
        console.warn('Reached pagination safety limit');
        break;
      }
    }

    return NextResponse.json({ success: true, data: allData });
  } catch (error) {
    console.error('Error fetching brands:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch brands' },
      { status: 500 }
    );
  }
}
