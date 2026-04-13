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
  facilitatorHealthy?: boolean;
  facilitatorHealthReason?: string;
}

interface UserProfile {
  email?: string;
  firstName?: string;
  lastName?: string;
}

// M12: Common email domain typo detection
const COMMON_DOMAINS: Record<string, string> = {
  'gmal.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gmali.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com', 'gmail.cmo': 'gmail.com', 'gmai.com': 'gmail.com',
  'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'hotmil.com': 'hotmail.com', 'hotmaill.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com', 'outllook.com': 'outlook.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com', 'yhaoo.com': 'yahoo.com', 'yahho.com': 'yahoo.com',
  'icloud.co': 'icloud.com', 'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com',
  'protonmal.com': 'protonmail.com', 'protonmail.co': 'protonmail.com',
  'aol.co': 'aol.com', 'aol.con': 'aol.com',
};

function suggestEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return COMMON_DOMAINS[domain] || null;
}

/** Product image with React-based error handling */
function PurchaseImage({ src, alt }: { src?: string; alt: string }) {
  const [error, setError] = useState(false);
  if (!src || error) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="w-full h-48 object-contain bg-white p-4"
      onError={() => setError(true)}
    />
  );
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
  facilitatorHealthy = true,
  facilitatorHealthReason,
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
  const [rawExchangeRate, setRawExchangeRate] = useState<number | null>(null);
  const [quoteFetchedAt, setQuoteFetchedAt] = useState<number | null>(null);
  const [quoteStale, setQuoteStale] = useState(false);
  const [step, setStep] = useState<'form' | 'verify-email' | 'confirm' | 'processing' | 'success'>('form');
  const [paymentStep, setPaymentStep] = useState<string>('');
  const [hasFailedOnce, setHasFailedOnce] = useState(false);
  const [quoteRefreshed, setQuoteRefreshed] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [successData, setSuccessData] = useState<{ orderId: string; email: string; orderToken: string; txHash?: string } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [rpcFailedNetwork, setRpcFailedNetwork] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState<string>('');
  const [chainSwitching, setChainSwitching] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try { return localStorage.getItem('termsAccepted') === 'true'; } catch { /* ignore */ }
    }
    return false;
  });

  // Clear duplicate warning when amount changes (user editing invalidates the old warning)
  useEffect(() => { setDuplicateWarning(null); }, [amount]);

  // M8: Email OTP verification state
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null);
  // L10: Store verified emails with timestamps — re-verify after 30 days
  const VERIFIED_EMAIL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const [verifiedEmails, setVerifiedEmails] = useState<Map<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('verifiedEmails');
        if (!saved) return new Map();
        const parsed = JSON.parse(saved);
        // Migration: old format was string[] → convert to Record<string, number>
        if (Array.isArray(parsed)) {
          const map = new Map<string, number>();
          parsed.forEach((e: string) => map.set(e, Date.now()));
          localStorage.setItem('verifiedEmails', JSON.stringify(Object.fromEntries(map)));
          return map;
        }
        // New format: Record<email, timestamp>
        return new Map(Object.entries(parsed as Record<string, number>));
      } catch { return new Map(); }
    }
    return new Map();
  });

  // Tick every second while on OTP step to keep cooldown countdown live
  const [, setOtpTick] = useState(0);
  useEffect(() => {
    if (step !== 'verify-email' || !otpSentAt) return;
    const interval = setInterval(() => setOtpTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [step, otpSentAt]);

  const isEmailVerified = (e: string) => {
    const key = e.toLowerCase().trim();
    const verifiedAt = verifiedEmails.get(key);
    if (!verifiedAt) return false;
    // Re-verify if older than 30 days
    return (Date.now() - verifiedAt) < VERIFIED_EMAIL_MAX_AGE_MS;
  };

  const persistVerifiedEmail = useCallback((e: string) => {
    setVerifiedEmails((prev) => {
      const next = new Map(prev);
      next.set(e.toLowerCase().trim(), Date.now());
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('verifiedEmails', JSON.stringify(Object.fromEntries(next))); } catch { /* ignore */ }
      }
      return next;
    });
  }, []);

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

  const submitOtp = useCallback(async () => {
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
  }, [otpCode, email, persistVerifiedEmail]);

  // Auto-submit when 6 digits are entered for smoother UX
  const otpAutoSubmitRef = useRef(false);
  useEffect(() => {
    if (otpCode.length === 6 && /^\d{6}$/.test(otpCode) && !otpVerifying && !otpAutoSubmitRef.current) {
      otpAutoSubmitRef.current = true;
      submitOtp();
    }
    if (otpCode.length < 6) otpAutoSubmitRef.current = false;
  }, [otpCode, otpVerifying, submitOtp]);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('userProfile');
        return saved ? JSON.parse(saved) : {};
      } catch { return {}; }
    }
    return {};
  });

  const [refreshingBalance, setRefreshingBalance] = useState(false);
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
  const MIN_ORDER_USD = 1; // Minimum order value — orders below this cost more in facilitator gas than they generate
  const MAX_ORDER_USD = 5000; // M31: Maximum order value — limits exposure per transaction
  const networkConfig = NETWORKS[selectedNetwork];
  const walletReady = isConnected && !!walletProvider;

  // Check if balance is insufficient
  const insufficientBalance = usdcAmount && usdcBalance
    ? parseFloat(usdcBalance) < parseFloat(usdcAmount)
    : false;

  // Inline amount validation for variable-amount products
  const amountValidation = (() => {
    if (!amount || (product.denominations && Array.isArray(product.denominations) && product.denominations.length > 0)) return null;
    const price = parseFloat(amount);
    if (isNaN(price) || price <= 0) return null; // don't nag on empty/zero
    if (product.value_restrictions) {
      const min = product.value_restrictions.minVal || product.value_restrictions.min;
      const max = product.value_restrictions.maxVal || product.value_restrictions.max;
      if (min && price < min) return `Minimum is ${product.currency} ${min}`;
      if (max && price > max) return `Maximum is ${product.currency} ${max}`;
    }
    return null;
  })();

  // Load saved profile on mount
  useEffect(() => {
    if (userProfile.email) setEmail(userProfile.email);
    if (userProfile.firstName) setFirstName(userProfile.firstName);
    if (userProfile.lastName) setLastName(userProfile.lastName);
  }, [userProfile]);

  // Switch chain when network changes (await to prevent race condition)
  useEffect(() => {
    if (!walletReady || !networkConfig) return;
    const targetChainId = networkConfig.chainId;
    if (chainId !== targetChainId) {
      setChainSwitching(true);
      switchChain({ chainId: targetChainId }, {
        onSettled: () => setChainSwitching(false),
      });
    } else {
      setChainSwitching(false);
    }
  }, [selectedNetwork, walletReady, chainId, networkConfig, switchChain]);

  // Fetch USDC quote when amount changes
  const FX_FEE_PERCENT = product.currency === 'USD' ? 0.5 : 1.5;

  // M18: Auto-refresh quote when user switches payment network (if quote > 60s old)
  const prevNetworkRef = useRef(selectedNetwork);
  useEffect(() => {
    if (prevNetworkRef.current === selectedNetwork) return;
    prevNetworkRef.current = selectedNetwork;
    if (!amount || product.currency === 'USD') return;
    // Refresh if quote is older than 60 seconds or already stale
    const quoteAge = quoteFetchedAt ? Date.now() - quoteFetchedAt : Infinity;
    if (quoteAge < 60_000) return;
    const price = parseFloat(amount);
    if (isNaN(price) || price <= 0) return;
    const refreshQuote = async () => {
      setLoadingQuote(true);
      try {
        const response = await fetch(`/api/exchange-rate?from=${product.currency}&to=USD`);
        const data = await response.json();
        if (data.success && data.rate) {
          const feeMultiplier = 1 + (FX_FEE_PERCENT / 100);
          const adjustedRate = data.rate * feeMultiplier;
          setUsdcAmount((Math.ceil(price * adjustedRate * 100) / 100).toFixed(2));
          setRawExchangeRate(data.rate);
          setExchangeRate(adjustedRate);
          setQuoteFetchedAt(Date.now());
          setQuoteStale(false);
        }
      } catch { /* quote will refresh on submit as fallback */ }
      setLoadingQuote(false);
    };
    refreshQuote();
  }, [selectedNetwork, amount, product.currency, quoteFetchedAt]);

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

      // Use Math.ceil to round up to next cent — protects merchant from underpayment
      const ceilCents = (v: number) => (Math.ceil(v * 100) / 100).toFixed(2);

      if (product.currency === 'USD') {
        setUsdcAmount(ceilCents(price * feeMultiplier));
        setRawExchangeRate(1);
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
          setUsdcAmount(ceilCents(price * adjustedRate));
          setRawExchangeRate(data.rate);
          setExchangeRate(adjustedRate);
          setQuoteFetchedAt(Date.now());
          setQuoteStale(false);
        } else {
          setUsdcAmount(null);
          setRawExchangeRate(null);
          setExchangeRate(null);
        }
      } catch {
        setUsdcAmount(null);
        setRawExchangeRate(null);
        setExchangeRate(null);
      } finally {
        setLoadingQuote(false);
      }
    };

    const timeoutId = setTimeout(fetchUsdcQuote, 300);
    return () => clearTimeout(timeoutId);
  }, [amount, product.currency]);

  // Mark quote as stale after 2 minutes, with live countdown
  // Pause staleness timer during OTP verification to avoid quote expiring mid-verification
  const QUOTE_STALE_MS = 120_000;
  const [quoteCountdown, setQuoteCountdown] = useState<number | null>(null);
  const [quotePausedAt, setQuotePausedAt] = useState<number | null>(null);
  // Pause/resume quote timer when entering/leaving verify-email step
  useEffect(() => {
    if (step === 'verify-email' && quoteFetchedAt && !quotePausedAt) {
      setQuotePausedAt(Date.now());
    } else if (step !== 'verify-email' && quotePausedAt && quoteFetchedAt) {
      // Extend quoteFetchedAt by the time spent on OTP step
      const pauseDuration = Date.now() - quotePausedAt;
      setQuoteFetchedAt((prev) => prev ? prev + pauseDuration : prev);
      setQuotePausedAt(null);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!quoteFetchedAt || !usdcAmount) { setQuoteCountdown(null); return; }
    // Don't count down while paused on OTP step
    if (quotePausedAt) return;
    const tick = () => {
      const remaining = QUOTE_STALE_MS - (Date.now() - quoteFetchedAt);
      if (remaining <= 0) { setQuoteStale(true); setQuoteCountdown(0); return; }
      setQuoteCountdown(Math.ceil(remaining / 1000));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [quoteFetchedAt, usdcAmount, quotePausedAt]);

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

    // Minimum order value guard — small orders cost more in facilitator gas than they generate
    if (usdcAmount && parseFloat(usdcAmount) < MIN_ORDER_USD) {
      setError(`Minimum order is $${MIN_ORDER_USD} USD equivalent. Your current total is $${usdcAmount}.`);
      return;
    }

    // M31: Maximum order value guard — limits exposure per transaction
    // Use usdcAmount (USD equivalent) for non-USD currencies to enforce the USD cap accurately
    const orderUsdEquivalent = usdcAmount ? parseFloat(usdcAmount) : parseFloat(amount);
    if (!isNaN(orderUsdEquivalent) && orderUsdEquivalent > MAX_ORDER_USD) {
      setError(`Maximum order value is $${MAX_ORDER_USD.toLocaleString()} USD per transaction. Your order is ~$${orderUsdEquivalent.toFixed(0)} USD equivalent. Please reduce the amount or split into multiple orders.`);
      return;
    }

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    // Require email confirmation for unverified emails to prevent typo-driven voucher loss
    if (!isEmailVerified(email) && confirmEmail.toLowerCase().trim() !== email.toLowerCase().trim()) {
      setError('Email addresses do not match. Please confirm your email to protect your voucher delivery.');
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
          setUsdcAmount((Math.ceil(price * adjustedRate * 100) / 100).toFixed(2));
          setRawExchangeRate(data.rate);
          setExchangeRate(adjustedRate);
          setQuoteFetchedAt(Date.now());
          setQuoteStale(false);
          setQuoteRefreshed(true);
        }
      } catch {
        // Quote refresh failed — warn user they're proceeding with a stale rate
        setError('Exchange rate could not be refreshed. Proceeding with the previous quote — the final amount may differ slightly.');
      }
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

    // Guard: ensure wallet is still connected before attempting payment
    if (!isConnected || !walletProvider) {
      setError('Wallet disconnected. Please reconnect your wallet and try again.');
      setHasFailedOnce(true);
      setStep('form');
      return;
    }

    // Rate limit: enforce cooldown between purchase attempts
    const now = Date.now();
    const elapsed = now - lastAttemptRef.current;
    if (elapsed < PURCHASE_COOLDOWN_MS) {
      const remaining = Math.ceil((PURCHASE_COOLDOWN_MS - elapsed) / 1000);
      setError(`Please wait ${remaining} seconds before trying again.`);
      return;
    }
    lastAttemptRef.current = now;

    // Re-check balance before proceeding — balance may have changed since form step
    if (usdcAmount && usdcBalance && parseFloat(usdcBalance) < parseFloat(usdcAmount)) {
      const shortfall = (parseFloat(usdcAmount) - parseFloat(usdcBalance)).toFixed(2);
      setError(`Insufficient ${networkConfig?.tokenSymbol} balance. You need ${usdcAmount} but have ${parseFloat(usdcBalance).toFixed(2)} (short by ${shortfall} ${networkConfig?.tokenSymbol}). Please top up your wallet or switch networks.`);
      setHasFailedOnce(true);
      return;
    }

    // Auto-refresh stale quote before payment — prevents paying with outdated exchange rate
    if (quoteStale && product.currency !== 'USD') {
      try {
        const response = await fetch(`/api/exchange-rate?from=${product.currency}&to=USD`);
        const data = await response.json();
        if (data.success && data.rate) {
          const price = parseFloat(amount);
          const feeMultiplier = 1 + (FX_FEE_PERCENT / 100);
          const adjustedRate = data.rate * feeMultiplier;
          const newUsdcAmount = (Math.ceil(price * adjustedRate * 100) / 100).toFixed(2);
          setUsdcAmount(newUsdcAmount);
          setRawExchangeRate(data.rate);
          setExchangeRate(adjustedRate);
          setQuoteFetchedAt(Date.now());
          setQuoteStale(false);
          setQuoteRefreshed(true);
          // Re-validate balance with fresh amount
          if (usdcBalance && parseFloat(usdcBalance) < parseFloat(newUsdcAmount)) {
            const shortfall = (parseFloat(newUsdcAmount) - parseFloat(usdcBalance)).toFixed(2);
            setError(`Rate updated — insufficient ${networkConfig?.tokenSymbol} balance. You need ${newUsdcAmount} but have ${parseFloat(usdcBalance).toFixed(2)} (short by ${shortfall} ${networkConfig?.tokenSymbol}).`);
            setHasFailedOnce(true);
            return;
          }
          setError(null);
          // Show updated quote and let user review before proceeding
          setError('Exchange rate was refreshed before payment. Please review the updated amount and confirm again.');
          return;
        }
      } catch {
        setError('Exchange rate could not be refreshed. Please go back and try again.');
        return;
      }
    }

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
      const otherNetworks = Object.entries(NETWORKS).filter(([k]) => k !== selectedNetwork);
      setError(
        `${networkConfig?.name || 'Network'} RPC is not responding. Please try again in a moment or switch to another network.`
      );
      setRpcFailedNetwork(selectedNetwork);
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
        try { localStorage.setItem('userProfile', JSON.stringify(profile)); } catch { /* ignore */ }
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
        // Bubble up specific wallet/network errors from x402-client instead of wrapping generically
        const msg = err instanceof Error ? err.message : 'Token redemption failed';
        // Detect user-rejected signature (common wallet error patterns)
        if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('user denied') || msg.includes('ACTION_REJECTED')) {
          throw new Error('Transaction was rejected in your wallet. You can try again when ready.');
        }
        throw new Error(msg);
      }

      if (!data.success) {
        // M14: Rate changed — go back to form to force fresh quote
        if (data.code === 'RATE_CHANGED') {
          setError(data.error || 'Exchange rate changed significantly. Please review the updated quote.');
          setQuoteStale(true);
          setHasFailedOnce(true);
          setStep('form');
          setLoading(false);
          submittingRef.current = false;
          return;
        }
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

      // M25: Show brief success interstitial before transitioning to order status
      setSuccessData({ orderId: data.orderId, email, orderToken: data.orderToken, txHash: data.x402Payment?.transactionHash });
      setStep('success');
      setTimeout(() => {
        onPurchaseComplete(data.orderId, email, data.orderToken, data.x402Payment?.transactionHash);
      }, 2500);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('Redemption error:', err);
      setError(err instanceof Error ? err.message : 'Redemption failed');
      setHasFailedOnce(true);
      setShowCloseWarning(false);
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
              {product.country_name} · {product.currency}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-slate-100 transition-all backdrop-blur-sm"
          >
            ×
          </button>
        </div>

        {/* Product Image */}
        <PurchaseImage src={product.product_image ?? undefined} alt={product.brand_name} />

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
                onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full px-4 py-3 bg-slate-700/50 border-2 border-slate-600 rounded-xl text-slate-100 text-center font-mono text-2xl tracking-[0.5em] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                aria-label="6-digit verification code"
                autoFocus
              />
            </div>

            {otpError && (
              <div role="alert" className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
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
                onClick={() => { setStep('form'); setOtpError(null); setOtpCode(''); setConfirmEmail(''); }}
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
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-slate-100">Confirm Purchase</h4>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                networkConfig?.paymentStrategy === 'eip3009'
                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
              }`}>
                {networkConfig?.paymentStrategy === 'eip3009' ? 'Gasless' : 'Gas Required'}
              </span>
            </div>
            <div className="space-y-2 p-4 bg-slate-700/50 rounded-xl border border-slate-600">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Product</span>
                <span className="text-slate-100 font-medium">{product.brand_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Reward Value</span>
                <span className="text-slate-100 font-medium">{parseFloat(amount).toFixed(2)} {product.currency}</span>
              </div>
              {product.currency !== 'USD' && rawExchangeRate !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Exchange Rate</span>
                  <span className="text-slate-100 font-medium">1 {product.currency} = {rawExchangeRate.toFixed(4)} USD</span>
                </div>
              )}
              {product.currency === 'USD' && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Exchange Rate</span>
                  <span className="text-slate-100 font-medium">1 USD = 1 {networkConfig?.tokenSymbol}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Service Fee</span>
                <span className="text-slate-100 font-medium">{FX_FEE_PERCENT}%{product.currency === 'USD' ? '' : ` (${((parseFloat(amount) * (rawExchangeRate || 1)) * (FX_FEE_PERCENT / 100)).toFixed(2)} USD)`}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-slate-600">
                <span className="text-slate-400">You Pay</span>
                <span className="text-indigo-300 font-bold">
                  {usdcAmount ? parseFloat(usdcAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : usdcAmount} {networkConfig?.tokenSymbol}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Network</span>
                <span className="text-slate-100 font-medium inline-flex items-center gap-1.5">
                  {selectedNetwork === 'ethereum' && (
                    <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 320 512" fill="currentColor"><path d="M311.9 260.8L160 353.6 8 260.8 160 0l151.9 260.8zM160 383.4L8 290.6 160 512l152-221.4-152 92.8z"/></svg>
                  )}
                  {selectedNetwork === 'conflux' && (
                    <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M8 8h8l-4 8z"/></svg>
                  )}
                  {networkConfig?.name}
                </span>
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

            {!facilitatorHealthy && (
              <div className="bg-red-500/15 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 flex-shrink-0">⚠</span>
                  <div>
                    <p className="text-xs text-red-400/90 mb-2">
                      {facilitatorHealthReason === 'rpc_unreachable'
                        ? `${networkConfig?.name} network RPC is unreachable. Transactions cannot be settled on this network right now.`
                        : `${networkConfig?.name} settlement is temporarily unavailable due to low facilitator gas.`}
                      {' '}Please switch to another network to continue your purchase.
                    </p>
                    <div className="flex gap-2">
                      {Object.entries(NETWORKS).filter(([k]) => k !== selectedNetwork).map(([key, net]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => { onNetworkChange(key); }}
                          className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-semibold rounded-lg transition-colors border border-red-500/30"
                        >
                          Switch to {net.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Smart network suggestion — Ethereum gas costs are high, suggest cheaper networks for small orders */}
            {selectedNetwork === 'ethereum' && usdcAmount && parseFloat(usdcAmount) < 50 && facilitatorHealthy && (
              <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 flex-shrink-0">i</span>
                  <div>
                    <p className="text-xs text-blue-400/90 mb-2">
                      For orders under $50, Conflux eSpace offers faster settlement at lower cost.
                    </p>
                    <div className="flex gap-2">
                      {Object.entries(NETWORKS).filter(([k]) => k !== 'ethereum').map(([key, net]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => { onNetworkChange(key); }}
                          className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 text-xs font-semibold rounded-lg transition-colors border border-blue-500/30"
                        >
                          Switch to {net.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quote freshness indicator on confirm step */}
            {product.currency !== 'USD' && quoteCountdown !== null && !quoteStale && quoteCountdown <= 30 && (
              <div className="bg-slate-700/50 border border-slate-600 text-slate-300 px-4 py-2 rounded-xl text-xs backdrop-blur-sm flex items-center justify-between">
                <span>Quote expires in</span>
                <span className="font-mono font-semibold text-amber-300">
                  {Math.floor(quoteCountdown / 60)}:{String(quoteCountdown % 60).padStart(2, '0')}
                </span>
              </div>
            )}
            {product.currency !== 'USD' && quoteStale && (
              <div className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 px-4 py-2 rounded-xl text-xs backdrop-blur-sm">
                Quote expired — the rate will be refreshed when you confirm.
              </div>
            )}

            {quoteRefreshed && (
              <div className="bg-blue-500/20 border border-blue-500/30 text-blue-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                Quote updated — please review the new amount before confirming.
              </div>
            )}

            {error && (
              <div role="alert" className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                {error}
                {rpcFailedNetwork === selectedNetwork && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-red-500/20">
                    {Object.entries(NETWORKS).filter(([k]) => k !== selectedNetwork).map(([key, net]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { onNetworkChange(key); setError(null); setRpcFailedNetwork(null); }}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition-colors border border-slate-600"
                      >
                        Switch to {net.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* First-purchase terms acknowledgment — only shown until user accepts once */}
            {!termsAccepted && (
              <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-slate-700/30 rounded-xl border border-slate-600 hover:border-slate-500 transition-colors">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked);
                    if (e.target.checked && typeof window !== 'undefined') {
                      try { localStorage.setItem('termsAccepted', 'true'); } catch { /* ignore */ }
                    }
                  }}
                  className="w-4 h-4 mt-0.5 text-indigo-600 border-slate-500 rounded focus:ring-indigo-500 bg-slate-700 flex-shrink-0"
                />
                <span className="text-xs text-slate-300 leading-relaxed">
                  I understand that gift card purchases are <strong className="text-slate-200">final and non-refundable</strong> once the voucher has been issued. The voucher will be delivered to the email address provided.
                </span>
              </label>
            )}

            {/* Sticky action buttons — always visible on mobile even when warnings push content */}
            <div className="sticky bottom-0 bg-slate-800/95 backdrop-blur-sm pt-3 -mx-6 px-6 pb-1 sm:static sm:bg-transparent sm:backdrop-blur-none sm:pt-2 sm:mx-0 sm:px-0 sm:pb-0">
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmPurchase}
                  disabled={loading || chainSwitching || !termsAccepted || !facilitatorHealthy}
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-xl hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  {!facilitatorHealthy ? 'Switch network to continue' : chainSwitching ? 'Switching network...' : loading ? paymentStep || 'Processing...' : hasFailedOnce ? 'Retry Payment' : 'Confirm & Pay'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('form'); setError(null); setQuoteRefreshed(false); setRpcFailedNetwork(null); setDuplicateWarning(null); }}
                  disabled={loading}
                  className="px-6 py-3 border-2 border-slate-600 rounded-xl bg-slate-700 text-slate-200 hover:bg-slate-600 hover:border-slate-500 font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  Back
                </button>
              </div>

              <div className="text-xs text-slate-400/80 text-center space-y-1 mt-2">
                <p>
                  {networkConfig?.paymentStrategy === 'eip3009'
                    ? `You will sign a gasless ${networkConfig?.tokenSymbol} authorization — no gas fees`
                    : `You will send an approval transaction on ${networkConfig?.name} (gas required)`
                  }
                </p>
                <p className="text-slate-500">
                  Vouchers are typically delivered to your email within 2–5 minutes after payment confirms.
                </p>
              </div>
            </div>
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
              {/* M22: Screen reader live region for payment progress */}
              <div role="status" aria-live="assertive" className="sr-only">
                {paymentStep || 'Processing payment'}
              </div>
              <p className="text-xs text-slate-400">Please keep this window open — you can track your order in My Orders if needed</p>

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

        {/* M25: Success Interstitial */}
        {step === 'success' && successData && (
          <div className="p-6 space-y-4 bg-slate-800/30 backdrop-blur-sm">
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500/40 mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-slate-100 mb-1">Payment Successful</h4>
              <p className="text-sm text-slate-400 mb-4">Your voucher is being prepared</p>
              <div className="space-y-1.5 text-sm text-left max-w-xs mx-auto bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Order</span>
                  <span className="text-slate-200 font-mono text-xs">{successData.orderId.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Voucher to</span>
                  <span className="text-slate-200 text-xs">{successData.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount</span>
                  <span className="text-slate-200">{parseFloat(amount).toFixed(2)} {product.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Paid</span>
                  <span className="text-slate-200">{usdcAmount} {networkConfig?.tokenSymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Network</span>
                  <span className="text-slate-200">{networkConfig?.name}</span>
                </div>
                {successData.txHash && networkConfig?.explorerUrl && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Transaction</span>
                    <a
                      href={`${networkConfig.explorerUrl}/tx/${successData.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 text-xs font-mono transition-colors"
                    >
                      {successData.txHash.slice(0, 10)}...
                    </a>
                  </div>
                )}
              </div>
              <div role="status" aria-live="polite" className="sr-only">Payment successful. Your voucher is being prepared.</div>
              <p className="text-xs text-slate-500 mt-4">Opening order status...</p>
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
                  disabled={step !== 'form'}
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
                {selectedNetwork === 'ethereum' && ' Ethereum has the highest settlement security.'}
                {selectedNetwork === 'conflux' && ' Conflux eSpace offers fast confirmations with minimal fees.'}
              </p>
            )}
            {walletReady && (
              <>
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
                      onClick={async () => {
                        if (refreshingBalance) return;
                        setRefreshingBalance(true);
                        try { await onRefreshBalance(); } catch {}
                        setTimeout(() => setRefreshingBalance(false), 1500);
                      }}
                      disabled={refreshingBalance}
                      className="ml-auto p-1 text-slate-400 hover:text-indigo-400 transition-colors rounded disabled:opacity-50"
                      title="Refresh balance"
                    >
                      <svg className={`w-3.5 h-3.5${refreshingBalance ? ' animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                  {insufficientBalance && usdcBalance !== null && usdcBalance !== undefined && (
                    <span className={`${onRefreshBalance ? '' : 'ml-auto '}text-xs text-red-400 font-medium`}>Insufficient</span>
                  )}
                </div>
                {/* Zero balance funding guidance */}
                {usdcBalance !== null && usdcBalance !== undefined && parseFloat(usdcBalance) === 0 && (
                  <div className="mt-2 p-2.5 bg-amber-900/20 border border-amber-700/30 rounded-lg">
                    <p className="text-[11px] text-amber-300/90 leading-relaxed">
                      Your {networkConfig?.tokenSymbol} balance is empty. Send {networkConfig?.tokenSymbol} to your wallet address to fund it, or switch to a network where you have tokens.
                    </p>
                  </div>
                )}
              </>
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
                {product.denominations.map((denom: number) => {
                  // Show estimated token cost for non-USD denominations when exchange rate is known
                  const tokenHint = product.currency !== 'USD' && rawExchangeRate
                    ? ` ≈ ${(Math.ceil(denom * rawExchangeRate * (1 + FX_FEE_PERCENT / 100) * 100) / 100).toFixed(2)} ${networkConfig?.tokenSymbol}`
                    : product.currency === 'USD'
                      ? ` ≈ ${(Math.ceil(denom * (1 + FX_FEE_PERCENT / 100) * 100) / 100).toFixed(2)} ${networkConfig?.tokenSymbol}`
                      : '';
                  return (
                    <option key={denom} value={denom}>
                      {denom} {product.currency}{tokenHint}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div>
                <input
                  type="number"
                  step="0.01"
                  min={product.value_restrictions?.minVal || product.value_restrictions?.min || 1}
                  max={product.value_restrictions?.maxVal || product.value_restrictions?.max || 10000}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => {
                    const val = parseFloat(amount);
                    if (!isNaN(val) && val > 0) {
                      setAmount(val.toFixed(2));
                    }
                  }}
                  placeholder={`${product.value_restrictions?.minVal || product.value_restrictions?.min || 1} - ${product.value_restrictions?.maxVal || product.value_restrictions?.max || 1000}`}
                  className="w-full px-4 py-3 border-2 border-slate-600 rounded-xl bg-slate-700 text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-semibold shadow-sm"
                  required
                  disabled={loading}
                />
                {product.value_restrictions && (
                  <p className={`text-xs mt-1 ${amountValidation ? 'text-red-400' : 'text-slate-400'}`}>
                    {amountValidation || `Range: ${product.currency} ${product.value_restrictions.minVal || product.value_restrictions.min} – ${product.value_restrictions.maxVal || product.value_restrictions.max}`}
                  </p>
                )}
              </div>
            )}

            {/* Token Calculation Breakdown */}
            {amount && usdcAmount && exchangeRate !== null && (
              <div className={`mt-3 p-3 rounded-xl text-xs space-y-1 ${quoteStale ? 'bg-yellow-900/30 border border-yellow-700/50' : 'bg-indigo-900/30 border border-indigo-700/50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-indigo-300">Token Calculation</span>
                  {quoteStale ? (
                    <span className="text-yellow-400 text-[10px] font-medium">Quote expired — will refresh on submit</span>
                  ) : quoteCountdown !== null && quoteCountdown <= 30 ? (
                    <span className="text-slate-400 text-[10px] font-medium">
                      Expires in {Math.floor(quoteCountdown / 60)}:{String(quoteCountdown % 60).padStart(2, '0')}
                    </span>
                  ) : null}
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Reward Value:</span>
                  <span className="font-mono">
                    {parseFloat(amount).toFixed(2)} {product.currency}
                  </span>
                </div>
                {product.currency !== 'USD' && rawExchangeRate !== null && (
                  <div className="flex justify-between text-slate-300">
                    <span>Exchange Rate:</span>
                    <span className="font-mono">
                      1 {product.currency} = {rawExchangeRate.toFixed(4)} USD
                    </span>
                  </div>
                )}
                {product.currency !== 'USD' && rawExchangeRate !== null && (
                  <div className="flex justify-between text-slate-300">
                    <span>USD Value:</span>
                    <span className="font-mono">
                      {(parseFloat(amount) * rawExchangeRate).toFixed(2)} USD
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-slate-300">
                  <span>Service Fee ({FX_FEE_PERCENT}%):</span>
                  <span className="font-mono">
                    +{((parseFloat(amount) * (rawExchangeRate || 1)) * (FX_FEE_PERCENT / 100)).toFixed(2)} USD
                  </span>
                </div>
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
              Email {isEmailVerified(email) ? (
                <span className="text-green-400 text-xs font-medium inline-flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  Verified
                </span>
              ) : userProfile.email ? <span className="text-slate-500 text-xs">Saved</span> : null}
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
            {/* M12: Email domain typo suggestion */}
            {email && suggestEmailDomain(email) && (
              <button
                type="button"
                onClick={() => {
                  const suggested = suggestEmailDomain(email)!;
                  setEmail(email.slice(0, email.lastIndexOf('@') + 1) + suggested);
                  setConfirmEmail('');
                }}
                className="mt-1 text-xs text-amber-300 hover:text-amber-200 transition-colors"
                aria-label={`Fix email domain to ${suggestEmailDomain(email)}`}
              >
                Did you mean <strong>{email.slice(0, email.lastIndexOf('@') + 1)}{suggestEmailDomain(email)}</strong>?
              </button>
            )}
            {/* Confirm email for unverified addresses — prevents typo-driven voucher loss */}
            {email && email.includes('@') && !isEmailVerified(email) && (
              <div className="mt-2">
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder="Confirm email address"
                  className={`w-full px-4 py-3 border-2 rounded-xl bg-slate-700 text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold shadow-sm ${
                    confirmEmail && confirmEmail.toLowerCase().trim() !== email.toLowerCase().trim()
                      ? 'border-red-500/60 focus:border-red-500'
                      : confirmEmail && confirmEmail.toLowerCase().trim() === email.toLowerCase().trim()
                        ? 'border-green-500/60 focus:border-green-500'
                        : 'border-slate-600 focus:border-indigo-500'
                  }`}
                  required
                  disabled={loading}
                />
                {confirmEmail && confirmEmail.toLowerCase().trim() !== email.toLowerCase().trim() && (
                  <p className="text-xs text-red-400 mt-1">Emails do not match</p>
                )}
                {/* Email domain typo detection on confirm field — catches typos in both inputs */}
                {confirmEmail && suggestEmailDomain(confirmEmail) && (
                  <button
                    type="button"
                    onClick={() => {
                      const suggested = suggestEmailDomain(confirmEmail)!;
                      setConfirmEmail(confirmEmail.slice(0, confirmEmail.lastIndexOf('@') + 1) + suggested);
                    }}
                    className="mt-1 text-xs text-amber-300 hover:text-amber-200 transition-colors"
                    aria-label={`Fix confirm email domain to ${suggestEmailDomain(confirmEmail)}`}
                  >
                    Did you mean <strong>{confirmEmail.slice(0, confirmEmail.lastIndexOf('@') + 1)}{suggestEmailDomain(confirmEmail)}</strong>?
                  </button>
                )}
              </div>
            )}
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

          {/* Facilitator health warning on form step — lets user switch network before filling form */}
          {!facilitatorHealthy && walletReady && (
            <div className="bg-amber-500/15 border border-amber-500/30 text-amber-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
              <div className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
                <p className="text-xs text-amber-400/90">
                  {facilitatorHealthReason === 'rpc_unreachable'
                    ? `${networkConfig?.name} network RPC is unreachable. Consider switching to another network.`
                    : `${networkConfig?.name} settlement may be delayed due to low facilitator gas. Consider switching to another network for faster processing.`}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div role="alert" className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          {/* Disabled reason hint */}
          {(!walletReady || chainSwitching || !email || !amount || !!insufficientBalance || !!amountValidation) && (
            <p className="text-xs text-slate-500 pt-1">
              {!walletReady ? 'Connect your wallet to continue' :
               chainSwitching ? 'Switching network...' :
               !amount ? 'Select an amount' :
               amountValidation ? amountValidation :
               !email ? 'Enter your email address' :
               insufficientBalance ? `Insufficient ${networkConfig?.tokenSymbol} balance` :
               (usdcAmount && parseFloat(usdcAmount) < MIN_ORDER_USD) ? `Minimum order is $${MIN_ORDER_USD} USD` : ''}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={!email || !amount || !walletReady || chainSwitching || !!insufficientBalance || !!amountValidation}
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

          {/* How It Works — 3-step flow guide, collapsible on mobile */}
          <details className="mt-4 group" open>
            <summary className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl sm:rounded-b-none backdrop-blur-sm cursor-pointer list-none flex items-center justify-between">
              <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider">How it works</span>
              <svg className="w-3.5 h-3.5 text-indigo-400 transition-transform group-open:rotate-180 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </summary>
            <div className="p-3 pt-1 bg-indigo-500/10 border border-t-0 border-indigo-500/20 rounded-b-xl backdrop-blur-sm">
              <div className="flex items-start gap-3 text-xs text-indigo-300/80">
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/30 flex items-center justify-center text-[9px] font-bold text-indigo-300">1</div>
                  <div className="w-px h-3 bg-indigo-500/20" />
                </div>
                <p className="pt-0.5">Review your order and {networkConfig?.paymentStrategy === 'eip3009' ? 'sign a gasless authorization' : 'approve a token transfer'}</p>
              </div>
              <div className="flex items-start gap-3 text-xs text-indigo-300/80">
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/30 flex items-center justify-center text-[9px] font-bold text-indigo-300">2</div>
                  <div className="w-px h-3 bg-indigo-500/20" />
                </div>
                <p className="pt-0.5">{networkConfig?.tokenSymbol} tokens are transferred on {networkConfig?.name}</p>
              </div>
              <div className="flex items-start gap-3 text-xs text-indigo-300/80">
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/30 flex items-center justify-center text-[9px] font-bold text-indigo-300">3</div>
                </div>
                <p className="pt-0.5">Voucher delivered to your email within 2–5 minutes</p>
              </div>
            </div>
          </details>
        </form>
      </div>
    </div>
  );
}
