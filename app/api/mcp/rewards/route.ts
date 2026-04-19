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
      'Search gift cards across the CYM Rewards catalogue. Filter by brand name, country, or currency. Call list_countries and list_currencies first if you need to know what is actually available — availability changes as the catalogue syncs. Returns brand, country, currency, available denominations, and an image URL.',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: 'Substring match against brand name (e.g. "Starbucks").' },
        country: { type: 'string', description: 'Country name or ISO code. Call list_countries to see what is available.' },
        currency: { type: 'string', description: 'Currency code (e.g. USD, CAD, HKD). Call list_currencies to see what is available.' },
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
      'Return a pre-filled checkout URL for the catalogue. Use this when the caller is a human-backed client that prefers to complete the purchase in a browser (e.g. MetaMask, Fluent). For agent-initiated purchases with a server-side wallet, use get_purchase_quote + submit_purchase instead.',
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
  {
    name: 'verify_email_start',
    description:
      'Step 1 of email verification: trigger delivery of a 6-digit OTP to the email address. Required once per email address (then cached for 30 days). Voucher delivery and purchase both require a verified email.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address to verify.' },
      },
      required: ['email'],
    },
    handler: verifyEmailStart,
  },
  {
    name: 'verify_email_complete',
    description: 'Step 2 of email verification: submit the 6-digit OTP that was sent to the email address. On success, the email is verified for 30 days.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        code: { type: 'string', description: '6-digit numeric code from the verification email.' },
      },
      required: ['email', 'code'],
    },
    handler: verifyEmailComplete,
  },
  {
    name: 'get_purchase_quote',
    description:
      'Step 1 of agent-initiated purchase: request an x402 payment quote. Server validates the product + denomination and returns a 402-style payment requirement — facilitator address, exact USDT0/USDC amount (including 1.5% service fee), chain id, EIP-712 domain, and the TransferWithAuthorization types schema needed to sign. The caller then builds and signs an EIP-3009 TransferWithAuthorization with its own wallet key and passes the result to submit_purchase.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'number' },
        denomination: { type: 'number', description: 'Face value in the brand\'s native currency (e.g. 50 for a $50 USD card).' },
        email: { type: 'string', description: 'Email for voucher delivery (must be pre-verified via verify_email_*).' },
        network: { type: 'string', description: '"conflux" for USDT0 on Conflux eSpace (default) or "ethereum" for USDC on Ethereum mainnet.' },
      },
      required: ['product_id', 'denomination', 'email'],
    },
    handler: getPurchaseQuote,
  },
  {
    name: 'submit_purchase',
    description:
      'Step 2 of agent-initiated purchase: submit a signed x402 payment. The caller must have already called get_purchase_quote, built the TransferWithAuthorization message from the returned parameters, signed it with its wallet key, and base64-encoded the {x402Version, scheme, network, payload:{signature, authorization}} envelope. Server validates the signature, submits the on-chain transfer via the shared facilitator, procures the gift card from xRemit, and returns the voucher synchronously when fulfillment completes within ~60 seconds. Otherwise returns an order_id to poll with check_order_status.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'number' },
        denomination: { type: 'number' },
        email: { type: 'string' },
        network: { type: 'string', description: '"conflux" (default) or "ethereum".' },
        x_payment: {
          type: 'string',
          description:
            'Base64-encoded x402 payment envelope. Shape: { x402Version: 1, scheme: "exact", network, payload: { signature, authorization: { from, to, value, validAfter, validBefore, nonce } } }. Value and nonce come from get_purchase_quote; validAfter/validBefore are agent-chosen (recommended: 0 and now+600s).',
        },
      },
      required: ['product_id', 'denomination', 'email', 'x_payment'],
    },
    handler: submitPurchase,
  },
]

