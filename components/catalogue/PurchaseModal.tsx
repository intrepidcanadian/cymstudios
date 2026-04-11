'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BrandProduct } from '@/lib/types/catalogue';
import { payWithX402 } from '@/lib/x402-client';
import { useAccount, useSwitchChain } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { NETWORKS } from '@/config/networks';

interface PurchaseModalProps {
  product: BrandProduct;
  onClose: () => void;
  onPurchaseComplete: (orderId: string, userEmail: string, orderToken: string, paymentTxHash?: string) => void;
  usdcBalance?: string | null;
  selectedNetwork: string;
  onNetworkChange: (network: string) => void;
  walletProvider: any;
  onRefreshBalance?: () => void;
  initialAmount?: string;
}

interface UserProfile {
  email?: string;
  firstName?: string;
  lastName?: string;
}

export default function PurchaseModal({
  product,
  onClose,
  onPurchaseComplete,
  usdcBalance,
  selectedNetwork,
  onNetworkChange,
  walletProvider,
  onRefreshBalance,
  initialAmount,
}: PurchaseModalProps) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { open } = useAppKit();

  const [amount, setAmount] = useState<string>(initialAmount || '');
  const [email, setEmail] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usdcAmount, setUsdcAmount] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [quoteFetchedAt, setQuoteFetchedAt] = useState<number | null>(null);
  const [quoteStale, setQuoteStale] = useState(false);
  const [step, setStep] = useState<'form' | 'verify-email' | 'confirm' | 'processing'>('form');
  const [paymentStep, setPaymentStep] = useState<string>('');
  const [hasFailedOnce, setHasFailedOnce] = useState(false);
  const [quoteRefreshed, setQuoteRefreshed] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // M8: Email OTP verification state
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null);
  const [verifiedEmails, setVerifiedEmails] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('verifiedEmails');
        return saved ? new Set(JSON.parse(saved)) : new Set();
      } catch { return new Set(); }
    }
    return new Set();
  });

  // Tick every second while on OTP step to keep cooldown countdown live
  const [, setOtpTick] = useState(0);
  useEffect(() => {
    if (step !== 'verify-email' || !otpSentAt) return;
    const interval = setInterval(() => setOtpTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [step, otpSentAt]);

  const isEmailVerified = (e: string) => verifiedEmails.has(e.toLowerCase().trim());

  const persistVerifiedEmail = (e: string) => {
    setVerifiedEmails((prev) => {
      const next = new Set(prev);
      next.add(e.toLowerCase().trim());
      if (typeof window !== 'undefined') {
        localStorage.setItem('verifiedEmails', JSON.stringify(Array.from(next)));
      }
      return next;
    });
  };

  type OtpResult =
    | { status: 'sent' }
    | { status: 'verified' }
    | { status: 'error'; message: string };

  const requestOtp = async (): Promise<OtpResult> => {
    setOtpError(null);
    setOtpSending(true);
    try {
      const resp = await fetch('/api/email/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        const message = data.error || 'Failed to send verification code';
        setOtpError(message);
        return { status: 'error', message };
      }
      // Server may report email is already verified
      if (data.alreadyVerified) {
        persistVerifiedEmail(email);
        return { status: 'verified' };
      }
      setOtpSentAt(Date.now());
      return { status: 'sent' };
    } catch {
      const message = 'Network error sending verification code. Please try again.';
      setOtpError(message);
      return { status: 'error', message };
    } finally {
      setOtpSending(false);
    }
  };

  const submitOtp = async () => {
    if (!/^\d{6}$/.test(otpCode)) {
      setOtpError('Please enter the 6-digit code from your email');
      return;
    }
    setOtpError(null);
    setOtpVerifying(true);
    try {
      const resp = await fetch('/api/email/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        setOtpError(data.error || 'Verification failed');
        return;
      }
      persistVerifiedEmail(email);
      setOtpCode('');
      setStep('confirm');
    } catch {
      setOtpError('Network error verifying code. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  };
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('userProfile');
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  const submittingRef = useRef(false);
  const lastAttemptRef = useRef<number>(0);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape key: keep focus within modal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (step === 'processing') {
        setShowCloseWarning(true);
      } else {
        onClose();
      }
      return;
    }
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, [step, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Focus first focusable element on mount
    if (modalRef.current) {
      const first = modalRef.current.querySelector<HTMLElement>('button, input, select');
      first?.focus();
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  const PURCHASE_COOLDOWN_MS = 10_000; // 10 second cooldown between attempts
  const networkConfig = NETWORKS[selectedNetwork];
  const walletReady = isConnected && !!walletProvider;

  // Check if balance is insufficient
  const insufficientBalance = usdcAmount && usdcBalance
    ? parseFloat(usdcBalance) < parseFloat(usdcAmount)
    : false;

  // Load saved profile on mount
  useEffect(() => {
    if (userProfile.email) setEmail(userProfile.email);
    if (userProfile.firstName) setFirstName(userProfile.firstName);
    if (userProfile.lastName) setLastName(userProfile.lastName);
  }, [userProfile]);

  // Switch chain when network changes
  useEffect(() => {
    if (!walletReady || !networkConfig) return;
    const targetChainId = networkConfig.chainId;
    if (chainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
    }
  }, [selectedNetwork, walletReady, chainId, networkConfig, switchChain]);

  // Fetch USDC quote when amount changes
  const FX_FEE_PERCENT = product.currency === 'USD' ? 0.5 : 1.5;

  useEffect(() => {
    const fetchUsdcQuote = async () => {
      if (!amount) {
        setUsdcAmount(null);
        setExchangeRate(null);
        return;
      }

      const price = parseFloat(amount);
      if (isNaN(price) || price <= 0) {
        setUsdcAmount(null);
        setExchangeRate(null);
        return;
      }

      const feeMultiplier = 1 + (FX_FEE_PERCENT / 100);

      if (product.currency === 'USD') {
        setUsdcAmount((price * feeMultiplier).toFixed(2));
        setExchangeRate(feeMultiplier);
        setQuoteFetchedAt(Date.now());
        setQuoteStale(false);
        return;
      }

      setLoadingQuote(true);
      try {
        const response = await fetch(`/api/exchange-rate?from=${product.currency}&to=USD`);
        const data = await response.json();

        if (data.success && data.rate) {
          const adjustedRate = data.rate * feeMultiplier;
          setUsdcAmount((price * adjustedRate).toFixed(2));
          setExchangeRate(adjustedRate);
          setQuoteFetchedAt(Date.now());
          setQuoteStale(false);
        } else {
          setUsdcAmount(null);
          setExchangeRate(null);
        }
      } catch {
        setUsdcAmount(null);
        setExchangeRate(null);
      } finally {
        setLoadingQuote(false);
      }
    };

    const timeoutId = setTimeout(fetchUsdcQuote, 300);
    return () => clearTimeout(timeoutId);
  }, [amount, product.currency]);

  // Mark quote as stale after 2 minutes
  const QUOTE_STALE_MS = 120_000;
  useEffect(() => {
    if (!quoteFetchedAt || !usdcAmount) return;
    const remaining = QUOTE_STALE_MS - (Date.now() - quoteFetchedAt);
    if (remaining <= 0) { setQuoteStale(true); return; }
    const timer = setTimeout(() => setQuoteStale(true), remaining);
    return () => clearTimeout(timer);
  }, [quoteFetchedAt, usdcAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const price = parseFloat(amount);

    if (isNaN(price) || price <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (product.value_restrictions) {
      const min = product.value_restrictions.minVal || product.value_restrictions.min;
      const max = product.value_restrictions.maxVal || product.value_restrictions.max;
      if (min && price < min) {
        setError(`Minimum amount is ${product.currency} ${min}`);
        return;
      }
      if (max && price > max) {
        setError(`Maximum amount is ${product.currency} ${max}`);
        return;
      }
    }

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    if (insufficientBalance) {
      const shortfall = (parseFloat(usdcAmount!) - parseFloat(usdcBalance!)).toFixed(2);
      setError(`Insufficient ${networkConfig?.tokenSymbol} balance. You need ${usdcAmount} but have ${parseFloat(usdcBalance!).toFixed(2)} (short by ${shortfall} ${networkConfig?.tokenSymbol})`);
      return;
    }

    // If quote is stale, re-fetch before showing confirmation
    setQuoteRefreshed(false);
    if (quoteStale && product.currency !== 'USD') {
      setLoadingQuote(true);
      try {
        const response = await fetch(`/api/exchange-rate?from=${product.currency}&to=USD`);
        const data = await response.json();
        if (data.success && data.rate) {
          const feeMultiplier = 1 + (FX_FEE_PERCENT / 100);
          const adjustedRate = data.rate * feeMultiplier;
          setUsdcAmount((price * adjustedRate).toFixed(2));
          setExchangeRate(adjustedRate);
          setQuoteFetchedAt(Date.now());
          setQuoteStale(false);
          setQuoteRefreshed(true);
        }
      } catch { /* proceed with existing quote */ }
      setLoadingQuote(false);
    }

    // Check for recent duplicate purchase of same product/amount
    setDuplicateWarning(null);
    try {
      const recentPurchases: Array<{ productId: number; amount: string; time: number }> =
        JSON.parse(localStorage.getItem('recentPurchases') || '[]');
      const oneHourAgo = Date.now() - 3_600_000;
      const duplicate = recentPurchases.find(
        (p) => p.productId === product.product_id && p.amount === amount && p.time > oneHourAgo
      );
      if (duplicate) {
        setDuplicateWarning(
          `You purchased ${product.brand_name} (${product.currency} ${amount}) ${Math.round((Date.now() - duplicate.time) / 60_000)} minutes ago. Are you sure you want to buy again?`
        );
      }
    } catch { /* ignore localStorage errors */ }

    // M8: Require email verification before showing confirmation
    if (!isEmailVerified(email)) {
      const result = await requestOtp();
      if (result.status === 'error') {
        // Surface OTP send error on the form so the user sees what went wrong
        setError(result.message);
        return;
      }
      if (result.status === 'verified') {
        // Server says already verified — skip OTP step
        setStep('confirm');
        return;
      }
      setStep('verify-email');
      return;
    }

    // Show confirmation step
    setStep('confirm');
  };

  const handleConfirmPurchase = async () => {
    if (submittingRef.current) return;

    // Rate limit: enforce cooldown between purchase attempts
    const now = Date.now();
    const elapsed = now - lastAttemptRef.current;
    if (elapsed < PURCHASE_COOLDOWN_MS) {
      const remaining = Math.ceil((PURCHASE_COOLDOWN_MS - elapsed) / 1000);
      setError(`Please wait ${remaining} seconds before trying again.`);
      return;
    }
    lastAttemptRef.current = now;

    submittingRef.current = true;
    setError(null);
    setLoading(true);
    setStep('processing');
    setPaymentStep('Checking network...');

    // L6: Quick RPC health check before proceeding with payment
    try {
      const rpcUrl = networkConfig?.publicRpcUrl;
      if (rpcUrl) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const rpcResp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const rpcData = await rpcResp.json();
        if (!rpcData.result) {
          throw new Error('RPC returned no block number');
        }
      }
    } catch {
      setError(`${networkConfig?.name || 'Network'} RPC is not responding. Please try again in a moment or switch networks.`);
      setHasFailedOnce(true);
      setStep('confirm');
      setLoading(false);
      submittingRef.current = false;
      return;
    }

    setPaymentStep('Preparing payment...');

    try {
      const price = parseFloat(amount);

      // Save profile
      const profile = { email, firstName: firstName || undefined, lastName: lastName || undefined };
      if (typeof window !== 'undefined') {
        localStorage.setItem('userProfile', JSON.stringify(profile));
        setUserProfile(profile);
      }

      const requestBody = {
        productId: product.product_id,
        price,
        userId: email,
        userFirstName: firstName || 'Customer',
        userLastName: lastName || '',
        userEmail: email,
        brandName: product.brand_name,
        countryName: product.country_name,
        currency: product.currency,
      };

      let response: Response;
      let data: any;

      try {
        setPaymentStep(
          networkConfig?.paymentStrategy === 'eip3009'
            ? 'Awaiting wallet signature...'
            : 'Awaiting approval transaction...'
        );

        response = await payWithX402(
          '/api/purchase',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          },
          selectedNetwork,
          walletProvider,
        );

        setPaymentStep('Confirming on-chain...');
        data = await response.json();
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'Token redemption failed');
      }

      if (!data.success) {
        throw new Error(data.error || 'Redemption failed');
      }

      setPaymentStep('Ordering gift card...');

      // Record purchase for duplicate detection
      try {
        const recentPurchases: Array<{ productId: number; amount: string; time: number }> =
          JSON.parse(localStorage.getItem('recentPurchases') || '[]');
        recentPurchases.push({ productId: product.product_id, amount, time: Date.now() });
        // Keep only last 24h of purchases
        const oneDayAgo = Date.now() - 86_400_000;
        localStorage.setItem('recentPurchases', JSON.stringify(recentPurchases.filter((p) => p.time > oneDayAgo)));
      } catch { /* ignore */ }

      onPurchaseComplete(data.orderId, email, data.orderToken, data.x402Payment?.transactionHash);
    } catch (err) {
      console.error('Redemption error:', err);
      setError(err instanceof Error ? err.message : 'Redemption failed');
      setHasFailedOnce(true);
      setStep('confirm');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/40"
      onClick={step === 'processing' ? () => setShowCloseWarning(true) : onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Purchase ${product.brand_name}`}
        className="bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-700 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm sticky top-0">
          <div>
            <h3 className="text-2xl font-semibold text-slate-100">{product.brand_name}</h3>
            <p className="text-sm text-slate-400 mt-1">
              {product.country_name} * {product.currency}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-slate-100 transition-all backdrop-blur-sm"
          >
            ×
          </button>
        </div>

        {/* Product Image */}
        {product.product_image && (
          <img
            src={product.product_image}
            alt={product.brand_name}
            className="w-full h-48 object-cover"
          />
        )}

        {/* Email Verification Step (M8) */}
        {step === 'verify-email' && (
          <div className="p-6 space-y-4 bg-slate-800/30 backdrop-blur-sm">
            <h4 className="text-lg font-semibold text-slate-100 mb-1">Verify your email</h4>
            <p className="text-sm text-slate-400">
              We sent a 6-digit verification code to <strong className="text-slate-200">{email}</strong>.
              Enter it below to continue. Your voucher will be delivered to this address, so verifying it
              now protects you from typos.
            </p>

            <div>
              <label htmlFor="otp-code" className="block text-sm font-medium text-slate-300 mb-1">
                Verification code
              </label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full px-4 py-3 bg-slate-700/50 border-2 border-slate-600 rounded-xl text-slate-100 text-center font-mono text-2xl tracking-[0.5em] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                aria-label="6-digit verification code"
                autoFocus
              />
            </div>

            {otpError && (
              <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                {otpError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={submitOtp}
                disabled={otpVerifying || otpCode.length !== 6}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                {otpVerifying ? 'Verifying...' : 'Verify & Continue'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('form'); setOtpError(null); setOtpCode(''); }}
                disabled={otpVerifying}
                className="px-6 py-3 border-2 border-slate-600 rounded-xl bg-slate-700 text-slate-200 hover:bg-slate-600 hover:border-slate-500 font-semibold shadow-sm transition-all disabled:opacity-50"
              >
                Back
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
              <span>
                {otpSentAt ? `Code sent ${Math.floor((Date.now() - otpSentAt) / 1000)}s ago` : 'Code sent'}
              </span>
              <button
                type="button"
                onClick={async () => { await requestOtp(); }}
                disabled={otpSending || (otpSentAt !== null && Date.now() - otpSentAt < 60_000)}
                className="text-indigo-400 hover:text-indigo-300 disabled:opacity-50 underline"
              >
                {otpSending
                  ? 'Sending...'
                  : otpSentAt && Date.now() - otpSentAt < 60_000
                    ? `Resend in ${60 - Math.floor((Date.now() - otpSentAt) / 1000)}s`
                    : 'Resend code'}
              </button>
            </div>
          </div>
        )}

        {/* Confirmation Step */}
        {step === 'confirm' && (
          <div className="p-6 space-y-4 bg-slate-800/30 backdrop-blur-sm">
            <h4 className="text-lg font-semibold text-slate-100 mb-3">Confirm Purchase</h4>
            <div className="space-y-2 p-4 bg-slate-700/50 rounded-xl border border-slate-600">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Product</span>
                <span className="text-slate-100 font-medium">{product.brand_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Reward Value</span>
                <span className="text-slate-100 font-medium">{parseFloat(amount).toFixed(2)} {product.currency}</span>
              </div>
              {product.currency !== 'USD' && exchangeRate !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Exchange Rate</span>
                  <span className="text-slate-100 font-medium">1 {product.currency} = {exchangeRate.toFixed(4)} USD</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Service Fee</span>
                <span className="text-slate-100 font-medium">{FX_FEE_PERCENT}%</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-slate-600">
                <span className="text-slate-400">You Pay</span>
                <span className="text-indigo-300 font-bold">{usdcAmount} {networkConfig?.tokenSymbol}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Network</span>
                <span className="text-slate-100 font-medium">{networkConfig?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Email</span>
                <span className="text-slate-100 font-medium">{email}</span>
              </div>
              {address && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Wallet</span>
                  <span className="text-slate-100 font-mono text-xs">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </span>
                </div>
              )}
            </div>

            {/* Email confirmation warning for new/changed emails */}
            {email && email !== userProfile.email && (
              <div className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-0.5 flex-shrink-0">⚠</span>
                  <div>
                    <p className="font-medium mb-0.5">Please verify your email address</p>
                    <p className="text-xs text-yellow-400/80">
                      Your voucher will be sent to <strong className="text-yellow-200">{email}</strong>.
                      If this email is incorrect, your voucher may be lost and cannot be recovered.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {duplicateWarning && (
              <div className="bg-orange-500/15 border border-orange-500/30 text-orange-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <span className="text-orange-400 mt-0.5 flex-shrink-0">⚠</span>
                  <p className="text-xs text-orange-400/90">{duplicateWarning}</p>
                </div>
              </div>
            )}

            {quoteRefreshed && (
              <div className="bg-blue-500/20 border border-blue-500/30 text-blue-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                Quote updated — please review the new amount before confirming.
              </div>
            )}

            {error && (
              <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleConfirmPurchase}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-xl hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                {loading ? paymentStep || 'Processing...' : hasFailedOnce ? 'Retry Payment' : 'Confirm & Pay'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('form'); setError(null); }}
                disabled={loading}
                className="px-6 py-3 border-2 border-slate-600 rounded-xl bg-slate-700 text-slate-200 hover:bg-slate-600 hover:border-slate-500 font-semibold shadow-sm transition-all disabled:opacity-50"
              >
                Back
              </button>
            </div>

            {networkConfig?.paymentStrategy === 'eip3009' && (
              <p className="text-xs text-green-400/80 text-center">Gasless — you will only sign a message, no gas fees</p>
            )}
            {networkConfig?.paymentStrategy === 'direct' && (
              <p className="text-xs text-yellow-400/80 text-center">You will send an approval transaction (gas required)</p>
            )}
          </div>
        )}

        {/* Processing Step */}
        {step === 'processing' && (
          <div className="p-6 space-y-4 bg-slate-800/30 backdrop-blur-sm">
            <div className="text-center py-6">
              {/* Step-based progress indicator */}
              {(() => {
                const steps = [
                  { key: 'network', label: 'Network' },
                  { key: 'sign', label: 'Sign' },
                  { key: 'confirm', label: 'Confirm' },
                  { key: 'order', label: 'Order' },
                ];
                const currentIdx = paymentStep?.includes('network') || paymentStep?.includes('Checking')
                  ? 0
                  : paymentStep?.includes('signature') || paymentStep?.includes('Awaiting')
                    ? 1
                    : paymentStep?.includes('on-chain') || paymentStep?.includes('Confirming')
                      ? 2
                      : paymentStep?.includes('Ordering') || paymentStep?.includes('gift card')
                        ? 3
                        : 0;
                return (
                  <div className="flex items-center justify-center gap-1 mb-5 px-4">
                    {steps.map((s, i) => (
                      <div key={s.key} className="flex items-center gap-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                          i < currentIdx ? 'bg-green-500 text-white' :
                          i === currentIdx ? 'bg-indigo-500 text-white animate-pulse' :
                          'bg-slate-700 text-slate-500'
                        }`}>
                          {i < currentIdx ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            i + 1
                          )}
                        </div>
                        <span className={`text-[10px] font-medium ${
                          i <= currentIdx ? 'text-slate-200' : 'text-slate-500'
                        }`}>{s.label}</span>
                        {i < steps.length - 1 && (
                          <div className={`w-4 sm:w-6 h-0.5 ${i < currentIdx ? 'bg-green-500' : 'bg-slate-700'}`} />
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="relative inline-flex mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-700 border-t-indigo-500" />
              </div>
              <p className="text-lg font-semibold text-slate-100 mb-1">{paymentStep || 'Processing...'}</p>
              <p className="text-xs text-slate-400">Do not close this window</p>

              {showCloseWarning && (
                <div className="mt-4 p-3 bg-yellow-900/40 border border-yellow-700/50 rounded-xl text-sm">
                  <p className="text-yellow-300 font-medium mb-2">Are you sure you want to close?</p>
                  <p className="text-yellow-400/80 text-xs mb-3">Your payment may still be processing. You can check your order status in My Orders.</p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={onClose}
                      className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded-lg font-medium transition-colors"
                    >
                      Close Anyway
                    </button>
                    <button
                      onClick={() => setShowCloseWarning(false)}
                      className="px-4 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs rounded-lg font-medium transition-colors"
                    >
                      Keep Waiting
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Purchase Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-slate-800/30 backdrop-blur-sm" style={{ display: step === 'form' ? undefined : 'none' }}>
          {/* Network Selection */}
          <div>
            <label className="block text-sm font-bold text-slate-100 mb-2">
              Payment Network
            </label>
            <div className="flex gap-2">
              {Object.entries(NETWORKS).map(([key, net]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onNetworkChange(key)}
                  className={`flex-1 py-3 px-4 rounded-xl font-semibold text-center transition-all ${
                    selectedNetwork === key
                      ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg'
                      : 'bg-slate-700/50 text-slate-300 border border-slate-600 hover:border-indigo-500/50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    {key === 'ethereum' && (
                      <svg className="w-4 h-4" viewBox="0 0 320 512" fill="currentColor"><path d="M311.9 260.8L160 353.6 8 260.8 160 0l151.9 260.8zM160 383.4L8 290.6 160 512l152-221.4-152 92.8z"/></svg>
                    )}
                    {key === 'base' && (
                      <svg className="w-4 h-4" viewBox="0 0 111 111" fill="currentColor"><path d="M54.921 110.034c30.355 0 54.951-24.596 54.951-54.951C109.872 24.728 85.276.132 54.921.132 26.012.132 2.085 22.527.133 50.713h73.074v8.674H.134c1.952 28.186 25.879 50.647 54.787 50.647z"/></svg>
                    )}
                    {key === 'conflux' && (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M8 8h8l-4 8z"/></svg>
                    )}
                    <span className="text-sm">{net.tokenSymbol}</span>
                  </div>
                  <div className="text-[10px] opacity-70 mt-0.5">{net.name}</div>
                </button>
              ))}
            </div>
            {!isConnected && (
              <div className="mt-2">
                <p className="text-xs text-red-400 mb-2">
                  No wallet connected. Connect your wallet to redeem with tokens.
                </p>
                <button
                  type="button"
                  onClick={() => open()}
                  className="w-full py-2.5 px-4 rounded-xl font-semibold bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm hover:from-purple-600 hover:to-indigo-600 transition-all shadow-md"
                >
                  Connect Wallet
                </button>
              </div>
            )}
            {walletReady && (
              <p className="text-xs text-indigo-300 mt-2">
                Pay with {networkConfig?.tokenSymbol} on {networkConfig?.name}
                {networkConfig?.paymentStrategy === 'direct'
                  ? '. You\u2019ll approve a token transfer.'
                  : '. You\u2019ll sign a gasless authorization.'}
              </p>
            )}
            {walletReady && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-xl">
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-[10px]">$</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs text-slate-400">Available:</span>
                  {usdcBalance !== null && usdcBalance !== undefined ? (
                    <>
                      <span className="text-sm font-bold text-slate-100">
                        {parseFloat(usdcBalance).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-xs text-slate-400">{networkConfig?.tokenSymbol}</span>
                    </>
                  ) : (
                    <span className="inline-block w-16 h-4 bg-slate-600 rounded animate-pulse" />
                  )}
                </div>
                {onRefreshBalance && (
                  <button
                    type="button"
                    onClick={onRefreshBalance}
                    className="ml-auto p-1 text-slate-400 hover:text-indigo-400 transition-colors rounded"
                    title="Refresh balance"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
                {insufficientBalance && usdcBalance !== null && usdcBalance !== undefined && (
                  <span className={`${onRefreshBalance ? '' : 'ml-auto '}text-xs text-red-400 font-medium`}>Insufficient</span>
                )}
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-bold text-slate-100 mb-2">
              Amount ({product.currency})
              {amount && usdcAmount && (
                <span className="ml-2 text-indigo-400 font-normal">
                  = {usdcAmount} {networkConfig?.tokenSymbol} tokens
                </span>
              )}
              {loadingQuote && (
                <span className="ml-2 text-slate-400 font-normal">Calculating...</span>
              )}
            </label>
            {product.denominations && Array.isArray(product.denominations) && product.denominations.length > 0 ? (
              <select
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3 border-2 border-slate-600 rounded-xl bg-slate-700 text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-semibold shadow-sm"
                disabled={loading}
                required
              >
                <option value="">Select amount...</option>
                {product.denominations.map((denom: number) => (
                  <option key={denom} value={denom}>
                    {denom} {product.currency}
                  </option>
                ))}
              </select>
            ) : (
              <div>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`${product.value_restrictions?.minVal || product.value_restrictions?.min || 1} - ${product.value_restrictions?.maxVal || product.value_restrictions?.max || 1000}`}
                  className="w-full px-4 py-3 border-2 border-slate-600 rounded-xl bg-slate-700 text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-semibold shadow-sm"
                  required
                  disabled={loading}
                />
                {product.value_restrictions && (
                  <p className="text-xs text-slate-400 mt-1">
                    Range: {product.currency} {product.value_restrictions.minVal || product.value_restrictions.min} -{' '}
                    {product.value_restrictions.maxVal || product.value_restrictions.max}
                  </p>
                )}
              </div>
            )}

            {/* Token Calculation Breakdown */}
            {amount && usdcAmount && exchangeRate !== null && (
              <div className={`mt-3 p-3 rounded-xl text-xs space-y-1 ${quoteStale ? 'bg-yellow-900/30 border border-yellow-700/50' : 'bg-indigo-900/30 border border-indigo-700/50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-indigo-300">Token Calculation</span>
                  {quoteStale && (
                    <span className="text-yellow-400 text-[10px] font-medium">Quote expired — will refresh on submit</span>
                  )}
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Reward Value:</span>
                  <span className="font-mono">
                    {parseFloat(amount).toFixed(2)} {product.currency}
                  </span>
                </div>
                {product.currency !== 'USD' && (
                  <div className="flex justify-between text-slate-300">
                    <span>Exchange Rate:</span>
                    <span className="font-mono">
                      1 {product.currency} = {exchangeRate.toFixed(4)} USD
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-indigo-200 font-semibold pt-1 border-t border-indigo-700/50">
                  <span>Total {networkConfig?.tokenSymbol} Tokens:</span>
                  <span className="font-mono">
                    {usdcAmount} {networkConfig?.tokenSymbol}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-bold text-slate-100 mb-2">
              Email {userProfile.email && <span className="text-green-400">Saved</span>}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 border-2 border-slate-600 rounded-xl bg-slate-700 text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-semibold shadow-sm"
              required
              disabled={loading}
            />
            <p className="text-xs text-slate-400 mt-1">Voucher details will be sent to this email</p>
          </div>

          {/* Name (Optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-100 mb-2">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Optional"
                className="w-full px-4 py-3 border-2 border-slate-600 rounded-xl bg-slate-700 text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-semibold shadow-sm"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-100 mb-2">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Optional"
                className="w-full px-4 py-3 border-2 border-slate-600 rounded-xl bg-slate-700 text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-semibold shadow-sm"
                disabled={loading}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          {/* Disabled reason hint */}
          {(!walletReady || !email || !amount || !!insufficientBalance) && (
            <p className="text-xs text-slate-500 pt-1">
              {!walletReady ? 'Connect your wallet to continue' :
               !amount ? 'Select an amount' :
               !email ? 'Enter your email address' :
               insufficientBalance ? `Insufficient ${networkConfig?.tokenSymbol} balance` : ''}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={!email || !amount || !walletReady || !!insufficientBalance}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              Review & Redeem
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-3 border-2 border-slate-600 rounded-xl bg-slate-700 text-slate-200 hover:bg-slate-600 hover:border-slate-500 font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          {/* Info Box */}
          <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl backdrop-blur-sm">
            <p className="text-xs text-indigo-300">
              Redeem with the exact amount in digital {networkConfig?.tokenSymbol} tokens on{' '}
              {networkConfig?.name}. Your reward voucher will be delivered via email within a few
              minutes after confirmation.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
