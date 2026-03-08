import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  getToken,
  getUser,
  removeToken,
  syncWithPrivy,
  type AuthUser,
} from '@/lib/onramp-auth';

export function useAuth() {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { ready: privyReady, user: privyUser, authenticated: privyAuthenticated } = usePrivy();

  // Load token and user from localStorage on mount
  useEffect(() => {
    const storedToken = getToken();
    const storedUser = getUser();
    setTokenState(storedToken);
    setUserState(storedUser);
    setLoading(false);
  }, []);

  // Auto-sync with Privy when Privy user is authenticated
  useEffect(() => {
    const syncPrivyAuth = async () => {
      if (!privyReady) return;
      if (!privyAuthenticated || !privyUser) return;

      // Extract email from Privy user (try multiple sources)
      const email =
        privyUser.email?.address ||
        privyUser.google?.email ||
        (privyUser.twitter as any)?.email ||
        (privyUser.apple as any)?.email ||
        (privyUser.discord as any)?.email ||
        (privyUser.github as any)?.email ||
        (privyUser.linkedin as any)?.email ||
        (privyUser.farcaster as any)?.email;

      const userId = privyUser.id;

      if (!email || !userId) {
        console.warn('Cannot sync Privy user: missing email or userId');
        setError('Privy user missing email or user ID');
        return;
      }

      // Check if we already have a valid token
      const storedToken = getToken();
      const storedUser = getUser();

      if (storedToken && storedUser) {
        if (storedUser.email === email) {
          if (!token) setTokenState(storedToken);
          if (!user) setUserState(storedUser);
          return;
        } else {
          removeToken();
        }
      }

      setLoading(true);
      setError(null);

      try {
        const result = await syncWithPrivy(email, userId);

        if (result.success && result.token && result.user) {
          setTokenState(result.token);
          setUserState(result.user);
          setError(null);
        } else {
          setError(result.error || 'Failed to sync with backend');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to sync with backend');
      } finally {
        setLoading(false);
      }
    };

    syncPrivyAuth();
  }, [privyReady, privyAuthenticated, privyUser]);

  const logout = useCallback(() => {
    removeToken();
    setTokenState(null);
    setUserState(null);
    setError(null);
  }, []);

  const isAuthenticated = useCallback(() => {
    return token !== null && user !== null;
  }, [token, user]);

  return {
    token,
    user,
    loading,
    error,
    logout,
    isAuthenticated: isAuthenticated(),
    privyReady,
    privyUser,
    privyAuthenticated,
  };
}
