import { NextRequest, NextResponse } from 'next/server';

/**
 * MCP Reverse Proxy — cymstudio.app/api/mcp/* → ginsengswap.org/api/mcp/*
 *
 * Routes MCP requests from the canonical cymstudio.app domain to the
 * ginsengswap-frontend backend where the MCP server actually runs.
 *
 * Path mapping:
 *   /api/mcp/rewards              → /api/mcp/cards-mainnet  (main MCP JSON-RPC)
 *   /api/mcp/manifest/cards-mainnet → /api/mcp/manifest/cards-mainnet
 *   /api/mcp/tools/*              → /api/mcp/tools/*
 *
 * Supports:
 *   - JSON-RPC 2.0 (POST)
 *   - SSE streaming (text/event-stream responses)
 *   - x402 payment headers (passthrough)
 *   - GET requests (manifest, tool endpoints)
 */

const UPSTREAM_ORIGIN = process.env.MCP_UPSTREAM_ORIGIN || 'https://ginsengswap.org';

/**
 * Map incoming path segments to the upstream path.
 * The main MCP endpoint is at /api/mcp/rewards on cymstudio.app
 * but /api/mcp/cards-mainnet on ginsengswap.org.
 */
function mapPath(pathSegments: string[]): string {
  const path = pathSegments.join('/');

  // /api/mcp/rewards → /api/mcp/cards-mainnet
  if (path === 'rewards') {
    return '/api/mcp/cards-mainnet';
  }

  // Everything else passes through: tools/*, manifest/*, etc.
  return `/api/mcp/${path}`;
}

/** Headers to strip from the upstream request (set by Next.js / client) */
const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'transfer-encoding',
]);

/** Headers to strip from the upstream response */
const STRIP_RESPONSE_HEADERS = new Set([
  'transfer-encoding',
  'connection',
]);

async function proxyRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const upstreamPath = mapPath(pathSegments);
  const upstreamUrl = new URL(upstreamPath, UPSTREAM_ORIGIN);

  // Preserve query parameters
  req.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  // Build upstream request headers — pass everything through
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  // Set the upstream host
  headers.set('host', upstreamUrl.host);
  // Forward the original host for logging/debugging
  headers.set('x-forwarded-host', req.nextUrl.host);
  headers.set('x-forwarded-proto', 'https');

  // Build fetch options
  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
    // Don't follow redirects — let the client handle them
    redirect: 'manual',
  };

  // Forward request body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    fetchOptions.body = await req.text();
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), fetchOptions);

    // Check if the response is SSE (streaming)
    const contentType = upstreamResponse.headers.get('content-type') || '';
    const isStreaming = contentType.includes('text/event-stream');

    if (isStreaming && upstreamResponse.body) {
      // Stream the SSE response through
      const responseHeaders = new Headers();
      upstreamResponse.headers.forEach((value, key) => {
        if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      });
      // Ensure proper SSE headers
      responseHeaders.set('content-type', 'text/event-stream');
      responseHeaders.set('cache-control', 'no-cache');
      responseHeaders.set('connection', 'keep-alive');

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    }

    // Non-streaming: read the full response and return it
    const responseBody = await upstreamResponse.text();

    const responseHeaders = new Headers();
    upstreamResponse.headers.forEach((value, key) => {
      if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // Add CORS headers for MCP clients
    responseHeaders.set('access-control-allow-origin', '*');
    responseHeaders.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseHeaders.set('access-control-allow-headers', '*');
    responseHeaders.set('access-control-expose-headers', '*');

    return new Response(responseBody, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[MCP Proxy] Upstream request failed:', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'MCP upstream server unavailable',
        },
        id: null,
      },
      { status: 502 }
    );
  }
}

// Export handlers for all HTTP methods MCP clients might use
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, context);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, context);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, context);
}

export async function OPTIONS(req: NextRequest) {
  // Handle CORS preflight
  return new NextResponse(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-max-age': '86400',
    },
  });
}
