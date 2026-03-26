'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { BrandProduct } from '@/lib/types/catalogue';
import PurchaseModal from './PurchaseModal';
import OrderStatusModal from './OrderStatusModal';
import { SlidersHorizontal, X, Shield, Wallet, LogOut, CreditCard, Send, Clock } from 'lucide-react';
import { usePrivy, useWallets, useExportWallet, useCreateWallet } from '@privy-io/react-auth';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import WalletViewModal from './WalletViewModal';
import SendUsdcModal from './SendUsdcModal';
import SendEthModal from './SendEthModal';
import OrderHistoryList from './OrderHistoryList';

export default function GiftCardCatalog() {
  const { ready: privyReady, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { exportWallet } = useExportWallet();
  const { createWallet } = useCreateWallet();
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
  const { balance: usdcBalance, ethBalance, loading: balanceLoading, refetch: refetchBalance } = useUsdcBalance(embeddedWallet?.address);

  const [brands, setBrands] = useState<BrandProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<BrandProduct | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'giftcards' | 'mastercards' | 'orders'>('giftcards');

  // Mastercard state
  const [mastercards, setMastercards] = useState<BrandProduct[]>([]);
  const [loadingMastercards, setLoadingMastercards] = useState(false);
  const [mastercardsFetched, setMastercardsFetched] = useState(false);

  // Filters
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedBrandFilters, setSelectedBrandFilters] = useState<string[]>([]);
  const [showUniqueBrandsOnly, setShowUniqueBrandsOnly] = useState<boolean>(true);
  const [likedProducts, setLikedProducts] = useState<Set<string>>(new Set());

  // Mobile filter drawer state
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Wallet modals
  const [showWalletView, setShowWalletView] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showSendEthModal, setShowSendEthModal] = useState(false);

  // Purchase modal state
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showOrderStatusModal, setShowOrderStatusModal] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [currentOrderToken, setCurrentOrderToken] = useState<string>('');

  // Debounce search input
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Fetch brands
  useEffect(() => {
    fetchBrands();
  }, [countryFilter, currencyFilter]);

  const fetchBrands = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (countryFilter !== 'all') params.append('country', countryFilter);
      if (currencyFilter !== 'all') params.append('currency', currencyFilter);

      const url = `/api/brands?${params.toString()}`;
      const response = await fetch(url);
      const result = await response.json();

      if (result && Array.isArray(result.data)) {
        setBrands(result.data);
      } else if (Array.isArray(result)) {
        setBrands(result);
      } else {
        console.warn('Unexpected data format:', result);
        setBrands([]);
      }
    } catch (error) {
      console.error('Error fetching brands:', error);
      setBrands([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Mastercards when tab is switched or filters change
  useEffect(() => {
    if (activeTab === 'mastercards') {
      fetchMastercards();
    }
  }, [activeTab, countryFilter, currencyFilter]);

  const fetchMastercards = async () => {
    try {
      setLoadingMastercards(true);
      const params = new URLSearchParams();
      if (countryFilter !== 'all') params.append('country', countryFilter);
      if (currencyFilter !== 'all') params.append('currency', currencyFilter);

      const response = await fetch(`/api/mastercards?${params.toString()}`);
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setMastercards(result.data);
      } else {
        setMastercards([]);
      }
      setMastercardsFetched(true);
    } catch (error) {
      console.error('Error fetching Mastercards:', error);
      setMastercards([]);
    } finally {
      setLoadingMastercards(false);
    }
  };

  // Fallback: if authenticated but no embedded wallet after 3s, try creating one
  useEffect(() => {
    if (!privyReady || !authenticated || embeddedWallet) return;

    const timeout = setTimeout(async () => {
      try {
        await createWallet();
      } catch (err) {
        // Wallet may already exist, which throws — that's ok
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [privyReady, authenticated, embeddedWallet, createWallet]);

  const brandsArray = Array.isArray(brands) ? brands : [];

  // Get unique brand names
  const allUniqueBrands = Array.from(new Set(brandsArray.map(b => b.brand_name))).sort();

  // Static filter options so selecting one filter doesn't collapse the other
  const availableCountries = ['United States of America', 'Canada', 'Hong Kong', 'United Kingdom'];
  const availableCurrencies = ['USD', 'CAD', 'HKD', 'GBP'];

  // Apply all filters — exclude Mastercard products from gift cards tab
  let filteredProducts = brandsArray.filter(b => !b.brand_name.toLowerCase().includes('mastercard'));

  if (countryFilter !== 'all') {
    filteredProducts = filteredProducts.filter(b => b.country_name === countryFilter);
  }

  if (currencyFilter !== 'all') {
    filteredProducts = filteredProducts.filter(b => b.currency === currencyFilter);
  }

  if (searchQuery) {
    filteredProducts = filteredProducts.filter(b =>
      b.brand_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.country_name && b.country_name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }

  if (selectedBrandFilters.length > 0) {
    filteredProducts = filteredProducts.filter(b => selectedBrandFilters.includes(b.brand_name));
  }

  if (showUniqueBrandsOnly) {
    const brandMap = new Map<string, BrandProduct>();
    filteredProducts.forEach(product => {
      const brandName = product.brand_name;
      if (!brandMap.has(brandName)) {
        brandMap.set(brandName, product);
      } else {
        const existing = brandMap.get(brandName);
        if (product.product_image && !existing?.product_image) {
          brandMap.set(brandName, product);
        }
      }
    });
    filteredProducts = Array.from(brandMap.values());
  }


  const toggleBrandFilter = (brandName: string) => {
    setSelectedBrandFilters(prev =>
      prev.includes(brandName)
        ? prev.filter(b => b !== brandName)
        : [...prev, brandName]
    );
  };

  const toggleLike = (productId: string) => {
    setLikedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  // Count active filters for badge
  const activeFilterCount =
    (countryFilter !== 'all' ? 1 : 0) +
    (currencyFilter !== 'all' ? 1 : 0) +
    selectedBrandFilters.length +
    (searchQuery ? 1 : 0);

  // Filter content component to avoid duplication
  const filterContent = (
    <div className="space-y-6 sm:space-y-8">
      {/* Search */}
      <div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search for a brand..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-11 pr-4 py-3 min-h-[44px] border-2 border-slate-600 rounded-lg text-sm text-slate-100 placeholder:text-slate-400 bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none hover:border-slate-500 transition-colors"
          />
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Show Unique Brands Only Toggle */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/50 p-3 rounded-lg transition-colors border-2 border-slate-600">
          <input
            type="checkbox"
            checked={showUniqueBrandsOnly}
            onChange={(e) => setShowUniqueBrandsOnly(e.target.checked)}
            className="w-5 h-5 text-indigo-600 border-slate-500 rounded focus:ring-indigo-500 bg-slate-700"
          />
          <div className="flex-1">
            <span className="text-sm font-bold text-slate-100 block">Show Unique Brands Only</span>
            <span className="text-xs text-slate-400 block mt-1">Display one product per brand</span>
          </div>
        </label>
      </div>

      {/* Country Filter */}
      <div>
        <h3 className="text-base font-bold text-slate-100 mb-4 pb-3 border-b-2 border-slate-600">Country</h3>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="w-full px-4 py-3 min-h-[44px] border-2 border-slate-600 rounded-lg text-sm font-medium text-slate-100 bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none hover:border-slate-500 transition-colors"
        >
          <option value="all">All Countries</option>
          {availableCountries.map(country => (
            <option key={country} value={country}>{country}</option>
          ))}
        </select>
      </div>

      {/* Currency Filter */}
      <div>
        <h3 className="text-base font-bold text-slate-100 mb-4 pb-3 border-b-2 border-slate-600">Currency</h3>
        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value)}
          className="w-full px-4 py-3 min-h-[44px] border-2 border-slate-600 rounded-lg text-sm font-medium text-slate-100 bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none hover:border-slate-500 transition-colors"
        >
          <option value="all">All Currencies</option>
          {availableCurrencies.map(currency => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </select>
      </div>

      {/* Brands Filter */}
      <div>
        <h3 className="text-base font-bold text-slate-100 mb-4 pb-3 border-b-2 border-slate-600">Brands</h3>
        <div className="space-y-3 max-h-[300px] sm:max-h-[500px] overflow-y-auto pr-2">
          {allUniqueBrands.slice(0, 30).map((brandName) => (
            <label key={brandName} className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/50 p-2 rounded-lg transition-colors">
              <input
                type="checkbox"
                checked={selectedBrandFilters.includes(brandName)}
                onChange={() => toggleBrandFilter(brandName)}
                className="w-5 h-5 text-indigo-600 border-slate-500 rounded focus:ring-indigo-500 bg-slate-700"
              />
              <span className="text-sm text-slate-200 font-medium">{brandName}</span>
            </label>
          ))}
          {allUniqueBrands.length > 30 && (
            <button className="text-sm text-indigo-400 hover:text-indigo-300 font-bold ml-2">
              View All ({allUniqueBrands.length})
            </button>
          )}
        </div>
      </div>

      {/* Clear Filters */}
      {(selectedBrandFilters.length > 0 || countryFilter !== 'all' || currencyFilter !== 'all' || searchQuery || showUniqueBrandsOnly) && (
        <button
          onClick={() => {
            setSelectedBrandFilters([]);
            setCountryFilter('all');
            setCurrencyFilter('all');
            setSearchQuery('');
            setSearchInput('');
            setShowUniqueBrandsOnly(false);
          }}
          className="w-full px-5 py-3 min-h-[44px] bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-bold rounded-lg transition-colors shadow-sm"
        >
          Clear All Filters
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="w-full max-w-[1920px] mx-auto">
        <div className="flex flex-col lg:flex-row h-[calc(100vh-56px)] w-full bg-slate-900">
          {/* LEFT SIDEBAR - Filters (Hidden on mobile, shown on lg+) */}
          <aside className="hidden lg:block w-80 bg-slate-800 border-r border-slate-700 overflow-y-auto flex-shrink-0 shadow-sm">
            <div className="p-8">
              <Link href="/" className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium mb-6 text-sm">
                &larr; CYM Studio
              </Link>

              {/* Privy Auth Section */}
              <div className="mb-6 p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                {!privyReady ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                    Initializing...
                  </div>
                ) : authenticated && user ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                        <Wallet className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => embeddedWallet && setShowWalletView(true)}
                          className="text-xs font-medium text-slate-200 truncate hover:text-indigo-400 transition-colors cursor-pointer text-left w-full block"
                          title="View wallet details"
                        >
                          {user.email?.address || user.google?.email || 'Connected'}
                        </button>
                        {embeddedWallet && (
                          <button
                            onClick={() => setShowWalletView(true)}
                            className="text-[10px] text-slate-400 hover:text-indigo-400 font-mono truncate transition-colors cursor-pointer text-left w-full block"
                            title="View wallet details"
                          >
                            {embeddedWallet.address.slice(0, 6)}...{embeddedWallet.address.slice(-4)}
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={logout}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 py-1.5 rounded hover:bg-slate-700/50 transition-colors"
                    >
                      <LogOut className="w-3 h-3" />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={login}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <Wallet className="w-4 h-4" />
                    Sign In
                  </button>
                )}
              </div>

              {filterContent}
            </div>
          </aside>

          {/* Mobile Filter Bottom Sheet */}
          {showMobileFilters && (
            <div className="fixed inset-0 z-50 lg:hidden">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/60"
                onClick={() => setShowMobileFilters(false)}
              />
              {/* Bottom Sheet */}
              <div className="absolute bottom-0 left-0 right-0 bg-slate-800 rounded-t-2xl max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
                {/* Handle */}
                <div className="flex justify-center py-3">
                  <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
                </div>
                {/* Header */}
                <div className="flex items-center justify-between px-4 pb-3 border-b border-slate-700">
                  <h3 className="text-lg font-bold text-slate-100">Filters</h3>
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-300" />
                  </button>
                </div>
                {/* Content */}
                <div className="p-4 overflow-y-auto max-h-[calc(85vh-120px)]">
                  {filterContent}
                </div>
                {/* Footer */}
                <div className="p-4 border-t border-slate-700 bg-slate-800">
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-colors"
                  >
                    Show {filteredProducts.length} Results
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 overflow-y-auto bg-slate-900">
            <div className="p-4 sm:p-8 pb-20 sm:pb-24 w-full">
              {/* Program Scope Notice */}
              <div className="mb-4 sm:mb-6 p-4 rounded-xl bg-slate-800/80 border border-slate-700">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 mb-1">Loyalty Reward Center</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Rewards in this catalogue are intended exclusively for use for CYM Studio&apos;s <span className="text-slate-200 font-medium">Employee Rewards</span>, <span className="text-slate-200 font-medium">Loyalty Programs</span>, and <span className="text-slate-200 font-medium">Sales Incentive Programs</span>. All redemptions must comply with your organization&apos;s program guidelines.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 mb-4 sm:mb-6 border-b border-slate-700">
                <button
                  onClick={() => setActiveTab('giftcards')}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === 'giftcards'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Gift Cards
                </button>
                <button
                  onClick={() => setActiveTab('mastercards')}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'mastercards'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  Prepaid Mastercards
                </button>
                {authenticated && (
                  <button
                    onClick={() => setActiveTab('orders')}
                    className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === 'orders'
                        ? 'border-indigo-500 text-indigo-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    My Orders
                  </button>
                )}
              </div>

              {/* Top Bar */}
              <div className="flex items-center justify-between mb-4 sm:mb-8 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="hidden sm:block h-1 w-1 bg-indigo-500 rounded-full flex-shrink-0"></div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-100 truncate">
                    {activeTab === 'orders' ? (
                      <>My Orders</>
                    ) : activeTab === 'giftcards' ? (
                      <>All Products <span className="text-slate-400 font-normal text-sm sm:text-lg">({filteredProducts.length})</span></>
                    ) : (
                      <>Prepaid Mastercards <span className="text-slate-400 font-normal text-sm sm:text-lg">({mastercards.length})</span></>
                    )}
                  </h2>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Mobile Privy Auth */}
                  <div className="lg:hidden">
                    {privyReady && !authenticated ? (
                      <button
                        onClick={login}
                        className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-lg transition-colors"
                      >
                        <Wallet className="w-4 h-4" />
                        Sign In
                      </button>
                    ) : privyReady && authenticated ? (
                      <button
                        onClick={() => embeddedWallet && setShowWalletView(true)}
                        className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors border border-slate-600"
                      >
                        <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
                          <Wallet className="w-2.5 h-2.5 text-white" />
                        </div>
                      </button>
                    ) : null}
                  </div>
                  {/* Mobile Filter Button - only for gift cards tab */}
                  {activeTab === 'giftcards' && (
                    <button
                      onClick={() => setShowMobileFilters(true)}
                      className="lg:hidden flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      Filters
                      {activeFilterCount > 0 && (
                        <span className="bg-white text-indigo-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === 'orders' ? (
                <OrderHistoryList
                  getAccessToken={getAccessToken}
                  onViewOrder={(orderId, orderToken, email) => {
                    setCurrentOrderId(orderId);
                    setCurrentOrderToken(orderToken);
                    setCurrentUserEmail(email);
                    setShowOrderStatusModal(true);
                  }}
                />
              ) : activeTab === 'mastercards' ? (
                loadingMastercards ? (
                  <div className="text-center py-20">
                    <div className="relative inline-flex">
                      <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-700 border-t-indigo-500"></div>
                    </div>
                    <p className="text-slate-400 mt-6 font-medium">Loading Mastercards...</p>
                  </div>
                ) : mastercards.length === 0 ? (
                  <div className="text-center py-20">
                    <CreditCard className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-100 mb-2">No Mastercard products available</h3>
                    <p className="text-slate-400">Prepaid Mastercard products are not currently available in your region.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {mastercards.map((product) => (
                      <div
                        key={product.product_id}
                        className="group relative bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:shadow-xl hover:shadow-indigo-500/10 hover:border-slate-600 transition-all duration-300"
                      >
                        {/* Product Image */}
                        <div className="relative h-40 sm:h-56 bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden cursor-pointer flex items-center justify-center" onClick={() => setSelectedProduct(product)}>
                          {product.product_image ? (
                            <img
                              src={product.product_image}
                              alt={product.brand_name}
                              className="w-full h-full object-contain p-4 sm:p-6 group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-3">
                              <CreditCard className="w-16 h-16 text-orange-400" />
                              <span className="text-lg font-bold text-slate-300">Mastercard Prepaid</span>
                            </div>
                          )}
                        </div>

                        {/* Product Info */}
                        <div className="p-4 border-t border-slate-700">
                          <h3 className="font-bold text-slate-100 text-base mb-1">{product.brand_name}</h3>
                          <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">{product.country_name}</p>

                          {/* Value Range */}
                          {product.value_restrictions && (
                            <div className="mb-3 p-2.5 bg-slate-700/50 rounded-lg">
                              <p className="text-xs text-slate-400 mb-1">Value Range</p>
                              <p className="text-sm font-semibold text-slate-100">
                                {product.currency} {product.value_restrictions.minVal || product.value_restrictions.min} - {product.value_restrictions.maxVal || product.value_restrictions.max}
                              </p>
                            </div>
                          )}

                          <p className="text-xs text-slate-400 mb-3">{product.currency} * {product.country_name}</p>

                          <button
                            onClick={() => setSelectedProduct(product)}
                            className="w-full px-4 py-2.5 min-h-[40px] bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm"
                          >
                            View & Redeem
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : loading ? (
                <div className="text-center py-20">
                  <div className="relative inline-flex">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-700 border-t-indigo-500"></div>
                  </div>
                  <p className="text-slate-400 mt-6 font-medium">Loading rewards...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-20">
                  <h3 className="text-xl font-bold text-slate-100 mb-2">No products found</h3>
                  <p className="text-slate-400 mb-6">Try adjusting your filters or search query</p>
                  <button
                    onClick={() => {
                      setSelectedBrandFilters([]);
                      setCountryFilter('all');
                      setCurrencyFilter('all');
                      setSearchQuery('');
                      setSearchInput('');
                    }}
                    className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors"
                  >
                    Clear All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.product_id}
                      className="group relative bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:shadow-xl hover:shadow-indigo-500/10 hover:border-slate-600 transition-all duration-300"
                    >
                      {/* Like Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(String(product.product_id));
                        }}
                        className="absolute top-2 sm:top-3 right-2 sm:right-3 z-10 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-900/80 flex items-center justify-center hover:bg-slate-900 transition-colors shadow-lg border border-slate-700"
                      >
                        {likedProducts.has(String(product.product_id)) ? (
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 fill-current" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        )}
                      </button>

                      {/* Product Image */}
                      <div className="relative h-32 sm:h-56 bg-white overflow-hidden cursor-pointer" onClick={() => setSelectedProduct(product)}>
                        {product.product_image ? (
                          <img
                            src={product.product_image}
                            alt={product.brand_name}
                            className="w-full h-full object-contain p-3 sm:p-6 group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-700">
                            <span className="text-4xl sm:text-7xl text-slate-400">Reward</span>
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="p-2.5 sm:p-4 border-t border-slate-700">
                        <div className="mb-2 sm:mb-3">
                          <h3 className="font-bold text-slate-100 text-xs sm:text-base mb-0.5 sm:mb-1.5 leading-tight line-clamp-2">
                            {product.brand_name}
                          </h3>
                          <p className="text-xs text-slate-400 uppercase tracking-wide hidden sm:block">
                            {product.country_name}
                          </p>
                        </div>

                        {/* Denominations - Hidden on small mobile */}
                        {product.denominations && Array.isArray(product.denominations) && product.denominations.length > 0 && (
                          <div className="hidden sm:block mb-3">
                            <div className="flex flex-wrap gap-1.5">
                              {product.denominations.slice(0, 3).map((denom: number, idx: number) => (
                                <span key={idx} className="text-xs bg-slate-700 text-slate-300 font-medium px-2.5 py-1 rounded-md">
                                  {product.currency} {denom}
                                </span>
                              ))}
                              {product.denominations.length > 3 && (
                                <span className="text-xs text-slate-500 px-2 py-1 font-medium">
                                  +{product.denominations.length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Country & Currency - Simplified on mobile */}
                        <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-slate-400 mb-2 sm:mb-3 pb-2 sm:pb-3 border-b border-slate-700">
                          <span className="font-medium truncate">{product.currency}</span>
                          <span className="hidden sm:inline font-medium truncate">* {product.country_name}</span>
                        </div>

                        {/* View Button */}
                        <button
                          onClick={() => setSelectedProduct(product)}
                          className="w-full px-3 sm:px-4 py-2 sm:py-2.5 min-h-[36px] sm:min-h-[40px] bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs sm:text-sm rounded-lg transition-colors shadow-sm"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Product Details Modal */}
        {selectedProduct && !showPurchaseModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-slate-800 rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-700">
              <div className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-100">{selectedProduct.brand_name}</h2>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors -mr-2"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-300" />
                  </button>
                </div>

                {selectedProduct.product_image && (
                  <img
                    src={selectedProduct.product_image}
                    alt={selectedProduct.brand_name}
                    className="w-full h-48 sm:h-64 object-contain bg-white rounded-lg mb-4 sm:mb-6"
                  />
                )}

                <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-400 mb-1">Country</h3>
                      <p className="text-sm sm:text-base text-slate-100">{selectedProduct.country_name}</p>
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-400 mb-1">Currency</h3>
                      <p className="text-sm sm:text-base text-slate-100">{selectedProduct.currency}</p>
                    </div>
                  </div>

                  {selectedProduct.denominations && Array.isArray(selectedProduct.denominations) && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-400 mb-2">Available Denominations</h3>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {selectedProduct.denominations.map((denom: number, idx: number) => (
                          <span key={idx} className="bg-slate-700 text-slate-200 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium">
                            {selectedProduct.currency} {denom}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedProduct.value_restrictions && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-400 mb-1">Value Range</h3>
                      <p className="text-sm sm:text-base text-slate-100">
                        {selectedProduct.currency} {selectedProduct.value_restrictions.min} - {selectedProduct.value_restrictions.max}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setShowPurchaseModal(true);
                  }}
                  className="w-full px-6 py-3 min-h-[48px] bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg transition-colors"
                >
                  Redeem with Tokens
                </button>
              </div>
            </div>
          </div>
        )}

        {showPurchaseModal && selectedProduct && (
          <PurchaseModal
            product={selectedProduct}
            usdcBalance={usdcBalance}
            onClose={() => {
              setShowPurchaseModal(false);
              setSelectedProduct(null);
            }}
            onPurchaseComplete={(orderId, email, orderToken) => {
              setShowPurchaseModal(false);
              setCurrentOrderId(orderId);
              setCurrentUserEmail(email);
              setCurrentOrderToken(orderToken);
              setShowOrderStatusModal(true);
              refetchBalance();
            }}
          />
        )}

        {showOrderStatusModal && currentOrderId && (
          <OrderStatusModal
            orderId={currentOrderId}
            orderToken={currentOrderToken}
            userEmail={currentUserEmail}
            onClose={() => {
              setShowOrderStatusModal(false);
              setCurrentOrderId(null);
              setCurrentUserEmail('');
              setCurrentOrderToken('');
              setSelectedProduct(null);
            }}
          />
        )}
      </div>

      {/* On-Ramp Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-800/95 backdrop-blur-md border-t border-slate-700">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          {/* Left: USDC Balance (when authenticated) */}
          {authenticated && embeddedWallet ? (
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs">$</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">USDC Balance</p>
                <p className="text-sm sm:text-base font-bold text-slate-100 truncate">
                  {balanceLoading ? '...' : usdcBalance !== null ? parseFloat(usdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                </p>
              </div>
              <button
                onClick={() => setShowSendModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-semibold rounded-lg transition-colors border border-indigo-500/30 flex-shrink-0"
                title="Send USDC"
              >
                <Send className="w-3 h-3" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          ) : (
            <div />
          )}
        </div>
      </div>

      {/* Wallet View Modal */}
      {showWalletView && embeddedWallet && (
        <WalletViewModal
          onClose={() => setShowWalletView(false)}
          onOpenSendModal={(token: 'usdc' | 'eth') => {
            if (token === 'eth') {
              setShowSendEthModal(true);
            } else {
              setShowSendModal(true);
            }
          }}
          walletAddress={embeddedWallet.address}
          userEmail={user?.email?.address || user?.google?.email || 'Connected'}
          usdcBalance={usdcBalance}
          ethBalance={ethBalance}
          balanceLoading={balanceLoading}
          onRefreshBalance={refetchBalance}
          onExportWallet={exportWallet}
        />
      )}

      {/* Send USDC Modal */}
      {showSendModal && embeddedWallet && (
        <SendUsdcModal
          onClose={() => setShowSendModal(false)}
          walletAddress={embeddedWallet.address}
          currentBalance={usdcBalance}
          onTransactionComplete={refetchBalance}
        />
      )}

      {/* Send ETH Modal */}
      {showSendEthModal && embeddedWallet && (
        <SendEthModal
          onClose={() => setShowSendEthModal(false)}
          walletAddress={embeddedWallet.address}
          currentBalance={ethBalance}
          onTransactionComplete={refetchBalance}
        />
      )}
    </>
  );
}
