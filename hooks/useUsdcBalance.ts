'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { NETWORKS } from '@/config/networks';

const TOKEN_ABI = ['function balanceOf(address) view returns (uint256)'];

// Module-level cached providers to avoid recreating on every fetch
const cachedProviders: Record<string, any> = {};

function getProvider(ethers: any, networkKey: string) {
  if (!cachedProviders[networkKey]) {
    const network = NETWORKS[networkKey];
    if (!network) return null;
    cachedProviders[networkKey] = new ethers.JsonRpcProvider(network.publicRpcUrl);
  }
  return cachedProviders[networkKey];
}

export function useUsdcBalance(walletAddress: string | undefined, networkKey: string = 'ethereum') {
  const [balance, setBalance] = useState<string | null>(null);
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) {
      setBalance(null);
      setEthBalance(null);
      return;
    }

    const network = NETWORKS[networkKey];
    if (!network) {
      setError('Unknown network');
      return;
    }

    try {
      if (!hasFetchedRef.current) {
        setLoading(true);
      }
      setError(null);

      const { ethers } = await import('ethers');
      const provider = getProvider(ethers, networkKey);
      if (!provider) {
        setError('Failed to create provider');
        return;
      }

      const tokenContract = new ethers.Contract(network.tokenAddress, TOKEN_ABI, provider);
      const [tokenRaw, nativeRaw] = await Promise.all([
        tokenContract.balanceOf(walletAddress),
        provider.getBalance(walletAddress),
      ]);

      setBalance(ethers.formatUnits(tokenRaw, network.tokenDecimals));
      setEthBalance(ethers.formatUnits(nativeRaw, 18));
      hasFetchedRef.current = true;
    } catch (err) {
      if (!hasFetchedRef.current) {
        console.error('[useUsdcBalance] Error fetching balances:', err);
      }
      setError('Failed to fetch balance');
      delete cachedProviders[networkKey];
    } finally {
      setLoading(false);
    }
  }, [walletAddress, networkKey]);

  // Fetch once on mount / wallet change / network change — no polling
  useEffect(() => {
    hasFetchedRef.current = false;
    fetchBalances();
  }, [fetchBalances]);

  const network = NETWORKS[networkKey];

  return {
    balance,
    ethBalance,
    loading,
    error,
    refetch: fetchBalances,
    tokenSymbol: network?.tokenSymbol || 'USDC',
    nativeSymbol: network?.nativeSymbol || 'ETH',
  };
}
