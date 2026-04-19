export interface ToolCall {
  name: string
  args: any
  result: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
}

export interface ProductRow {
  product_id: number
  brand: string
  country: string | null
  currency: string | null
  denominations?: number[] | null
  value_range?: { minVal?: number; maxVal?: number; min?: number; max?: number } | null
  image?: string | null
}

export interface QuoteCardState {
  product_id: number
  denomination: number
  email: string
  network: string
  amount: string
  chain_id: number
  token: string
  pay_to: string
  original_price?: string
  original_currency?: string
}
