'use client';

import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet } from '@reown/appkit/networks';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

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

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: appKitNetworks as any,
});

let initialized = false;

export function initAppKit() {
  if (initialized || !projectId) return;
  initialized = true;

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
