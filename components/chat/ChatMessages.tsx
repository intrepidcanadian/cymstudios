'use client'

import styles from '@/app/chat/chat.module.css'
import type { ChatMessage, ProductRow, QuoteCardState, ToolCall } from './types'

interface Props {
  messages: ChatMessage[]
  loading: boolean
  onQuotePurchase: (quote: QuoteCardState) => void
}

export default function ChatMessages({ messages, loading, onQuotePurchase }: Props) {
  return (
    <section className={styles.messages}>
      {messages.map((m, i) => (
        <article
          key={i}
          className={`${styles.message} ${m.role === 'user' ? styles.messageUser : ''}`}
        >
          <span className={styles.messageRoleTag}>{m.role === 'user' ? 'YOU' : 'CYM'}</span>
          <div>
            {m.content ? <div className={styles.messageBody}>{m.content}</div> : null}
            {m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 ? (
              <ToolCallsRenderer toolCalls={m.toolCalls} onQuotePurchase={onQuotePurchase} />
            ) : null}
          </div>
        </article>
      ))}
      {loading ? <div className={styles.loading}>Thinking…</div> : null}
    </section>
  )
}

function ToolCallsRenderer({
  toolCalls,
  onQuotePurchase,
}: {
  toolCalls: ToolCall[]
  onQuotePurchase: (q: QuoteCardState) => void
}) {
  return (
    <>
      {toolCalls.map((call, idx) => (
        <ToolCallCard key={idx} call={call} onQuotePurchase={onQuotePurchase} />
      ))}
    </>
  )
}

function ToolCallCard({
  call,
  onQuotePurchase,
}: {
  call: ToolCall
  onQuotePurchase: (q: QuoteCardState) => void
}) {
  // Rich renderers per tool; everything else falls back to a code block.
  switch (call.name) {
    case 'search_giftcards':
    case 'search_mastercard':
      return <ProductGrid call={call} />
    case 'get_brand_details':
    case 'get_mastercard_details':
      return <BrandDetail call={call} />
    case 'list_countries':
    case 'list_currencies':
      return <ListBlock call={call} />
    case 'get_purchase_quote':
      return <QuoteCard call={call} onPurchase={onQuotePurchase} />
    default:
      return <RawBlock call={call} />
  }
}