// ==========================================================================
// EIP-3009 TransferWithAuthorization types — fixed by the EIP, agents need
// them to construct the EIP-712 typed-data for signing.
// ==========================================================================
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
}

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

  // Lead with a terse per-product summary so the LLM has a salient place to
  // copy product_id from. Product IDs are long integers (e.g. 14000003689)
  // and models sometimes invent short ones if they only see the JSON body.
  const summary = results
    .map(r => `- ${r.brand} (${r.country}, ${r.currency}) — product_id=${r.product_id}`)
    .join('\n')

  return [
    `Found ${results.length} gift card${results.length === 1 ? '' : 's'}.`,
    ``,
    summary,
    ``,
    `IMPORTANT: product_id values are 14-digit integers. Copy them exactly from the list above when calling get_brand_details, get_purchase_quote, etc. Do NOT invent shorter numbers.`,
    ``,
    `Full JSON:`,
    JSON.stringify(results, null, 2),
  ].join('\n')
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

  if (error || !data) {
    return `Brand ${id} not found. Product IDs are 14-digit integers (e.g. 14000003689); if you are calling get_brand_details right after search_giftcards, copy the exact product_id from the search result — do not invent or shorten it.`
  }

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
  // Only return currencies that have products right now. The server-side
  // allowlist (SUPPORTED_CURRENCIES) is an upper bound — not something to
  // advertise to users who can't actually find matching cards.
  return JSON.stringify({ currencies, count: currencies.length }, null, 2)
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
    .select('order_id, status, brand_name, country_name, currency, price, face_value, voucher_currency, voucher_code, voucher_pin, voucher_validity_date, vouchers, payment_tx, created_at, completed_at, error_message, user_email')
    .eq('order_id', orderId)
    .single()

  if (error || !data) return `Order ${orderId} not found.`
  // Constant-time-ish email gate — cheap authorisation so random probes don't enumerate
  if (String((data as any).user_email || '').toLowerCase() !== email) {
    return `Order ${orderId} not found.`
  }

  const d = data as any
  const payload = {
    order_id: d.order_id,
    status: d.status,
    brand: d.brand_name,
    country: d.country_name,
    currency: d.currency,
    price: d.price,
    face_value: d.face_value,
    voucher_currency: d.voucher_currency,
    voucher: d.status === 'completed' ? {
      code: d.voucher_code || undefined,
      pin: d.voucher_pin || undefined,
      validity_date: d.voucher_validity_date || undefined,
      all: d.vouchers || undefined,
    } : undefined,
    payment_tx: d.payment_tx || undefined,
    created_at: d.created_at,
    completed_at: d.completed_at,
    error: d.error_message || undefined,
    orderToken: generateOrderToken(d.order_id, email),
    status_url: `https://cymstudio.app/catalogue?order=${encodeURIComponent(d.order_id)}`,
  }
  return JSON.stringify(payload, null, 2)
}

// ==========================================================================
// Internal-fetch helper — loops back to this Next.js instance so MCP tools
// can reuse the existing /api/purchase + /api/email/* pipelines without
// duplicating their security and settlement logic.
// ==========================================================================

function internalBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_INTERNAL_API_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  return 'http://127.0.0.1:3000'
}

async function callInternal(path: string, init: RequestInit): Promise<Response> {
  const url = `${internalBaseUrl()}${path}`
  return fetch(url, { ...init, redirect: 'manual' })
}

async function verifyEmailStart(args: Record<string, any>): Promise<string> {
  const email = String(args.email || '').trim().toLowerCase()
  if (!email) throw new Error('email is required')
  const res = await callInternal('/api/email/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error || `OTP send failed (${res.status})`)
  }
  return JSON.stringify({
    ok: true,
    email,
    next: 'Call verify_email_complete with the 6-digit code delivered to this email.',
  }, null, 2)
}

async function verifyEmailComplete(args: Record<string, any>): Promise<string> {
  const email = String(args.email || '').trim().toLowerCase()
  const code = String(args.code || '').trim()
  if (!email || !code) throw new Error('email and code are both required')
  const res = await callInternal('/api/email/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error || `OTP verify failed (${res.status})`)
  }
  return JSON.stringify({
    ok: true,
    email,
    verified_for_days: 30,
    next: 'Email verified. You can now call get_purchase_quote for this email.',
  }, null, 2)
}

