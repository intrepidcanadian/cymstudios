'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_ABI = ['function balanceOf(address) view returns (uint256)'];
const RPC_URL = 'https://eth.llamarpc.com';
const REFRESH_INTERVAL = 30_000; // 30 seconds

export function useUsdcBalance(walletAddress: string | undefined) {
  const [balance, setBalance] = useState<string | null>(null);
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) {
      setBalance(null);
      setEthBalance(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(RPC_URL);

      // Fetch USDC and ETH balances in parallel
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const [usdcRaw, ethRaw] = await Promise.all([
        usdcContract.balanceOf(walletAddress),
        provider.getBalance(walletAddress),
      ]);

      setBalance(ethers.formatUnits(usdcRaw, 6));
      setEthBalance(ethers.formatUnits(ethRaw, 18));
    } catch (err) {
      console.error('[useUsdcBalance] Error fetching balances:', err);
      setError('Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchBalances();

    if (walletAddress) {
      intervalRef.current = setInterval(fetchBalances, REFRESH_INTERVAL);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchBalances, walletAddress]);

  return { balance, ethBalance, loading, error, refetch: fetchBalances };
}
