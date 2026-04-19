import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Instrument_Serif, Inter } from 'next/font/google'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CYM Studio — AI ads that sell',
  description: 'AI-native ad pipelines forged in live broadcast. We help e-commerce brands ship ad creative that converts.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${jetbrainsMono.variable} ${instrumentSerif.variable} ${inter.variable}`}>
      <body>
        {children}
      </body>
    </html>
  )
}
