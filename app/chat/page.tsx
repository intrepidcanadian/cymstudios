import type { Metadata } from 'next'
import ChatInterface from '@/components/chat/ChatInterface'
import styles from './chat.module.css'

export const metadata: Metadata = {
  title: 'Chat — CYM Rewards',
  description: 'Chat with the CYM Rewards concierge. Browse 300+ brands, get instant USDT0/USDC quotes, and redeem with a single wallet signature.',
}

export default function ChatPage() {
  return (
    <div className={styles.shell}>
      <ChatInterface />
    </div>
  )
}
