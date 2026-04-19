import type { Metadata } from 'next'
import Link from 'next/link'
import styles from './agents.module.css'

export const metadata: Metadata = {
  title: 'For Agents — CYM Rewards MCP Integration',
  description:
    'Developer documentation for AI agents that want to use CYM Rewards: discover gift cards, generate x402 payment quotes, and complete gasless USDT0 purchases on Conflux eSpace.',
}

const TOOLS = [
  ['search_giftcards', 'Filter 300+ brands by brand / country / currency.'],
  ['get_brand_details', 'Denominations, restrictions, terms, validity for one product.'],
  ['list_countries', 'Countries with available products (US, CA, HK).'],
  ['list_currencies', 'USD, CAD, HKD, GBP.'],
  ['search_mastercard', 'Prepaid Mastercard products (USD, CAD).'],
  ['get_mastercard_details', 'Detail for one Mastercard product.'],
  ['check_order_status', 'Poll an order by order_id + email. Returns voucher when delivered.'],
  ['redirect_to_checkout', 'Build a pre-filled /catalogue URL for browser-wallet fallback.'],
  ['verify_email_start', 'Send a 6-digit OTP to an email address (required once per 30 days).'],
  ['verify_email_complete', 'Submit the 6-digit OTP to mark the email verified.'],
  ['get_purchase_quote', 'Step 1 of purchase: returns x402 payment requirements (amount, facilitator, EIP-712 domain, types, nonce).'],
  ['submit_purchase', 'Step 2 of purchase: accepts a signed x402 envelope, settles on-chain, procures voucher.'],
]