function extractJson(text: string): any | null {
  // Tool results may include a summary line before the JSON body. Find the
  // first `{` or `[` and parse from there.
  const start = text.search(/[\[{]/)
  if (start === -1) return null
  const candidate = text.slice(start)
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function ProductGrid({ call }: { call: ToolCall }) {
  const parsed = extractJson(call.result)
  const rows: ProductRow[] = Array.isArray(parsed) ? parsed : []
  if (rows.length === 0) return <RawBlock call={call} label="TOOL · no results" />

  return (
    <div className={styles.toolBlock}>
      <div className={styles.toolBlockLabel}>
        TOOL · {call.name} — {rows.length} result{rows.length === 1 ? '' : 's'}
      </div>
      <div className={styles.productGrid}>
        {rows.map((row, i) => (
          <div key={`${row.product_id}-${i}`} className={styles.productCard}>
            <div className={styles.productCardThumb}>
              {row.image ? <img src={row.image} alt={row.brand} loading="lazy" /> : null}
            </div>
            <div>
              <div className={styles.productCardBrand}>{row.brand}</div>
              <div className={styles.productCardMeta}>
                {row.country}
                {row.currency ? ` · ${row.currency}` : ''}
              </div>
              <div className={styles.productCardMeta}>
                {formatDenominations(row)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDenominations(row: ProductRow): string {
  if (Array.isArray(row.denominations) && row.denominations.length > 0) {
    return row.denominations.slice(0, 4).map(d => `${row.currency || ''} ${d}`.trim()).join(' · ')
  }
  const vr = row.value_range
  if (vr) {
    const min = vr.minVal ?? vr.min
    const max = vr.maxVal ?? vr.max
    if (min !== undefined && max !== undefined) {
      return `${row.currency || ''} ${min}–${max}`.trim()
    }
  }
  return '—'
}

function BrandDetail({ call }: { call: ToolCall }) {
  const parsed = extractJson(call.result)
  if (!parsed) return <RawBlock call={call} />
  return (
    <div className={styles.toolBlock}>
      <div className={styles.toolBlockLabel}>TOOL · {call.name}</div>
      <div className={styles.productCard} style={{ cursor: 'default' }}>
        <div className={styles.productCardThumb}>
          {parsed.image ? <img src={parsed.image} alt={parsed.brand} loading="lazy" /> : null}
        </div>
        <div>
          <div className={styles.productCardBrand}>{parsed.brand}</div>
          <div className={styles.productCardMeta}>
            {parsed.country} · {parsed.currency}
          </div>
          {parsed.denominations || parsed.value_restrictions ? (
            <div className={styles.productCardMeta}>
              {formatDenominations({
                product_id: parsed.product_id,
                brand: parsed.brand,
                country: parsed.country,
                currency: parsed.currency,
                denominations: parsed.denominations,
                value_range: parsed.value_restrictions,
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ListBlock({ call }: { call: ToolCall }) {
  const parsed = extractJson(call.result)
  if (!parsed) return <RawBlock call={call} />
  const list: string[] = parsed.countries || parsed.currencies || []
  return (
    <div className={styles.toolBlock}>
      <div className={styles.toolBlockLabel}>TOOL · {call.name}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {list.map(item => (
          <span
            key={item}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: 'var(--cat-bg-3)',
              border: '1px solid var(--cat-line)',
              fontSize: 12,
              color: 'var(--cat-fg-dim)',
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function QuoteCard({
  call,
  onPurchase,
}: {
  call: ToolCall
  onPurchase: (q: QuoteCardState) => void
}) {
  const parsed = extractJson(call.result)
  if (!parsed?.payment_requirements || !parsed?.correlation) return <RawBlock call={call} />

  const req = parsed.payment_requirements
  const corr = parsed.correlation
  const amount = humanAmount(req.amount, 6) // USDC/USDT0 = 6 decimals

  const state: QuoteCardState = {
    product_id: corr.product_id,
    denomination: corr.denomination,
    email: corr.email,
    network: corr.network,
    amount: req.amount,
    chain_id: req.chain_id,
    token: req.token,
    pay_to: req.pay_to,
    original_price: req.original_price,
    original_currency: req.original_currency,
  }

  const tokenLabel = req.network === 'conflux' ? 'USDT0' : 'USDC'

  return (
    <div className={styles.quoteCard}>
      <div className={styles.toolBlockLabel}>QUOTE · {tokenLabel} on {req.network}</div>
      {req.original_price && req.original_currency ? (
        <div className={styles.quoteRow}>
          <span className="label">Face value</span>
          <span className="value">{req.original_currency} {req.original_price}</span>
        </div>
      ) : null}
      <div className={styles.quoteRow}>
        <span className="label">Network fee (you pay)</span>
        <span className="value">$0.00</span>
      </div>
      <div className={`${styles.quoteRow} ${styles.quoteTotal}`}>
        <span className="label">Total</span>
        <span className="value">{amount} {tokenLabel}</span>
      </div>
      <button type="button" className={styles.quoteBtn} onClick={() => onPurchase(state)}>
        Review &amp; pay
      </button>
    </div>
  )
}

function humanAmount(raw: string, decimals: number): string {
  try {
    const n = BigInt(raw)
    let divisor = BigInt(1)
    for (let i = 0; i < decimals; i++) divisor *= BigInt(10)
    const whole = n / divisor
    const frac = n % divisor
    const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2)
    return `${whole.toString()}.${fracStr}`
  } catch {
    return raw
  }
}

function RawBlock({ call, label }: { call: ToolCall; label?: string }) {
  return (
    <div className={styles.toolBlock}>
      <div className={styles.toolBlockLabel}>{label || `TOOL · ${call.name}`}</div>
      <pre
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--cat-fg-dim)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {truncate(call.result, 600)}
      </pre>
    </div>
  )
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…'
}
