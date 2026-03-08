import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * Sync brands from xRemit API to Supabase
 *
 * Fetches the full gift card catalogue from xRemit with HMAC-SHA256 authentication
 * and upserts into the local Supabase `brands` table.
 *
 * Requires: Authorization: Bearer <CRON_SECRET>
 *
 * Usage:
 *   GET /api/sync-brands                          - Sync all countries
 *   GET /api/sync-brands?country=USA              - Sync one country
 *   GET /api/sync-brands?clear=true               - Clear table first, then sync
 *   GET /api/sync-brands?diagnostic=true           - Show config without syncing
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for full sync

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// xRemit API configuration
const XREMIT_BASE_URL = process.env.EXTERNAL_BRANDS_API_URL
  ? process.env.EXTERNAL_BRANDS_API_URL.replace(/\/api\/v1\/?$/, '')
  : (process.env.XREMIT_ENV === 'production'
    ? 'https://rewardsapi.xremit.io'
    : 'https://rewardsapi-sandbox.xremit.io');
const XREMIT_API_KEY = process.env.EXTERNAL_API_KEY;
const XREMIT_CLIENT_SECRET = process.env.EXTERNAL_CLIENT_SECRET;

/**
 * Generate xRemit API signature
 * Signature = sha256(requestMethod + uri + requestSecret + body)
 */
function generateXremitSignature(
  method: string,
  uri: string,
  body: string = ''
): string {
  if (!XREMIT_CLIENT_SECRET) {
    throw new Error('EXTERNAL_CLIENT_SECRET not configured');
  }
  const payload = `${method}${uri}${XREMIT_CLIENT_SECRET}${body}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Transform xRemit API response (camelCase) to Supabase schema (snake_case)
 */
interface XremitBrand {
  productId: number;
  brandName: string;
  countryName: string;
  currency: string;
  productImage: string;
  discount: number;
  valueRestrictions: { minVal?: number; maxVal?: number };
  denominations: number[];
  productDescription: string;
  termsAndConditions: string;
  howToUse: string;
  expiryAndValidity: string;
}

interface SupabaseBrand {
  product_id: number;
  brand_name: string;
  country_name: string;
  currency: string;
  product_image: string;
  discount: number;
  value_restrictions: { minVal?: number; maxVal?: number } | null;
  denominations: number[] | null;
  product_description: string;
  terms_and_conditions: string;
  how_to_use: string;
  expiry_and_validity: string;
  cached_at: string;
}

function transformBrandData(xremitBrand: XremitBrand): SupabaseBrand {
  return {
    product_id: xremitBrand.productId,
    brand_name: xremitBrand.brandName,
    country_name: xremitBrand.countryName,
    currency: xremitBrand.currency,
    product_image: xremitBrand.productImage,
    discount: xremitBrand.discount,
    value_restrictions: Object.keys(xremitBrand.valueRestrictions || {}).length > 0
      ? xremitBrand.valueRestrictions
      : null,
    denominations: xremitBrand.denominations && xremitBrand.denominations.length > 0
      ? xremitBrand.denominations
      : null,
    product_description: xremitBrand.productDescription,
    terms_and_conditions: xremitBrand.termsAndConditions,
    how_to_use: xremitBrand.howToUse,
    expiry_and_validity: xremitBrand.expiryAndValidity,
    cached_at: new Date().toISOString(),
  };
}

/**
 * Fetch brands from xRemit API with pagination
 */
async function fetchBrandsForCountry(country: string): Promise<SupabaseBrand[]> {
  const allBrands: SupabaseBrand[] = [];
  let currentPage = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    // xRemit signature uses NON-encoded URI, HTTP request uses encoded URI
    const uriForSignature = `/brands/country/${country}?currentPage=${currentPage}`;
    const uriForUrl = `/brands/country/${encodeURIComponent(country)}?currentPage=${currentPage}`;

    const signature = generateXremitSignature('GET', uriForSignature, '');
    const fullUrl = `${XREMIT_BASE_URL}/api/v1${uriForUrl}`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'API-Key': XREMIT_API_KEY!,
        'Signature': signature,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`xRemit API error (page ${currentPage}): ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.result && Array.isArray(data.result)) {
      const transformedBrands = data.result.map(transformBrandData);
      allBrands.push(...transformedBrands);

      const totalPages = data.totalCount ? Math.ceil(data.totalCount / data.perPage) : 1;
      if (currentPage < totalPages) {
        currentPage++;
      } else {
        hasMorePages = false;
      }
    } else {
      hasMorePages = false;
    }

    // Safety limit
    if (currentPage > 100) {
      console.warn('Reached safety limit of 100 pages');
      break;
    }
  }

  return allBrands;
}

