import { NextRequest, NextResponse } from 'next/server';
import { getExchangeRateAPI } from '@/lib/exchange-rates';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Exchange Rate API Endpoint
 * GET /api/exchange-rate?from=CAD&to=USD
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fromCurrency = searchParams.get('from');
    const toCurrency = searchParams.get('to') || 'USD';

    if (!fromCurrency) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: from' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Only allow supported currencies
    const supportedCurrencies = ['USD', 'CAD', 'HKD', 'GBP'];
    if (!supportedCurrencies.includes(fromCurrency.toUpperCase())) {
      return NextResponse.json(
        { success: false, error: `Unsupported currency: ${fromCurrency}. Supported: ${supportedCurrencies.join(', ')}` },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const result = await getExchangeRateAPI(fromCurrency.toUpperCase(), toCurrency.toUpperCase());

    if (!result.success) {
      return NextResponse.json(result, { status: 500, headers: CORS_HEADERS });
    }

    return NextResponse.json({
      success: true,
      from: fromCurrency.toUpperCase(),
      to: toCurrency.toUpperCase(),
      rate: result.rate,
      timestamp: new Date().toISOString()
    }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Exchange rate API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
