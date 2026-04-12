'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet } from '@reown/appkit/networks';
import { confluxESpace, supportedChains } from '@/config/wagmi';

// WalletConnect project ID from Reown Cloud
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

// Reown AppKit networks (must match wagmi chains)
const appKitNetworks = [mainnet, {
  id: 1030,
  name: 'Conflux eSpace',
  nativeCurrency: { name: 'CFX', symbol: 'CFX', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evm.confluxrpc.com'] },
  },
  blockExplorers: {
    default: { name: 'ConfluxScan', url: 'https://evm.confluxscan.org' },
  },
}] as const;

// Create wagmi adapter for AppKit
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: appKitNetworks as any,
});

// Initialize AppKit (runs once at module level)
if (projectId) {
  createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks: appKitNetworks as any,
    defaultNetwork: mainnet,
    metadata: {
      name: 'CYM Studio',
      description: 'Gift Card Rewards with Stablecoins',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://cymstudio.app',
      icons: ['/cym.png'],
    },
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#6366f1',
    },
    features: {
      analytics: false,
    },
  });
}

const queryClient = new QueryClient();

export default function Web3Provider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
