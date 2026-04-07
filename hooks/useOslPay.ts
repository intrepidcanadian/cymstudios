import { useState } from 'react';
import { OslPayUrlParams, OSL_PAY_CONFIG, validateOslPayParams, generateMerchantOrder } from '@/config/oslPay';
import { useAccount } from 'wagmi';
import { useAuth } from './useAuth';
import { getBackendUrl, getAuthHeader, removeToken } from '@/lib/onramp-auth';

interface OslPayResponse {
  success: boolean;
  message?: string;
  url?: string;
  error?: string;
  data?: {
    url: string;
  };
}

export function useOslPay() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address, isConnected, status } = useAccount();
  const { token, isAuthenticated: isBackendAuthenticated, loading: authLoading } = useAuth();

  const generateOslPayUrl = async (params: OslPayUrlParams): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      if (status === 'reconnecting') {
        throw new Error('Wallet is still initializing. Please wait a moment and try again.');
      }

      if (!isConnected || !address) {
        throw new Error('Please connect your wallet to use OSL Pay');
      }

      const validation = validateOslPayParams(params);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      if (!isBackendAuthenticated || !token) {
        throw new Error('Backend authentication required. Please ensure you are logged in.');
      }

      const backendUrl = getBackendUrl();

      const appId = params.appId || OSL_PAY_CONFIG.merchant.appId || process.env.NEXT_PUBLIC_OSL_APP_ID;
      if (!appId) {
        throw new Error('OSL Pay appId is not configured.');
      }

      const merchantOrder = params.merchantOrder || generateMerchantOrder();

      const baseSuccessUrl = params.successUrl || OSL_PAY_CONFIG.callbacks.success;
      const baseFailUrl = params.failUrl || OSL_PAY_CONFIG.callbacks.fail;
      const successUrl = `${baseSuccessUrl}${baseSuccessUrl.includes('?') ? '&' : '?'}orderId=${merchantOrder}`;
      const failUrl = `${baseFailUrl}${baseFailUrl.includes('?') ? '&' : '?'}orderId=${merchantOrder}`;

      try {
        localStorage.setItem('osl_last_merchant_order', merchantOrder);
        localStorage.setItem('osl_last_order_time', Date.now().toString());
      } catch {}

      const requestParams: OslPayUrlParams = {
        appId,
        amount: params.amount || OSL_PAY_CONFIG.amountLimits.default,
        crypto: params.crypto || 'USDT',
        network: params.network || 'ERC20',
        fiatCurrency: params.fiatCurrency || 'USD',
        payWayCode: params.payWayCode,
        email: params.email || '',
        ...(params.accessToken ? { accessToken: params.accessToken } : {}),
        merchantUser: params.merchantUser || address,
        merchantOrder,
        address: params.address,
        successUrl,
        failUrl,
        callbackUrl: params.callbackUrl || OSL_PAY_CONFIG.callbacks.webhook,
        checkType: params.checkType || 'DEFI_BIND',
        useBorder: params.useBorder,
        locale: params.locale || 'en',
      };

      const endpoint = '/osl-pay/generate-payment-url';

      const authHeader = getAuthHeader();
      if (!authHeader) {
        throw new Error('Authentication token not found. Please log in again.');
      }

      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify(requestParams),
      });

      let data: OslPayResponse;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Backend returned invalid response (${response.status}): ${text.substring(0, 200)}`);
      }

      if (!response.ok || !data.success) {
        if (response.status === 403 || response.status === 401 ||
            data.error === 'Invalid token' || data.message === 'Invalid token') {
          removeToken();
          throw new Error('Session expired. Please refresh the page and try again.');
        }
        throw new Error(data.error || data.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const url = data.data?.url || data.url || null;
      if (url && !url.startsWith('http')) {
        throw new Error('Invalid URL format received from backend');
      }

      return url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const openOslPay = async (params: OslPayUrlParams) => {
    if (!isBackendAuthenticated || !token) {
      throw new Error('Backend authentication required.');
    }

    const url = await generateOslPayUrl(params);

    if (url) {
      const newWindow = window.open(url, '_blank', 'noopener,noreferrer,width=1200,height=800');
      if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
        window.location.href = url;
      }
    }
  };

  const generateKycUrl = async (merchantUser?: string): Promise<string | null> => {
    if (!isConnected) {
      throw new Error('Wallet must be connected');
    }

    if (!isBackendAuthenticated || !token) {
      throw new Error('Backend authentication required.');
    }

    const backendUrl = getBackendUrl();
    const authHeader = getAuthHeader();

    if (!authHeader) {
      throw new Error('Authentication token not found.');
    }

    const appIdForKyc = OSL_PAY_CONFIG.merchant.appId || process.env.NEXT_PUBLIC_OSL_APP_ID;

    const response = await fetch(`${backendUrl}/osl-pay/generate-kyc-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        merchantUser: merchantUser || address || '',
        appId: appIdForKyc,
      }),
    });

    const data: OslPayResponse = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to generate KYC URL');
    }

    return data.data?.url || data.url || null;
  };

  const generatePaymentUrl = async (params: OslPayUrlParams): Promise<string | null> => {
    if (!isConnected) {
      throw new Error('Wallet must be connected');
    }

    if (!isBackendAuthenticated || !token) {
      throw new Error('Backend authentication required.');
    }

    const backendUrl = getBackendUrl();
    const authHeader = getAuthHeader();

    if (!authHeader) {
      throw new Error('Authentication token not found.');
    }

    const appIdForPayment = params.appId || OSL_PAY_CONFIG.merchant.appId || process.env.NEXT_PUBLIC_OSL_APP_ID;

    const response = await fetch(`${backendUrl}/osl-pay/generate-payment-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        ...params,
        appId: appIdForPayment,
        merchantUser: params.merchantUser || address || '',
        checkType: 'DEFI_BIND',
      }),
    });

    const data: OslPayResponse = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to generate payment URL');
    }

    return data.data?.url || data.url || null;
  };

  const generateAccessTokenUrl = async (accessToken: string, params?: Partial<OslPayUrlParams>): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      if (!accessToken) {
        throw new Error('Access token is required');
      }

      const backendUrl = getBackendUrl();
      const authHeader = getAuthHeader();

      if (!authHeader) {
        throw new Error('Authentication token not found.');
      }

      const response = await fetch(`${backendUrl}/osl-pay/generate-access-token-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          accessToken,
          merchantUser: params?.merchantUser || address || '',
          successUrl: params?.successUrl || OSL_PAY_CONFIG.callbacks.success,
          failUrl: params?.failUrl || OSL_PAY_CONFIG.callbacks.fail,
          callbackUrl: params?.callbackUrl || OSL_PAY_CONFIG.callbacks.webhook,
          locale: params?.locale || 'en',
        }),
      });

      const data: OslPayResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate access token URL');
      }

      return data.url || null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    generateOslPayUrl,
    generateSmartUrl: generateOslPayUrl,
    generateKycUrl,
    generatePaymentUrl,
    generateAccessTokenUrl,
    openOslPay,
    loading: loading || authLoading,
    error,
    isBackendAuthenticated,
  };
}
