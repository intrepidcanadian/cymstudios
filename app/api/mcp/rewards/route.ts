import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateOrderToken } from '@/lib/auth-token'

/**
 * Native MCP (Model Context Protocol) server for CYM Rewards.
 *
 * Implements JSON-RPC 2.0 over HTTPS at /api/mcp/rewards so agents
 * (Claude, MCP hosts, etc.) can discover the catalogue, browse brands,
 * and look up orders directly against cymstudio.app.
 *
 * Purchase flows are intentionally NOT exposed as MCP tools — x402
 * gasless settlement requires the user's wallet to sign EIP-3009,
 * which is a UI operation. Agents redirect users to the /catalogue
 * page for checkout.
 */

export const dynamic = 'force-dynamic'

const PROTOCOL_VERSION = '2024-11-05'
const SERVER_NAME = 'cym-rewards'
const SERVER_VERSION = '1.0.0'
const SUPPORTED_CURRENCIES = ['USD', 'CAD', 'HKD', 'GBP']

// ==========================================================================
// Tool definitions — advertised via tools/list, dispatched by tools/call.
// ==========================================================================

type ToolHandler = (args: Record<string, any>) => Promise<string>

interface Tool {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, any>; required?: string[] }
  handler: ToolHandler
}

const TOOLS: Tool[] = [
  {
    name: 'search_giftcards',
    description:
      'Search gift cards from 300+ brands across the US, Canada, Hong Kong, and UK. Filter by brand name, country, or currency (USD/CAD/HKD/GBP). Returns brand, country, currency, available denominations, and an image URL.',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: 'Substring match against brand name (e.g. "Amazon", "Starbucks").' },
        country: { type: 'string', description: 'Country name or ISO code (e.g. "United States", "US", "Hong Kong", "HK", "Canada", "CA", "United Kingdom", "GB").' },
        currency: { type: 'string', description: `Currency code. One of: ${SUPPORTED_CURRENCIES.join(', ')}.` },
        limit: { type: 'number', description: 'Max results (default 20, max 50).' },
      },
    },
    handler: searchGiftcards,
  },
  {
    name: 'get_brand_details',
    description: 'Get full detail for a single gift card product: denominations, value restrictions, product description, terms & conditions, how-to-use, expiry and validity.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'number', description: 'Product ID returned by search_giftcards.' },
      },
      required: ['product_id'],
    },
    handler: getBrandDetails,
  },
  {
    name: 'list_countries',
    description: 'List all countries that have gift card products available. Returns country names sorted alphabetically.',
    inputSchema: { type: 'object', properties: {} },
    handler: listCountries,
  },
  {
    name: 'list_currencies',
    description: 'List all currencies that have gift card products available. Returns currency codes.',
    inputSchema: { type: 'object', properties: {} },
    handler: listCurrencies,
  },
  {
    name: 'search_mastercard',
    description: 'Search Prepaid Mastercard products (USD and CAD). Returns denomination ranges and country.',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', description: 'Country name or ISO code.' },
        currency: { type: 'string', description: 'USD or CAD.' },
      },
    },
    handler: searchMastercard,
  },
  {
    name: 'get_mastercard_details',
    description: 'Get full detail for a single Prepaid Mastercard product.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'number', description: 'Product ID returned by search_mastercard.' },
      },
      required: ['product_id'],
    },
    handler: getMastercardDetails,
  },
  {
    name: 'check_order_status',
    description: 'Look up the status of a previously-created order by order_id and the email used at checkout. Returns status, voucher codes (if delivered), and error details (if any).',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'UUID returned when the order was created.' },
        email: { type: 'string', description: 'Email address used at checkout (required for authorisation).' },
      },
      required: ['order_id', 'email'],
    },
    handler: checkOrderStatus,
  },
  {
    name: 'redirect_to_checkout',
    description:
      'Return a pre-filled checkout URL for the catalogue. The actual purchase requires an x402 gasless wallet signature, which must be performed in the browser — call this tool to hand off to the web UI.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'number', description: 'Product ID to pre-select.' },
        denomination: { type: 'number', description: 'Face value to pre-select (optional).' },
        network: { type: 'string', description: '"conflux" (USDT0, default) or "ethereum" (USDC).' },
      },
      required: ['product_id'],
    },
    handler: redirectToCheckout,
  },
]

// ==========================================================================
// Country normalisation (shared with /api/brands).
// ==========================================================================

const COUNTRY_MAP: Record<string, string> = {
  us: 'United States',
  usa: 'United States',
  'united states': 'United States',
  'united states of america': 'United States',
  ca: 'Canada',
  canada: 'Canada',
  hk: 'Hong Kong',
  hkg: 'Hong Kong',
  'hong kong': 'Hong Kong',
  gb: 'United Kingdom',
  uk: 'United Kingdom',
  'united kingdom': 'United Kingdom',
  'great britain': 'United Kingdom',
}

