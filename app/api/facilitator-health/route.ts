import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { NETWORKS, FACILITATOR_ADDRESS } from '@/config/networks';

export const dynamic = 'force-dynamic';

// Cache the result for 60 seconds to avoid excessive RPC calls
let cachedResult: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000;

const MIN_GAS_BALANCE = 0.001; // Same threshold as purchase route M6 check

export async function GET() {
  // Return cached if fresh
  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cachedResult.data);
  }

  const results: Record<string, { healthy: boolean; balance?: string }> = {};

  await Promise.allSettled(
    Object.entries(NETWORKS).map(async ([key, net]) => {
      try {
        const provider = new ethers.JsonRpcProvider(net.rpcUrl);
        const balance = await provider.getBalance(FACILITATOR_ADDRESS);
        const balanceEth = parseFloat(ethers.formatEther(balance));
        results[key] = {
          healthy: balanceEth >= MIN_GAS_BALANCE,
          balance: balanceEth.toFixed(6),
        };
      } catch {
        results[key] = { healthy: false };
      }
    })
  );

  const data = { networks: results, timestamp: Date.now() };
  cachedResult = { data, timestamp: Date.now() };

  return NextResponse.json(data);
}
