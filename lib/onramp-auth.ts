/**
 * JWT Token Management Utilities for Onramp
 * Handles storage and retrieval of JWT tokens for backend authentication
 */

const TOKEN_KEY = 'cymstudio_onramp_jwt_token';
const USER_KEY = 'cymstudio_onramp_user';

export interface AuthUser {
  id: string;
  email: string;
  merchant_user?: string;
  kyc_status?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: AuthUser;
  error?: string;
  message?: string;
}

/**
 * Get the onramp backend API URL.
 * Returns '' when NEXT_PUBLIC_SERVER_URL is not set — callers must check and
 * degrade gracefully. We do NOT hardcode a fallback URL in the public repo.
 */
export function getBackendUrl(): string {
  const url = process.env.NEXT_PUBLIC_SERVER_URL;
  return url ? url.replace(/\/$/, '') : '';
}

/**
 * Store JWT token in localStorage
 */
export function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

/**
 * Get JWT token from localStorage
 */
export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return null;
}

/**
 * Remove JWT token from localStorage
 */
export function removeToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

/**
 * Store user data in localStorage
 */
export function setUser(user: AuthUser): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

/**
 * Get user data from localStorage
 */
export function getUser(): AuthUser | null {
  if (typeof window !== 'undefined') {
    const userStr = localStorage.getItem(USER_KEY);
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch (e) {
        console.error('Error parsing user data:', e);
        return null;
      }
    }
  }
  return null;
}

/**
 * Check if user is authenticated (has valid token)
 */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/**
 * Get Authorization header value
 */
export function getAuthHeader(): string | null {
  const token = getToken();
  return token ? `Bearer ${token}` : null;
}

/**
 * Logout user (clear token and user data)
 */
export function logout(): void {
  removeToken();
}

/**
 * Auto-register or login user using Privy credentials
 * This bridges Privy authentication with backend JWT tokens
 */
export async function syncWithPrivy(privyEmail: string, privyUserId: string): Promise<AuthResponse> {
  try {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      return {
        success: false,
        error: 'Onramp backend not configured (NEXT_PUBLIC_SERVER_URL is unset)',
      };
    }
    const response = await fetch(`${backendUrl}/auth/privy-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: privyEmail,
        privyUserId: privyUserId
      }),
    });

    const backendResponse = await response.json();

    // Backend returns: { success: "00000", data: { token, user }, message: "..." }
    const isSuccess = response.ok && (
      backendResponse.success === "00000" ||
      backendResponse.success === true ||
      backendResponse.success === "true"
    );

    const token = backendResponse.data?.token;
    const user = backendResponse.data?.user;

    if (isSuccess && token && user) {
      setToken(token);
      setUser(user);
      return {
        success: true,
        token,
        user,
        message: backendResponse.message
      };
    }

    return {
      success: false,
      error: backendResponse.error || 'Privy authentication failed',
      message: backendResponse.message,
    };
  } catch (error) {
    console.error('Error syncing with Privy:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync with backend',
    };
  }
}
