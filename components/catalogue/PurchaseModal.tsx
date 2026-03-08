'use client';

import { useState, useEffect } from 'react';
import { BrandProduct } from '@/lib/types/catalogue';
import { payWithX402, setPrivyWalletProvider } from '@/lib/x402-client';
import { useWallets } from '@privy-io/react-auth';

interface PurchaseModalProps {
  product: BrandProduct;
  onClose: () => void;
  onPurchaseComplete: (orderId: string, userEmail: string, orderToken: string) => void;
}

interface UserProfile {
  email?: string;
  firstName?: string;
  lastName?: string;
}

export default function PurchaseModal({ product, onClose, onPurchaseComplete }: PurchaseModalProps) {
  const { wallets } = useWallets();
  const [amount, setAmount] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [usdcAmount, setUsdcAmount] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    // Load from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('userProfile');
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === 'privy');

  // Load saved profile on mount and check wallet availability
  useEffect(() => {
    if (userProfile.email) {
      setEmail(userProfile.email);
    }
    if (userProfile.firstName) {
      setFirstName(userProfile.firstName);
    }
    if (userProfile.lastName) {
      setLastName(userProfile.lastName);
    }

    // Set Privy wallet provider if available
    const setupWallet = async () => {
      if (embeddedWallet) {
        try {
          console.log('Setting up Privy embedded wallet...', {
            walletClientType: embeddedWallet.walletClientType,
            address: embeddedWallet.address,
            chainId: embeddedWallet.chainId
          });

          // Switch to Ethereum Mainnet if not already on it
          const targetChainId = 1; // Ethereum Mainnet
          if (embeddedWallet.chainId !== `eip155:${targetChainId}`) {
            console.log('Switching to Ethereum Mainnet...');
            try {
              await embeddedWallet.switchChain(targetChainId);
              console.log('Switched to Ethereum Mainnet');
            } catch (switchError) {
              console.warn('Failed to switch chain (may already be correct):', switchError);
            }
          }

          // Get the EIP-1193 provider from the embedded wallet
          const provider = await embeddedWallet.getEthereumProvider();

          // Log provider details for debugging
          console.log('Provider received from Privy:', {
            type: typeof provider,
            constructor: provider?.constructor?.name,
            hasRequest: typeof provider?.request === 'function',
            hasOn: typeof provider?.on === 'function',
            keys: provider ? Object.keys(provider) : []
          });

          // Verify the provider has the required EIP-1193 method
          if (provider && typeof provider.request === 'function') {
            console.log('Privy wallet provider ready:', {
              hasRequest: typeof provider.request === 'function',
              walletClientType: embeddedWallet.walletClientType,
              address: embeddedWallet.address
            });
            setPrivyWalletProvider(provider);
            setWalletAvailable(true);
          } else {
            console.error('Provider missing EIP-1193 request method:', provider);
            setWalletAvailable(false);
          }
        } catch (error) {
          console.error('Failed to get Privy wallet provider:', error);
          setWalletAvailable(false);
        }
      } else {
        // No Privy wallet available
        console.log('No embedded wallet found. Available wallets:', wallets.map(w => ({
          type: w.walletClientType,
          address: w.address
        })));
        setWalletAvailable(false);
      }
    };

    setupWallet();
  }, [userProfile, embeddedWallet, wallets]);

  // Fetch USDC quote when amount changes
  // Includes 1.5% market volatility buffer since exchange rates are refreshed twice daily
  const FX_BUFFER_PERCENT = 1.5;

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

      // Apply 1.5% market volatility buffer (exchange rates refreshed twice daily)
      const bufferMultiplier = 1 + (FX_BUFFER_PERCENT / 100);

      // If currency is already USD, apply buffer for USDC conversion
      if (product.currency === 'USD') {
        const usdcWithBuffer = price * bufferMultiplier;
        setUsdcAmount(usdcWithBuffer.toFixed(2));
        setExchangeRate(1);
        return;
      }

      setLoadingQuote(true);
      try {
        const response = await fetch(`/api/exchange-rate?from=${product.currency}&to=USD`);
        const data = await response.json();

        if (data.success && data.rate) {
          // Apply exchange rate and then the FX buffer
          const usdValue = price * data.rate;
          const usdcWithBuffer = usdValue * bufferMultiplier;
          setUsdcAmount(usdcWithBuffer.toFixed(2));
          setExchangeRate(data.rate);
        } else {
          // Fallback: show amount as-is if exchange rate unavailable
          setUsdcAmount(null);
          setExchangeRate(null);
        }
      } catch (err) {
        console.error('Failed to fetch exchange rate:', err);
        setUsdcAmount(null);
        setExchangeRate(null);
      } finally {
        setLoadingQuote(false);
      }
    };

    // Debounce the quote fetch
    const timeoutId = setTimeout(fetchUsdcQuote, 300);
    return () => clearTimeout(timeoutId);
  }, [amount, product.currency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const price = parseFloat(amount);

      // Validate amount
      if (isNaN(price) || price <= 0) {
        setError('Please enter a valid amount');
        setLoading(false);
        return;
      }

      // Validate against restrictions
      if (product.value_restrictions) {
        const min = product.value_restrictions.minVal || product.value_restrictions.min;
        const max = product.value_restrictions.maxVal || product.value_restrictions.max;

        if (min && price < min) {
          setError(`Minimum amount is ${product.currency} ${min}`);
          setLoading(false);
          return;
        }
        if (max && price > max) {
          setError(`Maximum amount is ${product.currency} ${max}`);
          setLoading(false);
          return;
        }
      }

      // Validate email
      if (!email || !email.includes('@')) {
        setError('Please enter a valid email address');
        setLoading(false);
        return;
      }

      // Save profile to localStorage
      const profile = {
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('userProfile', JSON.stringify(profile));
        setUserProfile(profile);
      }

      // Make purchase
      const requestBody = {
        productId: product.product_id,
        price: price,
        userId: email,
        userFirstName: firstName || 'Customer',
        userLastName: lastName || '',
        userEmail: email,
        brandName: product.brand_name,
        countryName: product.country_name,
        currency: product.currency
      };

      let response: Response;
      let data: any;

      try {
        response = await payWithX402('/api/purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        data = await response.json();
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'Token redemption failed');
      }

      if (!data.success) {
        throw new Error(data.error || 'Redemption failed');
      }

      onPurchaseComplete(data.orderId, email, data.orderToken);

    } catch (err) {
      console.error('Redemption error:', err);
      setError(err instanceof Error ? err.message : 'Redemption failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-700 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset'
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
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-slate-100 transition-all backdrop-blur-sm"
          >
            x
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

        {/* Purchase Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-slate-800/30 backdrop-blur-sm">
          {/* Redemption Method */}
          <div>
            <label className="block text-sm font-bold text-slate-100 mb-2">
              Redemption Method
            </label>
            <div className="flex gap-2">
              <div
                className="flex-1 py-3 px-4 rounded-xl font-semibold bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg text-center"
              >
                Digital USDC Tokens
              </div>
            </div>
            {!walletAvailable && (
              <p className="text-xs text-red-400 mt-2">
                No wallet connected. Please sign in with Privy to redeem with tokens.
              </p>
            )}
            {walletAvailable && (
              <p className="text-xs text-indigo-300 mt-2">
                Redeem with digital USDC tokens on Ethereum Mainnet. You&apos;ll be prompted to sign with your wallet.
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-bold text-slate-100 mb-2">
              Amount ({product.currency})
              {amount && usdcAmount && (
                <span className="ml-2 text-indigo-400 font-normal">
                  = {usdcAmount} USDC tokens
                </span>
              )}
              {loadingQuote && (
                <span className="ml-2 text-slate-400 font-normal">
                  Calculating...
                </span>
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
                    Range: {product.currency} {product.value_restrictions.minVal || product.value_restrictions.min} - {product.value_restrictions.maxVal || product.value_restrictions.max}
                  </p>
                )}
              </div>
            )}

            {/* Token Calculation Breakdown */}
            {amount && usdcAmount && exchangeRate !== null && (
              <div className="mt-3 p-3 bg-indigo-900/30 border border-indigo-700/50 rounded-xl text-xs space-y-1">
                <div className="font-semibold text-indigo-300 mb-2">Token Calculation</div>
                <div className="flex justify-between text-slate-300">
                  <span>Reward Value:</span>
                  <span className="font-mono">{parseFloat(amount).toFixed(2)} {product.currency}</span>
                </div>
                {product.currency !== 'USD' && (
                  <div className="flex justify-between text-slate-300">
                    <span>Exchange Rate:</span>
                    <span className="font-mono">1 {product.currency} = {exchangeRate.toFixed(4)} USD</span>
                  </div>
                )}
                {product.currency !== 'USD' && (
                  <div className="flex justify-between text-slate-300">
                    <span>USD Value:</span>
                    <span className="font-mono">{(parseFloat(amount) * exchangeRate).toFixed(2)} USD</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-300">
                  <span>Market Volatility Buffer ({FX_BUFFER_PERCENT}%):</span>
                  <span className="font-mono">+{((parseFloat(amount) * (exchangeRate || 1)) * (FX_BUFFER_PERCENT / 100)).toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-indigo-200 font-semibold pt-1 border-t border-indigo-700/50">
                  <span>Total USDC Tokens:</span>
                  <span className="font-mono">{usdcAmount} USDC</span>
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
            <p className="text-xs text-slate-400 mt-1">
              Voucher details will be sent to this email
            </p>
          </div>

          {/* Name (Optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-100 mb-2">
                First Name
              </label>
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
              <label className="block text-sm font-bold text-slate-100 mb-2">
                Last Name
              </label>
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
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !email || !amount || !walletAvailable}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              {loading ? 'Processing...' : 'Redeem with Tokens'}
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
              Redeem with the exact amount in digital USDC tokens. Your reward voucher will be delivered via email within a few minutes after confirmation.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