function normaliseCountry(raw?: string): string | undefined {
  if (!raw) return undefined
  const key = raw.toLowerCase().trim()
  return COUNTRY_MAP[key] || raw
}

// ==========================================================================
// Tool handlers — each returns a pre-rendered plain-text summary suitable
// for an LLM. Agents can still parse structured data from the JSON we embed.
// ==========================================================================

async function searchGiftcards(args: Record<string, any>): Promise<string> {
  if (!supabaseAdmin) throw new Error('Supabase not configured')

  const brand = typeof args.brand === 'string' ? args.brand.trim() : undefined
  const country = normaliseCountry(args.country)
  const currency = typeof args.currency === 'string' ? args.currency.toUpperCase().trim() : undefined
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50)

  let query = supabaseAdmin
    .from('brands')
    .select('product_id, brand_name, country_name, currency, product_image, denominations, value_restrictions')
    .in('currency', SUPPORTED_CURRENCIES)
    .order('brand_name', { ascending: true })
    .limit(limit)

  if (brand) query = query.ilike('brand_name', `%${brand}%`)
  if (country) query = query.ilike('country_name', `%${country}%`)
  if (currency) query = query.eq('currency', currency)

  const { data, error } = await query
  if (error) throw new Error(`Query failed: ${error.message}`)

  const results = (data || []).map((row: any) => ({
    product_id: row.product_id,
    brand: row.brand_name,
    country: row.country_name,
    currency: row.currency,
    denominations: row.denominations || null,
    value_range: row.value_restrictions || null,
    image: row.product_image,
  }))

  if (results.length === 0) {
    return `No gift cards matched your filters. Try broader terms or call list_countries / list_currencies to see what's available.`
  }

  return `Found ${results.length} gift card${results.length === 1 ? '' : 's'}.\n\n${JSON.stringify(results, null, 2)}`
}

async function getBrandDetails(args: Record<string, any>): Promise<string> {
  if (!supabaseAdmin) throw new Error('Supabase not configured')
  const id = Number(args.product_id)
  if (!Number.isFinite(id)) throw new Error('product_id must be a number')

  const { data, error } = await supabaseAdmin
    .from('brands')
    .select('*')
    .eq('product_id', id)
    .single()

  if (error || !data) return `Brand ${id} not found.`

  const payload = {
    product_id: data.product_id,
    brand: data.brand_name,
    country: data.country_name,
    currency: data.currency,
    denominations: data.denominations,
    value_restrictions: data.value_restrictions,
    description: data.product_description,
    how_to_use: data.how_to_use,
    terms_and_conditions: data.terms_and_conditions,
    expiry_and_validity: data.expiry_and_validity,
    image: data.product_image,
    checkout_url: `https://cymstudio.app/catalogue?brand=${encodeURIComponent(data.brand_name)}`,
  }
  return JSON.stringify(payload, null, 2)
}

async function listCountries(): Promise<string> {
  if (!supabaseAdmin) throw new Error('Supabase not configured')
  const { data, error } = await supabaseAdmin
    .from('brands')
    .select('country_name')
    .in('currency', SUPPORTED_CURRENCIES)
  if (error) throw new Error(`Query failed: ${error.message}`)
  const countries = Array.from(new Set((data || []).map((r: any) => r.country_name).filter(Boolean))).sort()
  return JSON.stringify({ countries, count: countries.length }, null, 2)
}

async function listCurrencies(): Promise<string> {
  if (!supabaseAdmin) throw new Error('Supabase not configured')
  const { data, error } = await supabaseAdmin
    .from('brands')
    .select('currency')
    .in('currency', SUPPORTED_CURRENCIES)
  if (error) throw new Error(`Query failed: ${error.message}`)
  const currencies = Array.from(new Set((data || []).map((r: any) => r.currency).filter(Boolean))).sort()
  return JSON.stringify({ currencies, supported: SUPPORTED_CURRENCIES }, null, 2)
}

async function searchMastercard(args: Record<string, any>): Promise<string> {
  if (!supabaseAdmin) throw new Error('Supabase not configured')
  const country = normaliseCountry(args.country)
  const currency = typeof args.currency === 'string' ? args.currency.toUpperCase().trim() : undefined

  let query = supabaseAdmin
    .from('brands')
    .select('product_id, brand_name, country_name, currency, value_restrictions, denominations, product_image')
    .ilike('brand_name', '%mastercard%')
    .order('country_name', { ascending: true })

  if (country) query = query.ilike('country_name', `%${country}%`)
  if (currency) query = query.eq('currency', currency)

  const { data, error } = await query
  if (error) throw new Error(`Query failed: ${error.message}`)

  const results = (data || []).map((row: any) => ({
    product_id: row.product_id,
    brand: row.brand_name,
    country: row.country_name,
    currency: row.currency,
    value_range: row.value_restrictions,
    denominations: row.denominations,
    image: row.product_image,
  }))

  if (results.length === 0) return 'No Prepaid Mastercard products matched your filters.'
  return `Found ${results.length} Prepaid Mastercard product${results.length === 1 ? '' : 's'}.\n\n${JSON.stringify(results, null, 2)}`
}

