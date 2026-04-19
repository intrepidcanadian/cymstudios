import { NextRequest, NextResponse } from 'next/server'

/**
 * A2A Reverse Proxy — cymstudio.app/a2a → ginsengswap-giftcard-agent.fly.dev:3001/a2a
 *
 * Routes A2A JSON-RPC requests from the canonical cymstudio.app domain
 * to the upstream agent runtime. Mirrors the MCP proxy pattern so the
 * agent-registration / agent-card JSON can advertise a single domain.
 */

const UPSTREAM_ORIGIN = process.env.A2A_UPSTREAM_ORIGIN || 'https://ginsengswap-giftcard-agent.fly.dev:3001'
const UPSTREAM_PATH = '/a2a'

const STRIP_REQUEST_HEADERS = new Set(['host', 'connection', 'transfer-encoding'])
const STRIP_RESPONSE_HEADERS = new Set(['transfer-encoding', 'connection'])

async function proxyRequest(req: NextRequest) {
  const upstreamUrl = new URL(UPSTREAM_PATH, UPSTREAM_ORIGIN)
  req.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value)
  })

  const headers = new Headers()
  req.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })
  headers.set('host', upstreamUrl.host)
  headers.set('x-forwarded-host', req.nextUrl.host)
  headers.set('x-forwarded-proto', 'https')

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  }
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    fetchOptions.body = await req.text()
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), fetchOptions)
    const contentType = upstreamResponse.headers.get('content-type') || ''
    const isStreaming = contentType.includes('text/event-stream')

    const responseHeaders = new Headers()
    upstreamResponse.headers.forEach((value, key) => {
      if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value)
      }
    })
    responseHeaders.set('access-control-allow-origin', '*')
    responseHeaders.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS')
    responseHeaders.set('access-control-allow-headers', '*')
    responseHeaders.set('access-control-expose-headers', '*')

    if (isStreaming && upstreamResponse.body) {
      responseHeaders.set('content-type', 'text/event-stream')
      responseHeaders.set('cache-control', 'no-cache')
      responseHeaders.set('connection', 'keep-alive')
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      })
    }

    const responseBody = await upstreamResponse.text()
    return new Response(responseBody, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('[A2A Proxy] Upstream request failed:', error)
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'A2A upstream server unavailable' },
        id: null,
      },
      { status: 502 }
    )
  }
}

export async function GET(req: NextRequest) {
  return proxyRequest(req)
}

export async function POST(req: NextRequest) {
  return proxyRequest(req)
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-max-age': '86400',
    },
  })
}
