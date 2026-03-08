'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import { OslPayButton } from './OslPayButton';
import { CryptoNetworkModal } from './CryptoNetworkModal';
import { Wallet, CreditCard, Smartphone, Apple, Copy, Check, User, Clock, ChevronDown, Info } from 'lucide-react';
import { OSL_PAY_CONFIG } from '@/config/oslPay';
import { FIAT_CURRENCIES, getCurrencySymbol, getCurrencyLimits } from '@/config/fiatCurrencies';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { JPY, USD, EUR, GBP } from 'ccy-icons';
import { CryptoIcon, NetworkIcon } from '@/utils/cryptoIcons';
import { useToast } from '@/components/ui/use-toast';

// Currency icon mapping - only include currencies that have icons in ccy-icons
const CurrencyIconMap: Record<string, React.ComponentType<any>> = {
  JPY,
  USD,
  EUR,
  GBP,
};

interface OnRampFormProps {
  className?: string;
  showForm?: boolean;
  defaultAmount?: number;
  defaultCrypto?: string;
  defaultNetwork?: string;
  defaultFiatCurrency?: string;
  defaultPayWayCode?: string;
  defaultEmail?: string;
  defaultAddress?: string;
  onFormSubmit?: (data: OnRampFormData) => void;
}

export interface OnRampFormData {
  amount: number;
  crypto: string;
  network: string;
  fiatCurrency: string;
  payWayCode?: string;
  email?: string;
  address?: string;
  merchantUser?: string;
}

