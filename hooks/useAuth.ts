import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import {
  getToken,
  getUser,
  removeToken,
  type AuthUser,
} from '@/lib/onramp-auth';

/**
 * Auth hook — uses wagmi wallet connection state.
 *
 * With WalletConnect, we don't get email from the wallet.
 * Email is captured at purchase time and stored in localStorage.
 */
export function useAuth() {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { address, isConnected, status } = useAccount();

  // Load token and user from localStorage on mount
  useEffect(() => {
    const storedToken = getToken();
    const storedUser = getUser();
    setTokenState(storedToken);
    setUserState(storedUser);
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setTokenState(null);
    setUserState(null);
    setError(null);
  }, []);

  const isAuthenticated = useCallback(() => {
    return isConnected && !!address;
  }, [isConnected, address]);

  return {
    token,
    user,
    loading,
    error,
    logout,
    isAuthenticated: isAuthenticated(),
    walletReady: status !== 'reconnecting',
    walletAddress: address,
    walletConnected: isConnected,
  };
}
