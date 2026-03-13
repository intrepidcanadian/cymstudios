'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { mainnet } from 'viem/chains';
import { useEffect, useState } from 'react';

/**
 * PrivyClientProvider - Wraps app with Privy authentication
 *
 * IMPORTANT: If you see "Origin not allowed" (403) errors:
 * 1. Go to https://privy.io/dashboard
 * 2. Select your app
 * 3. Go to Settings → Allowed Origins
 * 4. Add your domains:
 *    - Local: http://localhost:3000, http://127.0.0.1:3000
 *    - Production: your production domain
 */
export default function PrivyClientProvider({
  children,
  appId
}: {
  children: React.ReactNode;
  appId: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#9333EA',
          logo: '/cym.png',
        },
        loginMethods: ['email', 'google'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          showWalletUIs: true,
        },
        defaultChain: mainnet,
        supportedChains: [mainnet],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
