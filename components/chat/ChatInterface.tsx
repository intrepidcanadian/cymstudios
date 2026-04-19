'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useWalletClient } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { DEFAULT_NETWORK, NETWORKS } from '@/config/networks'
import PurchaseModal from '@/components/catalogue/PurchaseModal'
import type { BrandProduct } from '@/lib/types/catalogue'
import ChatMessages from './ChatMessages'
import type { ChatMessage, ToolCall, QuoteCardState } from './types'
import styles from '@/app/chat/chat.module.css'

const STARTER_PROMPTS = [
  'Find me Pacific Coffee gift cards',
  'What brands do you have for Hong Kong?',
  'List all supported currencies',
  'I want to buy a $50 US gift card',
]

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<BrandProduct | null>(null)
  const [initialAmount, setInitialAmount] = useState<string | undefined>(undefined)
  const [selectedNetwork, setSelectedNetwork] = useState<string>(DEFAULT_NETWORK)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { open: openAppKit } = useAppKit()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setError(null)
    const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const apiMessages = next.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }))
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Chat failed (${res.status})`)

      const toolCalls: ToolCall[] = Array.isArray(data.tool_calls) ? data.tool_calls : []
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.content || '',
          toolCalls,
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [messages, loading])

  // Fetch full brand details and open the purchase modal. Shared between
  // "click a product card" and "click Review & pay on a quote card".
  const openPurchaseFor = useCallback(
    async (productId: number, denomination?: number, network?: string) => {
      if (!isConnected) {
        await openAppKit()
        return
      }
      try {
        const res = await fetch(`/api/mcp/rewards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: 'get_brand_details', arguments: { product_id: productId } },
            id: 1,
          }),
        })
        const body = await res.json()
        const text = body?.result?.content?.[0]?.text || '{}'
        const start = text.search(/[\[{]/)
        const detail = start >= 0 ? JSON.parse(text.slice(start)) : {}
        const product: BrandProduct = {
          product_id: Number(productId),
          brand_name: detail.brand || 'Brand',
          country_name: detail.country || null,
          currency: detail.currency || null,
          product_image: detail.image || null,
          value_restrictions: detail.value_restrictions || null,
          denominations: detail.denominations || null,
          product_description: detail.description || null,
          terms_and_conditions: detail.terms_and_conditions || null,
          how_to_use: detail.how_to_use || null,
          expiry_and_validity: detail.expiry_and_validity || null,
        }
        setSelectedProduct(product)
        setInitialAmount(denomination !== undefined ? String(denomination) : undefined)
        setSelectedNetwork(network || DEFAULT_NETWORK)
      } catch (err) {
        setError('Failed to load product details for checkout.')
      }
    },
    [isConnected, openAppKit]
  )

  const handleQuotePurchase = useCallback(
    (quote: QuoteCardState) => openPurchaseFor(quote.product_id, quote.denomination, quote.network),
    [openPurchaseFor]
  )

  const handleProductSelect = useCallback(
    (productId: number, denomination?: number) => openPurchaseFor(productId, denomination),
    [openPurchaseFor]
  )

  const handlePurchaseComplete = useCallback((orderId: string, email: string, orderToken: string, tx?: string) => {
    setSelectedProduct(null)
    setInitialAmount(undefined)
    const summary = tx
      ? `Purchase complete. Order ID \`${orderId}\`. Payment tx: ${tx}. I'll check delivery in a moment.`
      : `Purchase submitted. Order ID \`${orderId}\`. Fulfillment usually completes within ~60 seconds.`
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: summary, toolCalls: [] },
    ])
    // Automatically ask the assistant to check the order status.
    send(`Please check the status of order ${orderId} for email ${email}.`)
  }, [send])

  const selectSuggestion = (s: string) => send(s)

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          CYM <em>Chat</em>
        </div>
        <nav className={styles.headerCrumb}>
          <Link href="/">Studio</Link>
          <Link href="/catalogue">Rewards</Link>
        </nav>
      </header>

      <main className={styles.main}>
        {messages.length === 0 ? (
          <section className={styles.intro}>
            <h1 className={styles.introTitle}>Talk to the <em>rewards concierge.</em></h1>
            <p className={styles.introLede}>
              Ask in plain language — "find me Starbucks gift cards", "what denominations are available for Apple?",
              "buy a $25 US gift card". I'll call the MCP, render the catalogue, and hand off to your wallet for gasless USDT0 or USDC signing.
            </p>
            <div className={styles.introSuggestions}>
              {STARTER_PROMPTS.map(s => (
                <button key={s} type="button" className={styles.introChip} onClick={() => selectSuggestion(s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <ChatMessages
          messages={messages}
          loading={loading}
          onQuotePurchase={handleQuotePurchase}
          onProductSelect={handleProductSelect}
        />

        {error && <div className={styles.error}>{error}</div>}
        <div ref={bottomRef} />
      </main>

      <div className={styles.composerWrap}>
        <form
          className={styles.composer}
          onSubmit={e => {
            e.preventDefault()
            send(input)
          }}
        >
          <textarea
            className={styles.composerInput}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={loading ? 'Thinking…' : 'Ask about brands, denominations, countries, or start a purchase…'}
            rows={1}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            disabled={loading}
          />
          <button type="submit" className={styles.composerSend} disabled={loading || !input.trim()}>
            {loading ? '…' : 'Send'}
          </button>
        </form>
        <div className={styles.composerHint}>ENTER TO SEND · SHIFT+ENTER FOR NEW LINE</div>
      </div>

      {selectedProduct && (
        <PurchaseModal
          product={selectedProduct}
          onClose={() => {
            setSelectedProduct(null)
            setInitialAmount(undefined)
          }}
          onPurchaseComplete={handlePurchaseComplete}
          selectedNetwork={selectedNetwork}
          onNetworkChange={setSelectedNetwork}
          walletProvider={walletClient}
          initialAmount={initialAmount}
        />
      )}
    </>
  )
}
