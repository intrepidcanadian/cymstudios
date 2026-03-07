import type { Metadata, Viewport } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'CYM Studio - Using AI for Epic Videos',
  description: 'Explore CYM Studio - Using AI to create epic videos for Starcraft tournaments, small businesses, and creators.',
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
  const privyAppId = process.env.PRIVY_APP_ID;

  return (
    <html lang="en">
      <body>
        <Providers privyAppId={privyAppId}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
