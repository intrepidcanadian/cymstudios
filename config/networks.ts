/**
 * Supported payment networks configuration
 *
 * Each network defines the token contract, EIP-712 domain, RPC details,
 * and payment strategy for x402 payments.
 *
 * Payment strategies:
 * - 'eip3009': Gasless via transferWithAuthorization (USDC on Ethereum, USDT0 on Conflux eSpace)
 * - 'direct':  Standard approve + transferFrom (tokens without EIP-3009 support)
 */

export type PaymentStrategy = 'eip3009' | 'direct';

export interface NetworkConfig {
  /** Display name */
  name: string;
  /** Chain ID */
  chainId: number;
  /** CAIP-2 chain identifier (e.g. "eip155:1") */
  caip2: string;
  /** Token contract address */
  tokenAddress: string;
  /** Token symbol (e.g. "USDC", "USDT0") */
  tokenSymbol: string;
  /** Token decimals */
  tokenDecimals: number;
  /** EIP-712 domain name (from contract) — only used for eip3009 strategy */
  eip712Name: string;
  /** EIP-712 domain version (from contract) — only used for eip3009 strategy */
  eip712Version: string;
  /** x402 network identifier */
  x402Network: string;
  /** RPC URL (server-side, falls back to public) */
  rpcUrl: string;
  /** RPC URL (client-side) */
  publicRpcUrl: string;
  /** Block explorer base URL */
  explorerUrl: string;
  /** Native token symbol (for display) */
  nativeSymbol: string;
  /** Payment strategy: 'eip3009' for gasless transferWithAuthorization, 'direct' for approve+transferFrom */
  paymentStrategy: PaymentStrategy;
  /** Minimum facilitator native token balance for settlement (network-specific — Ethereum needs more during congestion) */
  minGasBalance: number;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    caip2: 'eip155:1',
    tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
    eip712Name: 'USD Coin',
    eip712Version: '2',
    x402Network: 'ethereum',
    rpcUrl: process.env.ETHEREUM_MAINNET_RPC_URL || 'https://eth.llamarpc.com',
    publicRpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    nativeSymbol: 'ETH',
    paymentStrategy: 'eip3009',
    minGasBalance: 0.005, // Ethereum gas is expensive — need more buffer
  },
  conflux: {
    name: 'Conflux eSpace',
    chainId: 1030,
    caip2: 'eip155:1030',
    tokenAddress: '0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff',
    tokenSymbol: 'USDT0',
    tokenDecimals: 6,
    eip712Name: 'USDT0',
    eip712Version: '1',
    x402Network: 'conflux',
    rpcUrl: process.env.CONFLUX_ESPACE_RPC_URL || 'https://evm.confluxrpc.com',
    publicRpcUrl: process.env.NEXT_PUBLIC_CONFLUX_RPC_URL || 'https://evm.confluxrpc.com',
    explorerUrl: 'https://evm.confluxscan.org',
    nativeSymbol: 'CFX',
    paymentStrategy: 'eip3009',
    minGasBalance: 0.001, // Conflux gas is minimal
  },
};

/** Default network key */
export const DEFAULT_NETWORK = 'conflux';

/** Get network config by key — throws if key is invalid to prevent silent misrouting */
export function getNetwork(key: string): NetworkConfig {
  const network = NETWORKS[key];
  if (!network) {
    throw new Error(`Unknown network key: "${key}". Valid keys: ${Object.keys(NETWORKS).join(', ')}`);
  }
  return network;
}

/** Get network config by chain ID */
export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find(n => n.chainId === chainId);
}

/** Facilitator address (shared across networks — same EOA, different chains) */
const _facilitatorAddress = process.env.X402_MAINNET_FACILITATOR_ADDRESS
  || process.env.X402_FACILITATOR_ADDRESS
  || process.env.NEXT_PUBLIC_FACILITATOR_ADDRESS;

if (!_facilitatorAddress && typeof window === 'undefined') {
  throw new Error(
    'Missing X402_MAINNET_FACILITATOR_ADDRESS or X402_FACILITATOR_ADDRESS env var. '
    + 'The facilitator address must be configured — refusing to fall back to a hardcoded default.'
  );
}

if (!_facilitatorAddress && typeof window !== 'undefined') {
  console.error(
    '[networks] FACILITATOR_ADDRESS not set via NEXT_PUBLIC_FACILITATOR_ADDRESS env var. '
    + 'Client-side payment signing will use the server-provided payTo address from the 402 response.'
  );
}

// M19/L11: No hardcoded fallback — env var must be configured at build time.
// Server-side throws on missing. Client-side logs error and falls back to 402 response payTo.
export const FACILITATOR_ADDRESS = _facilitatorAddress || '';