async function getPurchaseQuote(args: Record<string, any>): Promise<string> {
  const productId = Number(args.product_id)
  const denomination = Number(args.denomination)
  const email = String(args.email || '').trim().toLowerCase()
  const network = String(args.network || 'conflux').toLowerCase()
  if (!Number.isFinite(productId)) throw new Error('product_id must be a number')
  if (!Number.isFinite(denomination) || denomination <= 0) throw new Error('denomination must be a positive number')
  if (!email) throw new Error('email is required')

  // POST to /api/purchase WITHOUT the x-payment header — server responds 402
  // with the payment requirements the agent needs to sign.
  const res = await callInternal('/api/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId,
      price: denomination,
      userEmail: email,
      userId: email,
    }),
  })
  const body = await res.json().catch(() => ({}))

  if (res.status !== 402) {
    // Not a payment-required response — it's either an error or an unexpected 200.
    // Pass the server's message through so the agent knows what's wrong.
    throw new Error(body?.error || `Unexpected response from purchase endpoint (${res.status})`)
  }

  // 402 with the `accepts` array. Pick the requested network.
  const accepts = Array.isArray(body.accepts) ? body.accepts : []
  const chosen = accepts.find((a: any) => a.network === network) || accepts[0]
  if (!chosen) throw new Error('No payment options returned by the server')

  const nowSec = Math.floor(Date.now() / 1000)
  const validBefore = nowSec + 600 // 10-minute signing window
  const nonceHex = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  return JSON.stringify({
    correlation: {
      product_id: productId,
      denomination,
      email,
      network: chosen.network,
    },
    payment_requirements: {
      scheme: 'exact',
      x402_version: 1,
      network: chosen.network,
      chain_id: chosen.chainId,
      token: chosen.asset,
      pay_to: chosen.payTo,
      amount: chosen.maxAmountRequired,
      amount_note: 'Raw token units (6 decimals for USDC/USDT0). Already includes the 1.5% service fee.',
      original_price: chosen.extra?.originalPrice,
      original_currency: chosen.extra?.originalCurrency,
    },
    eip712_domain: {
      name: chosen.extra?.name,
      version: chosen.extra?.version,
      chainId: chosen.chainId,
      verifyingContract: chosen.asset,
    },
    eip712_types: EIP3009_TYPES,
    suggested_authorization: {
      from: 'YOUR_WALLET_ADDRESS',
      to: chosen.payTo,
      value: chosen.maxAmountRequired,
      validAfter: 0,
      validBefore,
      nonce: nonceHex,
    },
    next: 'Build the TransferWithAuthorization message, sign it with your wallet key, base64-encode {x402Version:1, scheme:"exact", network, payload:{signature, authorization}}, then call submit_purchase with x_payment set to that base64 string.',
  }, null, 2)
}

async function submitPurchase(args: Record<string, any>): Promise<string> {
  const productId = Number(args.product_id)
  const denomination = Number(args.denomination)
  const email = String(args.email || '').trim().toLowerCase()
  const xPayment = String(args.x_payment || '').trim()
  if (!Number.isFinite(productId)) throw new Error('product_id must be a number')
  if (!Number.isFinite(denomination) || denomination <= 0) throw new Error('denomination must be a positive number')
  if (!email) throw new Error('email is required')
  if (!xPayment) throw new Error('x_payment is required (base64-encoded x402 envelope)')

  const res = await callInternal('/api/purchase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-payment': xPayment,
    },
    body: JSON.stringify({
      productId,
      price: denomination,
      userEmail: email,
      userId: email,
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.success === false) {
    const msg = body?.error || `Purchase failed (${res.status})`
    return JSON.stringify({ ok: false, status: res.status, error: msg, details: body }, null, 2)
  }

  // Success. Pass the order result back. If the webhook already fired
  // (fulfillment within the synchronous window), body includes voucher data.
  return JSON.stringify({
    ok: true,
    order_id: body.orderId || body.order_id,
    status: body.status || 'processing',
    payment_tx: body.paymentTx || body.payment_tx,
    voucher: body.voucher || body.vouchers || undefined,
    next: body.voucher ? 'Voucher delivered. Store the code.' : 'Call check_order_status with this order_id and email to poll for fulfillment (~60s typical).',
    raw: body,
  }, null, 2)
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