export default function AgentsDocsPage() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          CYM <em>for Agents</em>
        </div>
        <nav className={styles.headerCrumb}>
          <Link href="/">Studio</Link>
          <Link href="/catalogue">Rewards</Link>
          <Link href="/chat">Chat</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>MCP Integration Guide · v1.0</div>
        <h1 className={styles.heroTitle}>
          Build agents that <em>redeem gift cards</em> paid in USDT0.
        </h1>
        <p className={styles.heroLede}>
          CYM Rewards exposes a native Model Context Protocol endpoint at{' '}
          <code>https://cymstudio.app/api/mcp/rewards</code>. Any LLM agent with its own
          wallet (Coinbase CDP, Privy server wallets, Safe, etc.) can discover brands,
          lock an x402 quote, sign an EIP-3009 <code>transferWithAuthorization</code>, and
          receive a real gift card voucher. Gas is paid by a shared facilitator on Conflux
          eSpace or Ethereum mainnet — agents only need USDT0 or USDC.
        </p>
      </section>

      <main className={styles.main}>
        {/* TOC */}
        <nav className={styles.toc}>
          <div className={styles.tocLabel}>On this page</div>
          <ul className={styles.tocList}>
            <li><a href="#quickstart">Quickstart</a></li>
            <li><a href="#endpoints">Endpoints</a></li>
            <li><a href="#protocol">Protocol</a></li>
            <li><a href="#tools">Tool catalogue</a></li>
            <li><a href="#purchase-flow">Purchase flow</a></li>
            <li><a href="#signing">EIP-3009 signing</a></li>
            <li><a href="#clients">Client configs</a></li>
            <li><a href="#errors">Errors &amp; rate limits</a></li>
            <li><a href="#discovery">Discovery (ERC-8004)</a></li>
            <li><a href="#support">Support</a></li>
          </ul>
        </nav>

        {/* Quickstart */}
        <section id="quickstart" className={styles.section}>
          <h2>Quickstart</h2>
          <p>One <code>curl</code>, zero wallet, zero credentials — enough to confirm the MCP is alive and see what it can do:</p>
          <div>
            <div className={styles.codeLabel}>bash</div>
            <pre className={styles.codeBlock}>{`curl -s -X POST https://cymstudio.app/api/mcp/rewards \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \\
  | jq '.result.tools[].name'`}</pre>
          </div>
          <p>
            Any MCP client can talk to the endpoint directly — it implements JSON-RPC 2.0
            over HTTPS with the standard tools/list + tools/call handshake. See{' '}
            <a href="#clients">Client configs</a> for Claude Desktop and OpenAI-compatible
            snippets.
          </p>
        </section>

        {/* Endpoints */}
        <section id="endpoints" className={styles.section}>
          <h2>Endpoints</h2>
          <table className={styles.toolTable}>
            <thead>
              <tr>
                <th>Path</th>
                <th>Method</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>/api/mcp/rewards</td>
                <td>POST</td>
                <td>JSON-RPC 2.0: initialize, ping, tools/list, tools/call, resources/list.</td>
              </tr>
              <tr>
                <td>/api/mcp/rewards</td>
                <td>GET</td>
                <td>Human-readable metadata (name, version, protocol, tool names).</td>
              </tr>
              <tr>
                <td>/.well-known/gift-cards/agent-registration.json</td>
                <td>GET</td>
                <td>ERC-8004 registration document. Pin this URL in your agent.</td>
              </tr>
              <tr>
                <td>/api/purchase</td>
                <td>POST</td>
                <td>Underlying x402 endpoint the purchase tools call. Agents may use it directly with an <code>x-payment</code> header.</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Protocol */}
        <section id="protocol" className={styles.section}>
          <h2>Protocol</h2>
          <p>
            Every request is a JSON-RPC 2.0 POST body:
          </p>
          <div>
            <div className={styles.codeLabel}>request</div>
            <pre className={styles.codeBlock}>{`{
  "jsonrpc": "2.0",
  "method":  "tools/call",
  "params":  { "name": "search_giftcards", "arguments": { "brand": "Starbucks" } },
  "id":      1
}`}</pre>
          </div>
          <div>
            <div className={styles.codeLabel}>response</div>
            <pre className={styles.codeBlock}>{`{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "Found 1 gift card.\\n\\n[{...}]" }],
    "isError": false
  }
}`}</pre>
          </div>
          <p>
            Tool outputs are always a single <code>content[0].text</code> string.
            Structured results (product lists, quote objects, order details) are embedded
            as JSON inside that string — parse from the first <code>{'{'}</code> or{' '}
            <code>{'['}</code>.
          </p>
        </section>

        {/* Tool catalogue */}
        <section id="tools" className={styles.section}>
          <h2>Tool catalogue</h2>
          <p>All 12 tools exposed at <code>tools/list</code>:</p>
          <table className={styles.toolTable}>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([name, desc]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Call <code>tools/list</code> at runtime for full JSON Schema (argument names,
            types, required fields). Nothing here is hard-coded on the agent side — the
            server is the source of truth.
          </p>
        </section>

        {/* Purchase flow */}
        <section id="purchase-flow" className={styles.section}>
          <h2>Purchase flow</h2>
          <p>
            Five calls from cold start to voucher in hand:
          </p>
          <pre className={styles.flow}>{`1.  verify_email_start        { email }                       → OTP sent
2.  verify_email_complete     { email, code }                 → email verified (30 days)
3.  get_purchase_quote        { product_id, denomination,     → x402 payment requirements
                                email, network }                 + EIP-712 domain + types
                                                                 + suggested authorization
4.  [ agent wallet signs TransferWithAuthorization ]
5.  submit_purchase           { product_id, denomination,     → order_id + payment_tx
                                email, x_payment }               ( + voucher if synchronous )
6.  check_order_status        { order_id, email }             → voucher.code, voucher.pin`}</pre>
          <div className={styles.callout}>
            <strong>Why email OTP?</strong>
            Vouchers are delivered to the email the agent provides (and cached for audit).
            One-time verification per email protects against typos that would send the
            voucher somewhere unreachable. If an agent controls its own inbox, the OTP
            round-trip is programmatic; if it's purchasing on behalf of a human, the
            human verifies once.
          </div>
        </section>

        {/* Signing */}
        <section id="signing" className={styles.section}>
          <h2>EIP-3009 signing</h2>
          <p>
            <code>get_purchase_quote</code> returns everything you need to build the
            typed-data. Fields:
          </p>
          <div>
            <div className={styles.codeLabel}>quote response (abridged)</div>
            <pre className={styles.codeBlock}>{`{
  "correlation":    { "product_id": 14000003689, "denomination": 25, "email": "...", "network": "conflux" },
  "payment_requirements": {
    "scheme":            "exact",
    "x402_version":      1,
    "network":           "conflux",
    "chain_id":          1030,
    "token":             "0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff",
    "pay_to":            "0xc10561c1c0d718b3d362df9d510a1b4e4331a4ee",
    "amount":            "25380000",            // 25.38 USDT0 in raw 6-decimal units (incl. 1.5% fee)
    "original_price":    "25",
    "original_currency": "USD"
  },
  "eip712_domain": {
    "name":             "USDT0",
    "version":          "1",
    "chainId":          1030,
    "verifyingContract": "0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff"
  },
  "eip712_types": {
    "TransferWithAuthorization": [
      { "name": "from",        "type": "address" },
      { "name": "to",          "type": "address" },
      { "name": "value",       "type": "uint256" },
      { "name": "validAfter",  "type": "uint256" },
      { "name": "validBefore", "type": "uint256" },
      { "name": "nonce",       "type": "bytes32" }
    ]
  },
  "suggested_authorization": {
    "from": "YOUR_WALLET_ADDRESS",
    "to":   "0xc10561c1c0d718b3d362df9d510a1b4e4331a4ee",
    "value": "25380000",
    "validAfter":  0,
    "validBefore": 1800000000,
    "nonce": "0xabcd...32 random bytes..."
  }
}`}</pre>
          </div>
          <p>
            Sign the <code>TransferWithAuthorization</code> struct with the agent's wallet
            key, then base64-encode the full envelope and pass it as <code>x_payment</code>:
          </p>
          <div>
            <div className={styles.codeLabel}>envelope to encode</div>
            <pre className={styles.codeBlock}>{`{
  "x402Version": 1,
  "scheme": "exact",
  "network": "conflux",
  "payload": {
    "signature": "0x...",         // 65-byte ECDSA result
    "authorization": {
      "from": "0xagent...",
      "to":   "0xc10561...",
      "value": "25380000",
      "validAfter": 0,
      "validBefore": 1800000000,
      "nonce": "0xabcd..."
    }
  }
}`}</pre>
          </div>
          <p>Reference signing snippet with <code>viem</code>:</p>
          <div>
            <div className={styles.codeLabel}>typescript / viem</div>
            <pre className={styles.codeBlock}>{`import { privateKeyToAccount } from 'viem/accounts'

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as \`0x\${string}\`)

const signature = await account.signTypedData({
  domain: quote.eip712_domain,
  types:  quote.eip712_types,
  primaryType: 'TransferWithAuthorization',
  message: {
    ...quote.suggested_authorization,
    from: account.address,
  },
})

const envelope = {
  x402Version: 1,
  scheme: 'exact',
  network: quote.payment_requirements.network,
  payload: {
    signature,
    authorization: { ...quote.suggested_authorization, from: account.address },
  },
}

const xPayment = Buffer.from(JSON.stringify(envelope)).toString('base64')`}</pre>
          </div>
        </section>

        {/* Client configs */}
        <section id="clients" className={styles.section}>
          <h2>Client configs</h2>
          <h3>Claude Desktop</h3>
          <p>
            Claude Desktop speaks MCP over stdio, so use <code>mcp-remote</code> to bridge
            to the HTTP endpoint. Add this to{' '}
            <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>:
          </p>
          <div>
            <div className={styles.codeLabel}>claude_desktop_config.json</div>
            <pre className={styles.codeBlock}>{`{
  "mcpServers": {
    "cym-rewards": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://cymstudio.app/api/mcp/rewards"]
    }
  }
}`}</pre>
          </div>
          <h3>Anthropic / OpenAI tool-use loops</h3>
          <p>
            Define the 12 tools manually using the schemas from <code>tools/list</code>,
            or dispatch each model-requested tool by POSTing to <code>/api/mcp/rewards</code>.
            Our own <code>/chat</code> page uses the latter pattern with Kimi — see{' '}
            <a href="https://github.com/intrepidcanadian/cymstudios/blob/main/app/api/chat/route.ts">
              app/api/chat/route.ts
            </a>{' '}
            for a 150-line reference implementation.
          </p>
          <h3>Bare HTTP</h3>
          <p>Nothing is MCP-client-specific — just POST JSON-RPC:</p>
          <div>
            <div className={styles.codeLabel}>python</div>
            <pre className={styles.codeBlock}>{`import requests

def mcp_call(name, args=None):
    r = requests.post("https://cymstudio.app/api/mcp/rewards", json={
        "jsonrpc": "2.0", "id": 1,
        "method": "tools/call",
        "params": { "name": name, "arguments": args or {} },
    })
    return r.json()["result"]["content"][0]["text"]

print(mcp_call("list_countries"))`}</pre>
          </div>
        </section>

        {/* Errors */}
        <section id="errors" className={styles.section}>
          <h2>Errors &amp; rate limits</h2>
          <p>JSON-RPC errors follow the standard codes:</p>
          <ul>
            <li><code>-32700</code> parse error — body was not valid JSON</li>
            <li><code>-32600</code> invalid request — missing <code>jsonrpc: "2.0"</code> or <code>method</code></li>
            <li><code>-32601</code> method not found — unknown JSON-RPC method</li>
            <li><code>-32602</code> invalid params — unknown tool name</li>
          </ul>
          <p>
            Tool-level errors (invalid input, Supabase failure, OTP mismatch, etc.) return{' '}
            HTTP 200 with <code>result.isError: true</code> and a text message — standard
            MCP pattern.
          </p>
          <p>
            Rate limits: IP-based sliding-window on every API route (see{' '}
            <code>middleware.ts</code>). <code>/api/purchase</code> adds a per-wallet
            10-second cooldown and $1–$5,000 order-value bounds. <code>/api/email/*</code>{' '}
            has its own envelope rate limits.
          </p>
        </section>

        {/* Discovery */}
        <section id="discovery" className={styles.section}>
          <h2>Discovery (ERC-8004)</h2>
          <p>
            The catalogue is registered on the ERC-8004 agent registry at{' '}
            <code>0x8004A169FB4a3325136EB29fA0ceB6D2e539a432</code> on Ethereum mainnet as
            agent ID <code>22628</code>. The registration document lives at:
          </p>
          <div>
            <div className={styles.codeLabel}>well-known</div>
            <pre className={styles.codeBlock}>{`GET https://cymstudio.app/.well-known/gift-cards/agent-registration.json`}</pre>
          </div>
          <p>
            Agents that discover via ERC-8004 read the <code>services</code> array from
            that JSON, pick the <code>MCP</code> entry, and connect to its{' '}
            <code>endpoint</code>.
          </p>
        </section>

        {/* Support */}
        <section id="support" className={styles.section}>
          <h2>Support</h2>
          <p>
            Bug reports, feature requests, and integration questions:
          </p>
          <ul>
            <li>GitHub: <a href="https://github.com/intrepidcanadian/cymstudios">intrepidcanadian/cymstudios</a></li>
            <li>Email: <a href="mailto:tony.lau@cymadvisory.com">tony.lau@cymadvisory.com</a></li>
          </ul>
        </section>
      </main>
    </div>
  )
}
