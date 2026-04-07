import { http, createConfig } from 'wagmi';
import { mainnet, base } from 'wagmi/chains';
import { defineChain } from 'viem';

/**
 * Conflux eSpace chain definition (not in viem's built-in chains)
 */
export const confluxESpace = defineChain({
  id: 1030,
  name: 'Conflux eSpace',
  nativeCurrency: { name: 'CFX', symbol: 'CFX', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evm.confluxrpc.com'] },
  },
  blockExplorers: {
    default: { name: 'ConfluxScan', url: 'https://evm.confluxscan.org' },
  },
});

/**
 * All supported chains
 */
export const supportedChains = [mainnet, base, confluxESpace] as const;

/**
 * Wagmi configuration
 *
 * WalletConnect projectId is required — obtain from https://cloud.reown.com
 */
export const wagmiConfig = createConfig({
  chains: supportedChains,
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth.llamarpc.com'),
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
    [confluxESpace.id]: http(process.env.NEXT_PUBLIC_CONFLUX_RPC_URL || 'https://evm.confluxrpc.com'),
  },
  ssr: true,
});