// All countries supported by xRemit
const ALL_COUNTRIES = [
  "Afghanistan", "Argentina", "Armenia", "Australia", "Austria", "Bahrain",
  "Bangladesh", "Belgium", "Bhutan", "Brazil", "Brunei Darussalam", "Bulgaria",
  "Canada", "Canary Islands", "Chile", "China", "Colombia", "Costa Rica",
  "Cyprus", "Czech Republic", "Denmark", "Egypt", "Estonia", "Europe",
  "Federated States of Micronesia", "Fiji", "Finland", "France", "Georgia",
  "Germany", "Greece", "Hong Kong", "Hungary", "India", "Indonesia", "Ireland",
  "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya",
  "Kiribati", "Kuwait", "Latvia", "Lebanon", "Lithuania", "Luxembourg",
  "Malaysia", "Malta", "Mexico", "Morocco", "Netherlands", "New Zealand",
  "Nigeria", "Niue", "Norway", "Oman", "Peru", "Philippines", "Poland",
  "Portugal", "Qatar", "Romania", "Russia", "Saudi Arabia", "Singapore",
  "Slovak Republic", "Slovenia", "Solomon Islands", "South Africa", "South Korea",
  "Spain", "Sri lanka", "Sweden", "Switzerland", "Taiwan", "Thailand", "Tonga",
  "Turkey", "Turkmenistan", "Tuvalu", "UAE", "UK", "USA", "Ukraine", "Uruguay",
  "Vanuatu", "Vietnam"
];

export async function GET(request: NextRequest) {
  try {
    // Auth check: require CRON_SECRET Bearer token (no bypass)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check config
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

    if (!XREMIT_API_KEY || !XREMIT_CLIENT_SECRET) {
      return NextResponse.json(
        { success: false, error: 'xRemit API credentials missing (EXTERNAL_API_KEY or EXTERNAL_CLIENT_SECRET)' },
        { status: 500 }
      );
    }

    console.log(`Starting brand sync from xRemit (${XREMIT_BASE_URL})...`);

    // Diagnostic mode
    const isDiagnostic = request.nextUrl.searchParams.get('diagnostic') === 'true';
    if (isDiagnostic) {
      return NextResponse.json({
        success: true,
        diagnostic: true,
        xremitUrl: XREMIT_BASE_URL,
        xremitEnv: process.env.XREMIT_ENV || '(not set)',
        apiKeySet: !!XREMIT_API_KEY,
        clientSecretSet: !!XREMIT_CLIENT_SECRET,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Optionally clear table first
    const shouldClear = request.nextUrl.searchParams.get('clear') === 'true';
    if (shouldClear) {
      console.log('Clearing existing brands table...');
      const { error: deleteError } = await supabase
        .from('brands')
        .delete()
        .neq('product_id', 0);

      if (deleteError) {
        console.error('Error clearing brands table:', deleteError);
        throw deleteError;
      }
      console.log('Brands table cleared');
    }

    // Get country filter or sync all
    const countryFilter = request.nextUrl.searchParams.get('country');
    const countries = countryFilter ? [countryFilter] : ALL_COUNTRIES;

    let allBrands: SupabaseBrand[] = [];
    let successfulCountries = 0;
    let failedCountries = 0;
    const results: { country: string; count: number; error?: string }[] = [];

    for (let i = 0; i < countries.length; i++) {
      const country = countries[i];
      console.log(`[${i + 1}/${countries.length}] Processing ${country}...`);

      try {
        const countryBrands = await fetchBrandsForCountry(country);
        if (countryBrands.length > 0) {
          allBrands.push(...countryBrands);
          results.push({ country, count: countryBrands.length });
          console.log(`  ${country}: ${countryBrands.length} brands`);
          successfulCountries++;
        } else {
          results.push({ country, count: 0 });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ country, count: 0, error: errorMsg });
        console.log(`  ${country}: FAILED - ${errorMsg}`);
        failedCountries++;
      }
    }

    console.log(`Sync summary: ${successfulCountries} countries, ${failedCountries} failed, ${allBrands.length} total brands`);

    // Deduplicate by product_id
    const uniqueBrandsMap = new Map<number, SupabaseBrand>();
    for (const brand of allBrands) {
      uniqueBrandsMap.set(brand.product_id, brand);
    }
    const uniqueBrands = Array.from(uniqueBrandsMap.values());

    console.log(`Unique brands after deduplication: ${uniqueBrands.length}`);

    // Upsert in batches of 500 (Supabase limit)
    const BATCH_SIZE = 500;
    for (let i = 0; i < uniqueBrands.length; i += BATCH_SIZE) {
      const batch = uniqueBrands.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from('brands')
        .upsert(batch, {
          onConflict: 'product_id',
          ignoreDuplicates: false
        });

      if (upsertError) {
        console.error(`Upsert error (batch ${i / BATCH_SIZE + 1}):`, upsertError);
        throw upsertError;
      }
    }

    const syncResult = {
      success: true,
      synced: uniqueBrands.length,
      countriesProcessed: countries.length,
      successfulCountries,
      failedCountries,
      xremitUrl: XREMIT_BASE_URL,
      timestamp: new Date().toISOString(),
      results
    };

    console.log('Brand sync completed:', { synced: uniqueBrands.length });

    return NextResponse.json(syncResult);

  } catch (error) {
    console.error('Brand sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
