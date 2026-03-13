'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_ABI = ['function balanceOf(address) view returns (uint256)'];
const RPC_URL = process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';

// Module-level cached provider to avoid recreating on every fetch
let cachedProvider: any = null;

function getProvider(ethers: any) {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return cachedProvider;
}

export function useUsdcBalance(walletAddress: string | undefined) {
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

    try {
      if (!hasFetchedRef.current) {
        setLoading(true);
      }
      setError(null);

      const { ethers } = await import('ethers');
      const provider = getProvider(ethers);

      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const [usdcRaw, ethRaw] = await Promise.all([
        usdcContract.balanceOf(walletAddress),
        provider.getBalance(walletAddress),
      ]);

      setBalance(ethers.formatUnits(usdcRaw, 6));
      setEthBalance(ethers.formatUnits(ethRaw, 18));
      hasFetchedRef.current = true;
    } catch (err) {
      if (!hasFetchedRef.current) {
        console.error('[useUsdcBalance] Error fetching balances:', err);
      }
      setError('Failed to fetch balance');
      cachedProvider = null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  // Fetch once on mount / wallet change — no polling
  useEffect(() => {
    hasFetchedRef.current = false;
    fetchBalances();
  }, [fetchBalances]);

  return { balance, ethBalance, loading, error, refetch: fetchBalances };
}