async function getMastercardDetails(args: Record<string, any>): Promise<string> {
  return getBrandDetails(args)
}

async function checkOrderStatus(args: Record<string, any>): Promise<string> {
  if (!supabaseAdmin) throw new Error('Supabase not configured')
  const orderId = String(args.order_id || '').trim()
  const email = String(args.email || '').trim().toLowerCase()
  if (!orderId || !email) throw new Error('order_id and email are both required')

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('order_id, status, brand_name, country_name, currency, price, face_value, voucher_currency, created_at, completed_at, error_message, user_email')
    .eq('order_id', orderId)
    .single()

  if (error || !data) return `Order ${orderId} not found.`
  // Constant-time-ish email gate — cheap authorisation so random probes don't enumerate
  if (String((data as any).user_email || '').toLowerCase() !== email) {
    return `Order ${orderId} not found.`
  }

  const payload = {
    order_id: data.order_id,
    status: data.status,
    brand: data.brand_name,
    country: data.country_name,
    currency: data.currency,
    price: data.price,
    face_value: data.face_value,
    voucher_currency: data.voucher_currency,
    created_at: data.created_at,
    completed_at: data.completed_at,
    error: data.error_message || undefined,
    orderToken: generateOrderToken(data.order_id, email),
    status_url: `https://cymstudio.app/catalogue?order=${encodeURIComponent(data.order_id)}`,
  }
  return JSON.stringify(payload, null, 2)
}

async function redirectToCheckout(args: Record<string, any>): Promise<string> {
  const productId = Number(args.product_id)
  const denom = Number(args.denomination)
  const network = String(args.network || 'conflux').toLowerCase()

  const params = new URLSearchParams()
  if (Number.isFinite(productId)) params.set('product', String(productId))
  if (Number.isFinite(denom)) params.set('amount', String(denom))
  if (network === 'ethereum' || network === 'conflux') params.set('network', network)

  const url = `https://cymstudio.app/catalogue?${params.toString()}`
  return JSON.stringify({
    message: 'Redirect the user to the catalogue to complete checkout. Gasless USDT0 / USDC payment requires an in-browser EIP-3009 signature.',
    url,
    network_default: 'conflux',
  }, null, 2)
}

// ==========================================================================
// JSON-RPC 2.0 handler
// ==========================================================================

interface JsonRpcRequest {
  jsonrpc: '2.0'
  method: string
  params?: any
  id?: string | number | null
}

function rpcError(id: any, code: number, message: string, data?: any) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, data } }, {
    headers: corsHeaders(),
  })
}

function rpcResult(id: any, result: any) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result }, { headers: corsHeaders() })
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': '*',
  }
}

async function handle(rpc: JsonRpcRequest) {
  const id = rpc.id ?? null

  switch (rpc.method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      })

    case 'ping':
      return rpcResult(id, {})

    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      })

    case 'tools/call': {
      const name = rpc.params?.name
      const args = rpc.params?.arguments ?? {}
      const tool = TOOLS.find(t => t.name === name)
      if (!tool) {
        return rpcError(id, -32602, `Unknown tool: ${name}`)
      }
      try {
        const text = await tool.handler(args)
        return rpcResult(id, {
          content: [{ type: 'text', text }],
          isError: false,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return rpcResult(id, {
          content: [{ type: 'text', text: `Error: ${msg}` }],
          isError: true,
        })
      }
    }

    case 'resources/list':
      return rpcResult(id, { resources: [] })

    default:
      return rpcError(id, -32601, `Method not found: ${rpc.method}`)
  }
}

// ==========================================================================
// HTTP handlers
// ==========================================================================

export async function POST(req: NextRequest) {
  let body: JsonRpcRequest
  try {
    body = (await req.json()) as JsonRpcRequest
  } catch {
    return rpcError(null, -32700, 'Parse error')
  }
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return rpcError(body?.id ?? null, -32600, 'Invalid Request')
  }
  return handle(body)
}

export async function GET() {
  return NextResponse.json(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      description: 'MCP server for CYM Rewards — gift card discovery, brand details, and order lookup.',
      endpoint: 'https://cymstudio.app/api/mcp/rewards',
      tools: TOOLS.map(t => t.name),
      notes: 'POST JSON-RPC 2.0 requests. Methods: initialize, tools/list, tools/call, ping, resources/list.',
    },
    { headers: corsHeaders() }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}