export function OnRampForm({
  className = '',
  showForm = true,
  defaultAmount = OSL_PAY_CONFIG.amountLimits.default,
  defaultCrypto = 'USDT',
  defaultNetwork = 'ERC20',
  defaultFiatCurrency = 'USD',
  defaultPayWayCode,
  defaultEmail = '',
  defaultAddress = '',
  onFormSubmit
}: OnRampFormProps) {
  const { ready: privyReady, user, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();

  // Get Privy embedded wallet (not external wallets like MetaMask)
  const embeddedWallet = useMemo(() => {
    return wallets.find(wallet => wallet.walletClientType === 'privy') || wallets.find(wallet => wallet.connectorType === 'privy');
  }, [wallets]);

  const address = embeddedWallet?.address as `0x${string}` | undefined;
  const isConnected = !!embeddedWallet && !!address;
  const [selectedCrypto, setSelectedCrypto] = useState(defaultCrypto);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [availableCryptos, setAvailableCryptos] = useState<any[]>([]);
  const [currentQuote, setCurrentQuote] = useState<any>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);
  const quoteIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState<OnRampFormData>({
    amount: defaultAmount,
    crypto: defaultCrypto,
    network: defaultNetwork,
    fiatCurrency: defaultFiatCurrency,
    payWayCode: defaultPayWayCode,
    email: defaultEmail || user?.email?.address || user?.google?.email || '',
    address: defaultAddress || embeddedWallet?.address || '',
    merchantUser: user?.id || ''
  });

  const [addressError, setAddressError] = useState<string>('');
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);

  // Fallback list of supported cryptocurrencies and networks
  const supportedCryptos = [
    { symbol: 'BTC', name: 'Bitcoin', networks: ['BTC', 'BEP20', 'LIGHTNING'] },
    { symbol: 'USDT', name: 'Tether', networks: ['ERC20', 'BEP20', 'ArbitrumOne', 'SOL', 'Optimism', 'Polygon', 'AVAXC-Chain', 'Aptos', 'TON', 'Morph'] },
    { symbol: 'USDC', name: 'USD Coin', networks: ['ERC20', 'BEP20', 'SOL', 'Polygon', 'Aptos', 'BASE', 'ArbitrumOne', 'AVAXC-Chain', 'Noble', 'Morph'] },
    { symbol: 'ETH', name: 'Ethereum', networks: ['ETH', 'BEP20', 'ArbitrumOne', 'Optimism', 'SCROLL', 'Starknet', 'zkSyncEra', 'Morph', 'LINEA', 'BASE'] },
    { symbol: 'BNB', name: 'Binance Coin', networks: ['BEP20'] },
    { symbol: 'SOL', name: 'Solana', networks: ['SOL'] }
  ];

  // Fetch supported cryptocurrencies from backend
  const fetchCryptoList = async () => {
    try {
      const backendUrl = (process.env.NEXT_PUBLIC_SERVER_URL || 'https://gswap-server-04651a4e88ed.herokuapp.com').replace(/\/$/, '');
      const response = await fetch(`${backendUrl}/osl-pay/crypto-options`);
      const data = await response.json();

      if (data.success && data.data && data.data.data) {
        const mainCryptos = ['BTC', 'USDT', 'USDC', 'ETH', 'BNB', 'SOL'];
        const transformedData = data.data.data
          .filter((crypto: any) => mainCryptos.includes(crypto.symbol))
          .map((crypto: any) => ({
            symbol: crypto.symbol,
            name: crypto.name,
            networks: crypto.networks
              .flatMap((network: any) =>
                network.network.split(',').map((net: string) => net.trim())
              )
          }));
        setAvailableCryptos(transformedData);
      } else {
        setAvailableCryptos(supportedCryptos);
      }
    } catch (error) {
      console.error('Error fetching crypto list:', error);
      setAvailableCryptos(supportedCryptos);
    }
  };

  // Fetch quote from OSL Pay API
  const fetchQuote = async () => {
    if (!formData.amount || !formData.crypto || !formData.fiatCurrency) {
      return;
    }

    try {
      setIsLoadingQuote(true);
      const backendUrl = (process.env.NEXT_PUBLIC_SERVER_URL || 'https://gswap-server-04651a4e88ed.herokuapp.com').replace(/\/$/, '');
      const response = await fetch(`${backendUrl}/osl-pay/query-quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: formData.amount,
          cryptoCurrency: formData.crypto,
          fiatCurrency: formData.fiatCurrency,
          network: formData.network
        }),
      });

      const data = await response.json();

      if (data.success && data.data && data.data.data) {
        const quoteData = data.data.data;
        const transformedQuote = {
          rate: quoteData.displayPrice,
          fee: quoteData.displayFee,
          receiveAmount: quoteData.cryptoAmount,
          networkFee: quoteData.networkFee,
          feeRate: quoteData.displayFeeRate,
          fiatAmount: quoteData.fiatAmount,
          cryptoCurrency: quoteData.cryptoCurrency,
          network: quoteData.network || formData.network,
          originalNetwork: quoteData.originalNetwork || formData.network
        };
        setCurrentQuote(transformedQuote);
      } else {
        setCurrentQuote(null);
      }
    } catch (error) {
      console.error('Error fetching quote:', error);
      setCurrentQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  };

  // Start countdown timer
  const startCountdown = () => {
    setCountdown(60);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Start quote polling
  const startQuotePolling = () => {
    if (quoteIntervalRef.current) {
      clearInterval(quoteIntervalRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    fetchQuote();
    startCountdown();

    quoteIntervalRef.current = setInterval(() => {
      fetchQuote();
      startCountdown();
    }, 60000);
  };

  // Stop quote polling
  const stopQuotePolling = () => {
    if (quoteIntervalRef.current) {
      clearInterval(quoteIntervalRef.current);
      quoteIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(0);
  };

  // Handle inserting connected wallet address
  const handleInsertWalletAddress = () => {
    if (address) {
      const currentAvailableNetworks = availableCryptos.length > 0
        ? availableCryptos.find(c => c.symbol === selectedCrypto)?.networks || []
        : OSL_PAY_CONFIG.supportedCryptos.find(c => c.value === selectedCrypto)?.networks || [];

      const originalNetwork = formData.network;
      let suggestedNetwork = formData.network;
      let networkChanged = false;

      if (address.startsWith('0x')) {
        const ethereumNetworks = ['ERC20', 'ArbitrumOne', 'Optimism', 'BASE', 'Polygon', 'SCROLL', 'Starknet', 'zkSyncEra', 'BEP20', 'Morph', 'LINEA', 'AVAXC-Chain', 'Noble', 'SEIEVM'];

        const availableEthereumNetworks = currentAvailableNetworks.filter((network: string) =>
          ethereumNetworks.includes(network)
        );

        if (availableEthereumNetworks.length > 0) {
          if (ethereumNetworks.includes(formData.network)) {
            suggestedNetwork = formData.network;
          } else {
            suggestedNetwork = availableEthereumNetworks[0];
            networkChanged = true;
          }
        } else {
          suggestedNetwork = formData.network;
        }
      } else if (address.startsWith('bc1') || address.startsWith('1') || address.startsWith('3')) {
        if (currentAvailableNetworks.includes('BTC')) {
          if (formData.network !== 'BTC') {
            suggestedNetwork = 'BTC';
            networkChanged = true;
          }
        }
      } else if (address.length >= 32 && address.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]/.test(address) && !address.startsWith('0x')) {
        if (currentAvailableNetworks.includes('SOL')) {
          if (formData.network !== 'SOL') {
            suggestedNetwork = 'SOL';
            networkChanged = true;
          }
        }
      }

      setFormData(prev => ({
        ...prev,
        address: address,
        network: suggestedNetwork
      }));

      const error = validateAddress(address, suggestedNetwork);
      setAddressError(error);

      if (networkChanged) {
        toast({
          title: "Network Changed",
          description: `Network changed from ${originalNetwork} to ${suggestedNetwork} to accommodate your wallet address`,
          duration: 5000,
        });
      }
    }
  };

  // Handle copying address to clipboard
  const handleCopyAddress = async () => {
    if (address) {
      try {
        await navigator.clipboard.writeText(address);
        setCopiedAddress(true);
        setTimeout(() => setCopiedAddress(false), 2000);
      } catch (error) {
        console.error('Failed to copy address:', error);
      }
    }
  };

  // Address validation function
  const validateAddress = (address: string, network: string): string => {
    if (!address || address.trim() === '') {
      return '';
    }

    const ethereumNetworks = ['ERC20', 'ArbitrumOne', 'Optimism', 'SCROLL', 'Starknet', 'zkSyncEra', 'BEP20', 'Morph', 'LINEA', 'BASE', 'Polygon', 'AVAXC-Chain', 'Noble', 'SEIEVM'];
    if (ethereumNetworks.includes(network)) {
      if (!address.startsWith('0x')) {
        return 'Ethereum addresses must start with 0x';
      }
      if (address.length !== 42) {
        return 'Ethereum addresses must be 42 characters long';
      }
      const hexPattern = /^0x[0-9a-fA-F]{40}$/;
      if (!hexPattern.test(address)) {
        return 'Invalid Ethereum address format';
      }
    }

    if (network === 'BTC') {
      if (address.length < 26 || address.length > 35) {
        return 'Invalid Bitcoin address length';
      }
      const btcPattern = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/;
      if (!btcPattern.test(address)) {
        return 'Invalid Bitcoin address format';
      }
    }

    if (network === 'LIGHTNING') {
      if (!address.startsWith('lnbc') && !address.startsWith('lightning:')) {
        return 'Lightning addresses should start with "lnbc" or "lightning:"';
      }
    }

    if (network === 'SOL') {
      if (address.startsWith('0x')) {
        return 'Ethereum addresses are not valid for Solana network. Please enter a Solana address.';
      }
      if (address.length < 32 || address.length > 44) {
        return 'Invalid Solana address length (must be 32-44 characters)';
      }
      const solanaPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!solanaPattern.test(address)) {
        return 'Invalid Solana address format. Solana addresses use base58 encoding.';
      }
    }

    if (network === 'TON') {
      if (!address.startsWith('UQ') && !address.startsWith('EQ') && !address.startsWith('0:')) {
        return 'TON addresses should start with "UQ", "EQ", or "0:"';
      }
    }

    if (network === 'Aptos') {
      if (address.length !== 64) {
        return 'Aptos addresses must be 64 characters long';
      }
      const aptosPattern = /^[0-9a-fA-F]{64}$/;
      if (!aptosPattern.test(address)) {
        return 'Invalid Aptos address format';
      }
    }

    if (network === 'TRC20') {
      if (address.length !== 34) {
        return 'Tron addresses must be 34 characters long';
      }
      if (!address.startsWith('T')) {
        return 'Tron addresses should start with "T"';
      }
    }

    return '';
  };

  const handleInputChange = (field: keyof OnRampFormData, value: string | number) => {
    setFormData(prev => {
      const newData = {
        ...prev,
        [field]: value
      };

      if (field === 'fiatCurrency') {
        const limits = getCurrencyLimits(value as string);
        if (prev.amount < limits.min) {
          newData.amount = limits.min;
        } else if (prev.amount > limits.max) {
          newData.amount = limits.max;
        }
      }

      if (field === 'address') {
        const error = validateAddress(value as string, newData.network);
        setAddressError(error);
      }

      return newData;
    });
  };

  const handleNetworkChange = (network: string) => {
    setFormData(prev => {
      const newData = {
        ...prev,
        network
      };

      if (prev.address) {
        const error = validateAddress(prev.address, network);
        setAddressError(error);
      }

      return newData;
    });
  };

  const handleCryptoChange = (crypto: string) => {
    setSelectedCrypto(crypto);
    setFormData(prev => {
      const newNetwork = OSL_PAY_CONFIG.supportedCryptos.find(c => c.value === crypto)?.networks[0] || 'ERC20';
      const newData = {
        ...prev,
        crypto,
        network: newNetwork
      };

      if (prev.address) {
        const error = validateAddress(prev.address, newNetwork);
        setAddressError(error);
      }

      return newData;
    });
  };

  const handleCryptoNetworkSelect = (crypto: string, network: string) => {
    setSelectedCrypto(crypto);
    setFormData(prev => {
      const newData = {
        ...prev,
        crypto,
        network
      };

      if (prev.address) {
        const error = validateAddress(prev.address, network);
        setAddressError(error);
      }

      return newData;
    });
    toast({
      title: "Selection Updated",
      description: `Selected ${crypto} on ${network}`,
      duration: 3000,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFormSubmit?.(formData);
  };

  // Update formData when user or wallet becomes available
  useEffect(() => {
    const userEmail = user?.email?.address || user?.google?.email || '';
    const walletAddress = embeddedWallet?.address || '';
    const merchantUserId = user?.id || '';

    if (
      (userEmail && formData.email !== userEmail) ||
      (walletAddress && formData.address !== walletAddress) ||
      (merchantUserId && formData.merchantUser !== merchantUserId)
    ) {
      setFormData(prev => ({
        ...prev,
        email: userEmail || prev.email,
        address: walletAddress || prev.address,
        merchantUser: merchantUserId || prev.merchantUser
      }));
    }
  }, [user?.email?.address, user?.google?.email, user?.id, embeddedWallet?.address]);

  // Initialize crypto list on component mount
  useEffect(() => {
    fetchCryptoList();
  }, []);

  // Start/stop quote polling based on form data
  useEffect(() => {
    if (formData.amount && formData.crypto && formData.fiatCurrency) {
      startQuotePolling();
    } else {
      stopQuotePolling();
    }

    return () => {
      stopQuotePolling();
    };
  }, [formData.amount, formData.crypto, formData.fiatCurrency]);

  // Get available networks for selected crypto
  const availableNetworks = availableCryptos.length > 0
    ? availableCryptos.find(c => c.symbol === selectedCrypto)?.networks || []
    : OSL_PAY_CONFIG.supportedCryptos.find(c => c.value === selectedCrypto)?.networks || [];

  // Check if appId is available
  const appId = OSL_PAY_CONFIG.merchant.appId || process.env.NEXT_PUBLIC_OSL_APP_ID;

  if (!appId) {
    return (
      <div className="text-center p-8">
        <p className="text-red-500 mb-4">OSL Pay configuration is missing. Please contact support.</p>
        <p className="text-sm text-gray-500">Please refresh the page or contact support if this issue persists.</p>
        <p className="text-xs text-gray-400 mt-2">Missing: NEXT_PUBLIC_OSL_APP_ID environment variable</p>
      </div>
    );
  }

  // Wait for Privy to be ready before rendering the form
  if (!privyReady) {
    return (
      <div className="text-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-sm text-muted-foreground">Initializing wallet...</p>
      </div>
    );
  }

  // KYC status is handled by OSL Pay, not Privy
  const isKycVerified = true;
  const isKycRejected = false;
  const isKycPending = false;
  const hasNotSubmittedKyc = false;

  if (!showForm) {
    return (
      <OslPayButton
        appId={appId}
        amount={formData.amount}
        crypto={formData.crypto}
        network={formData.network}
        fiatCurrency={formData.fiatCurrency}
        payWayCode={formData.payWayCode}
        email={formData.email}
        address={formData.address}
        merchantUser={user?.id || ''}
        className={className}
      >
        On-ramp with OSL Pay
      </OslPayButton>
    );
  }

  // Show KYC-only form for users who haven't completed KYC
  if (!isKycVerified) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={`relative w-full max-w-md mx-auto ${className}`}
      >
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 shadow-lg">
          <div className="relative p-6 space-y-4">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {isKycRejected ? 'KYC Verification Failed' : 'Complete KYC Verification'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isKycRejected
                  ? "Your KYC verification was rejected. Please try again with valid documents."
                  : hasNotSubmittedKyc
                    ? "Complete identity verification to start buying crypto with fiat currency."
                    : "Your KYC verification is being reviewed. You'll be notified once it's complete."
                }
              </p>
            </div>

            <div className={`rounded-lg p-4 border ${
              isKycRejected
                ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200/50 dark:border-red-800/50'
                : hasNotSubmittedKyc
                  ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50 dark:border-blue-800/50'
                  : 'bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200/50 dark:border-yellow-800/50'
            }`}>
              <div className="flex items-center gap-3">
                {isKycRejected ? (
                  <User className="w-5 h-5 text-red-600" />
                ) : hasNotSubmittedKyc ? (
                  <User className="w-5 h-5 text-blue-600" />
                ) : (
                  <Clock className="w-5 h-5 text-yellow-600" />
                )}
                <div>
                  <p className={`text-sm font-medium ${
                    isKycRejected
                      ? 'text-red-700 dark:text-red-300'
                      : hasNotSubmittedKyc
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-yellow-700 dark:text-yellow-300'
                  }`}>
                    {isKycRejected
                      ? 'KYC Verification Rejected'
                      : hasNotSubmittedKyc
                        ? 'KYC Verification Required'
                        : 'KYC Verification Pending'
                    }
                  </p>
                  <p className={`text-xs ${
                    isKycRejected
                      ? 'text-red-600 dark:text-red-400'
                      : hasNotSubmittedKyc
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-yellow-600 dark:text-yellow-400'
                  }`}>
                    {isKycRejected
                      ? 'Please ensure your documents are clear and valid, then try again.'
                      : hasNotSubmittedKyc
                        ? 'Complete identity verification to access crypto purchases.'
                        : 'Your documents are being reviewed. This usually takes 1-2 business days.'
                    }
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <OslPayButton
                appId={appId}
                email={user?.email?.address || user?.google?.email || ''}
                merchantUser={user?.id || ''}
                className="w-full h-11 text-base font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center"
              >
                {isKycRejected
                  ? 'Retry KYC Verification'
                  : hasNotSubmittedKyc
                    ? 'Start KYC Verification'
                    : 'Check KYC Status'
                }
              </OslPayButton>
            </div>

            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                {isKycRejected
                  ? 'Make sure your documents are clear and meet the requirements'
                  : 'After KYC completion, you\'ll be able to purchase crypto with fiat currency'
                }
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative w-full max-w-md mx-auto ${className}`}
    >
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 shadow-lg">
        <div className="relative p-5 space-y-4">
          {/* Compact Header */}
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-white" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-foreground">
              On-Ramp with OSL Pay
            </h3>
            <p className="text-xs text-muted-foreground">
              Purchase crypto with fiat currency
            </p>
          </div>

          {/* Wallet Connection */}
          {!authenticated ? (
            <div className="flex justify-center">
              <Button
                onClick={login}
                className="w-full"
                variant="default"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Connect Wallet
              </Button>
            </div>
          ) : !embeddedWallet ? (
            <div className="flex justify-center">
              <p className="text-sm text-muted-foreground">
                Creating your wallet...
              </p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Amount & Currency Section */}
            <div className="space-y-2">
              <Label htmlFor="onramp-amount" className="text-sm font-medium text-foreground">
                Amount
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Input
                    id="onramp-amount"
                    type="number"
                    min={getCurrencyLimits(formData.fiatCurrency).min}
                    max={getCurrencyLimits(formData.fiatCurrency).max}
                    step="1"
                    value={formData.amount}
                    onChange={(e) => handleInputChange('amount', Number(e.target.value))}
                    className="text-center text-base font-semibold h-10"
                    placeholder="Enter amount"
                  />
                </div>
                <div>
                  <Select value={formData.fiatCurrency} onValueChange={(value) => handleInputChange('fiatCurrency', value)}>
                    <SelectTrigger className="h-10">
                      <SelectValue>
                        {(() => {
                          const Icon = CurrencyIconMap[formData.fiatCurrency];
                          return (
                            <div className="flex items-center gap-2">
                              {Icon ? (
                                <Icon style={{ width: '16px', height: '16px' }} />
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                                  {formData.fiatCurrency[0]}
                                </div>
                              )}
                              <span>{formData.fiatCurrency}</span>
                            </div>
                          );
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {FIAT_CURRENCIES.map((currency) => {
                        const Icon = CurrencyIconMap[currency.code];
                        return (
                          <SelectItem key={currency.code} value={currency.code}>
                            <div className="flex items-center gap-2">
                              {Icon ? (
                                <Icon style={{ width: '16px', height: '16px' }} />
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                                  {currency.code[0]}
                                </div>
                              )}
                              <span>{currency.code} - {currency.name}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="text-xs text-center text-muted-foreground bg-muted/30 rounded px-2 py-1">
                Min: {getCurrencySymbol(formData.fiatCurrency)}{getCurrencyLimits(formData.fiatCurrency).min.toLocaleString()} | Max: {getCurrencySymbol(formData.fiatCurrency)}{getCurrencyLimits(formData.fiatCurrency).max.toLocaleString()}
              </div>
            </div>

            {/* Crypto & Network Selection */}
            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">
                Cryptocurrency & Network
              </Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCryptoModal(true)}
                className="w-full h-10 justify-between"
              >
                <span className="flex items-center gap-2">
                  <CryptoIcon symbol={selectedCrypto} />
                  <span className="font-medium">{selectedCrypto}</span>
                  <span className="text-muted-foreground">on</span>
                  <NetworkIcon network={formData.network} />
                  <span className="font-medium">{formData.network}</span>
                </span>
                <ChevronDown className="w-4 h-4" />
              </Button>

              {/* Estimated Receive Amount */}
              {currentQuote && currentQuote.receiveAmount && (
                <div className="mt-2 p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CryptoIcon symbol={formData.crypto} />
                      <span className="text-xs text-blue-600 dark:text-blue-400">Estimated Receive:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-blue-900 dark:text-blue-100">
                        {currentQuote.receiveAmount} {formData.crypto}
                      </span>
                      <Dialog open={showQuoteModal} onOpenChange={setShowQuoteModal}>
                        <DialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                          >
                            <Info className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                              Live Quote Details
                            </DialogTitle>
                          </DialogHeader>

                          <div className="space-y-4 mt-4">
                            <div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-blue-600 dark:text-blue-400">You Pay:</span>
                                <span className="font-semibold text-blue-900 dark:text-blue-100">
                                  {getCurrencySymbol(formData.fiatCurrency)}{formData.amount}
                                </span>
                              </div>
                              <p className="text-xs text-blue-500/70 dark:text-blue-400/70 mt-1 text-right">
                                {formData.fiatCurrency} ({FIAT_CURRENCIES.find(c => c.code === formData.fiatCurrency)?.name})
                              </p>
                            </div>

                            {currentQuote.rate && (
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-blue-600 dark:text-blue-400">Rate:</span>
                                <span className="font-semibold text-blue-900 dark:text-blue-100">
                                  1 {formData.crypto} = {getCurrencySymbol(formData.fiatCurrency)}{currentQuote.rate}
                                </span>
                              </div>
                            )}

                            {currentQuote.fee && (
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-blue-600 dark:text-blue-400">Service Fee:</span>
                                <span className="font-semibold text-blue-900 dark:text-blue-100">
                                  {getCurrencySymbol(formData.fiatCurrency)}{currentQuote.fee}
                                </span>
                              </div>
                            )}

                            {currentQuote.networkFee && (
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-blue-600 dark:text-blue-400">Network Fee:</span>
                                <span className="font-semibold text-blue-900 dark:text-blue-100">
                                  {getCurrencySymbol(formData.fiatCurrency)}{currentQuote.networkFee}
                                </span>
                              </div>
                            )}

                            {currentQuote.receiveAmount && (
                              <div className="flex justify-between items-center border-t border-blue-200 dark:border-blue-700 pt-2">
                                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">You Receive:</span>
                                <span className="font-bold text-blue-900 dark:text-blue-100">
                                  {currentQuote.receiveAmount} {formData.crypto}
                                </span>
                              </div>
                            )}

                            <div className="flex justify-between items-center border-t border-blue-200 dark:border-blue-700 pt-2">
                              <span className="text-sm text-blue-600 dark:text-blue-400">Blockchain Network:</span>
                              <div className="flex items-center gap-2">
                                <NetworkIcon network={formData.network} />
                                <span className="font-semibold text-blue-900 dark:text-blue-100">
                                  {formData.network}
                                </span>
                              </div>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="text-sm text-blue-600 dark:text-blue-400">Cryptocurrency:</span>
                              <div className="flex items-center gap-2">
                                <CryptoIcon symbol={formData.crypto} />
                                <span className="font-semibold text-blue-900 dark:text-blue-100">
                                  {formData.crypto}
                                </span>
                              </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700 text-xs text-blue-600 dark:text-blue-400 flex items-center justify-center gap-2">
                              {isLoadingQuote ? (
                                <>
                                  <div className="animate-spin h-3 w-3 border border-blue-600 border-t-transparent rounded-full"></div>
                                  <span>Updating quote...</span>
                                </>
                              ) : countdown > 0 ? (
                                <>
                                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                                  <span>Next update in {countdown}s</span>
                                </>
                              ) : (
                                <span>Quote updates every minute</span>
                              )}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
              )}

              {!currentQuote && formData.amount && formData.crypto && formData.fiatCurrency && (
                <div className="mt-2 p-2 bg-muted/30 rounded-lg text-xs text-muted-foreground text-center">
                  Fetching quote...
                </div>
              )}
            </div>

            {/* Wallet Address Input - Optional */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="address" className="text-xs font-medium text-foreground">
                  Wallet Address (Optional)
                </Label>
                {isConnected && address ? (
                  <Button
                    onClick={handleInsertWalletAddress}
                    variant="outline"
                    size="sm"
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 h-7 px-3 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                  >
                    <Wallet className="w-3 h-3 mr-1" />
                    Use My Address
                  </Button>
                ) : (
                  <div className="text-xs text-orange-600 dark:text-orange-400">
                    Connect wallet to auto-fill
                  </div>
                )}
              </div>

              <div className="relative">
                <Input
                  id="address"
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder={formData.network === 'ERC20' || formData.network === 'ArbitrumOne' || formData.network === 'Optimism' || formData.network === 'BASE' || formData.network === 'POLYGON' ? '0x...' : formData.network === 'BTC' ? 'bc1... or 1...' : formData.network === 'SOL' ? 'Solana address...' : 'Enter your wallet address'}
                  className={`h-10 pr-20 ${addressError ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                {isConnected && address && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    <Button
                      onClick={handleCopyAddress}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      {copiedAddress ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {addressError && (
                <p className="text-xs text-red-500 mt-1">{addressError}</p>
              )}
              {!addressError && formData.address && (
                <p className="text-xs text-green-600 mt-1">Valid {formData.network} address</p>
              )}

              {/* Wallet Connection Status */}
              {!isConnected ? (
                <div className="bg-orange-50/50 dark:bg-orange-950/20 rounded-lg p-3 border border-orange-200/50 dark:border-orange-800/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-4 h-4 text-orange-600" />
                    <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
                      Wallet Not Connected
                    </span>
                  </div>
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    Connect your wallet above to automatically fill the address field, or enter a wallet address manually. Address is optional.
                  </p>
                </div>
              ) : (
                <div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200/50 dark:border-blue-800/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Connected Wallet
                    </span>
                  </div>
                  <div className="font-mono text-xs text-blue-600 dark:text-blue-400 break-all">
                    {address}
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Click &quot;Use My Address&quot; to automatically fill this field. Network will be adjusted if needed. Address is optional.
                  </p>
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="space-y-1">
              <Label htmlFor="payment-method" className="text-xs font-medium text-foreground">
                Payment Method
              </Label>
              <Select value={formData.payWayCode || 'ANY'} onValueChange={(value) => handleInputChange('payWayCode', value === 'ANY' ? undefined : value as any)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                        <span className="text-xs text-white font-bold">A</span>
                      </div>
                      Any method
                    </div>
                  </SelectItem>
                  <SelectItem value="CARD_PAYMENT">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      Credit Card
                    </div>
                  </SelectItem>
                  <SelectItem value="GOOGLE_PAY">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-green-600" />
                      Google Pay
                    </div>
                  </SelectItem>
                  <SelectItem value="APPLE_PAY">
                    <div className="flex items-center gap-2">
                      <Apple className="w-4 h-4 text-gray-800" />
                      Apple Pay
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Optional Fields */}
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                Advanced Options
              </summary>
              <div className="mt-2 space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs font-medium text-foreground">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="Enter your email address"
                    className="h-9"
                  />
                </div>
              </div>
            </details>

            {/* OSL Pay Button */}
            <div className="pt-3 pb-4">
              <OslPayButton
                appId={appId}
                amount={formData.amount}
                crypto={formData.crypto}
                network={formData.network}
                fiatCurrency={formData.fiatCurrency}
                payWayCode={formData.payWayCode}
                email={formData.email}
                address={formData.address}
                merchantUser={user?.id || ''}
                className="w-full h-11 text-base font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center"
              >
                On-ramp with OSL Pay
              </OslPayButton>
            </div>
          </form>
        </div>
      </div>

      {/* Crypto Network Selection Modal */}
      <CryptoNetworkModal
        isOpen={showCryptoModal}
        onClose={() => setShowCryptoModal(false)}
        onSelect={handleCryptoNetworkSelect}
        availableCryptos={availableCryptos.length > 0 ? availableCryptos : supportedCryptos}
        selectedCrypto={selectedCrypto}
        selectedNetwork={formData.network}
      />
    </motion.div>
  );
}
