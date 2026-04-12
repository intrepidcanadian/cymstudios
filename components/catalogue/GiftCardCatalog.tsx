'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import Link from 'next/link';
import { BrandProduct } from '@/lib/types/catalogue';
import PurchaseModal from './PurchaseModal';
import OrderStatusModal from './OrderStatusModal';
import { SlidersHorizontal, X, Shield, Wallet, LogOut, CreditCard, Send, Clock, ArrowUp, AlertCircle } from 'lucide-react';
import { useAccount, useDisconnect, useWalletClient } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { NETWORKS, DEFAULT_NETWORK } from '@/config/networks';
import WalletViewModal from './WalletViewModal';
import SendUsdcModal from './SendUsdcModal';
import SendEthModal from './SendEthModal';
import OrderHistoryList from './OrderHistoryList';

/** Memoized product card — avoids re-render when filter/sort changes but this card's data hasn't */
const ProductCard = memo(function ProductCard({
  product,
  isLiked,
  onToggleLike,
  onSelect,
}: {
  product: BrandProduct;
  isLiked: boolean;
  onToggleLike: (id: string) => void;
  onSelect: (product: BrandProduct) => void;
}) {
  return (
    <div
      className="group relative bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:shadow-xl hover:shadow-indigo-500/10 hover:border-slate-600 transition-all duration-300"
    >
      {/* Like Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleLike(String(product.product_id));
        }}
        aria-label={`${isLiked ? 'Unlike' : 'Like'} ${product.brand_name}`}
        className="absolute top-2 sm:top-3 right-2 sm:right-3 z-10 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-900/80 flex items-center justify-center hover:bg-slate-900 transition-colors shadow-lg border border-slate-700"
      >
        {isLiked ? (
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
      <div className="relative h-32 sm:h-56 bg-white overflow-hidden cursor-pointer" onClick={() => onSelect(product)}>
        {product.product_image ? (
          <img
            src={product.product_image}
            alt={product.brand_name}
            loading="lazy"
            className="w-full h-full object-contain p-3 sm:p-6 group-hover:scale-110 transition-transform duration-500"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-slate-700"><span class="text-4xl sm:text-7xl text-slate-400">Reward</span></div>'; }}
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

        {/* Denominations or Value Range */}
        {product.denominations && Array.isArray(product.denominations) && product.denominations.length > 0 ? (
          <div className="mb-2 sm:mb-3">
            <div className="flex flex-wrap gap-1 sm:gap-1.5">
              {product.denominations.slice(0, 2).map((denom: number, idx: number) => (
                <span key={idx} className="text-[10px] sm:text-xs bg-slate-700 text-slate-300 font-medium px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md">
                  {product.currency} {denom}
                </span>
              ))}
              <span className="hidden sm:inline">
                {product.denominations.length > 2 && product.denominations[2] && (
                  <span className="text-xs bg-slate-700 text-slate-300 font-medium px-2.5 py-1 rounded-md">
                    {product.currency} {product.denominations[2]}
                  </span>
                )}
              </span>
              {product.denominations.length > 2 && (
                <span className="sm:hidden text-[10px] text-slate-500 px-1 py-0.5 font-medium">
                  +{product.denominations.length - 2}
                </span>
              )}
              {product.denominations.length > 3 && (
                <span className="hidden sm:inline text-xs text-slate-500 px-2 py-1 font-medium">
                  +{product.denominations.length - 3}
                </span>
              )}
            </div>
          </div>
        ) : product.value_restrictions ? (
          <div className="mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs bg-slate-700 text-slate-300 font-medium px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md">
              {product.currency} {product.value_restrictions.minVal || product.value_restrictions.min}–{product.value_restrictions.maxVal || product.value_restrictions.max}
            </span>
          </div>
        ) : null}

        {/* Country & Currency */}
        <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-slate-400 mb-2 sm:mb-3 pb-2 sm:pb-3 border-b border-slate-700">
          <span className="font-medium truncate">{product.currency}</span>
          <span className="hidden sm:inline font-medium truncate">* {product.country_name}</span>
        </div>

        {/* View Button */}
        <button
          onClick={() => onSelect(product)}
          className="w-full px-3 sm:px-4 py-2 sm:py-2.5 min-h-[36px] sm:min-h-[40px] bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs sm:text-sm rounded-lg transition-colors shadow-sm"
        >
          <span className="sm:hidden">View</span>
          <span className="hidden sm:inline">View & Redeem</span>
        </button>
      </div>
    </div>
  );
});

export default function GiftCardCatalog() {
  const { address, isConnected, status: accountStatus } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();
  const { data: walletClient } = useWalletClient();
  const walletReady = accountStatus !== 'reconnecting';
  const [selectedNetwork, setSelectedNetwork] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('preferredNetwork');
      if (saved && NETWORKS[saved]) return saved;
    }
    return DEFAULT_NETWORK;
  });
  const { balance: usdcBalance, ethBalance, loading: balanceLoading, refetch: refetchBalance, tokenSymbol } = useUsdcBalance(address, selectedNetwork);

  // Get the raw EIP-1193 provider from walletClient for x402 signing
  const walletProvider = (walletClient as any)?.transport;

  const [brands, setBrands] = useState<BrandProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<BrandProduct | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'giftcards' | 'mastercards' | 'orders'>('giftcards');

  // Mastercard state
  const [mastercards, setMastercards] = useState<BrandProduct[]>([]);
  const [loadingMastercards, setLoadingMastercards] = useState(false);
  const [mastercardsFetched, setMastercardsFetched] = useState(false);
  const [mastercardFetchError, setMastercardFetchError] = useState<string | null>(null);

  // Filters
  const [countryFilter, setCountryFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('catalogCountryFilter') || 'all';
    }
    return 'all';
  });
  const [currencyFilter, setCurrencyFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('catalogCurrencyFilter') || 'all';
    }
    return 'all';
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedBrandFilters, setSelectedBrandFilters] = useState<string[]>([]);
  const [showUniqueBrandsOnly, setShowUniqueBrandsOnly] = useState<boolean>(true);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [showAllBrands, setShowAllBrands] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState<'default' | 'az' | 'za'>('default');
  const [likedProducts, setLikedProducts] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('likedProducts');
        return saved ? new Set(JSON.parse(saved)) : new Set();
      } catch { return new Set(); }
    }
    return new Set();
  });

  // Mobile filter drawer state
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const productDetailRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

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
  const [currentPaymentTxHash, setCurrentPaymentTxHash] = useState<string>('');
  const [purchaseInitialAmount, setPurchaseInitialAmount] = useState<string>('');
  const [hasNewOrders, setHasNewOrders] = useState(false);

  // Persist filter selections to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('catalogCountryFilter', countryFilter);
      localStorage.setItem('catalogCurrencyFilter', currencyFilter);
    }
  }, [countryFilter, currencyFilter]);

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

  // Focus trap + Escape handler for product detail modal
  useEffect(() => {
    if (!selectedProduct || showPurchaseModal) return;
    const el = productDetailRef.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>('button, input, [tabindex]');
    first?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedProduct(null); return; }
      if (e.key !== 'Tab') return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedProduct, showPurchaseModal]);

  // Back-to-top visibility based on main scroll position
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const handleScroll = () => setShowBackToTop(el.scrollTop > 800);
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch brands
  useEffect(() => {
    fetchBrands();
  }, [countryFilter, currencyFilter]);

  const fetchBrands = async () => {
    try {
      setLoading(true);
      setFetchError(null);
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
      setFetchError('Failed to load products. Please check your connection and try again.');
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
      setMastercardFetchError(null);
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
      setMastercardFetchError('Failed to load Mastercard products. Please check your connection and try again.');
    } finally {
      setLoadingMastercards(false);
    }
  };

  // No embedded wallet creation needed — WalletConnect connects to user's existing wallet

  const brandsArray = Array.isArray(brands) ? brands : [];

  // Get unique brand names
  const allUniqueBrands = Array.from(new Set(brandsArray.map(b => b.brand_name))).sort();

  // Derive filter options dynamically from fetched brands data
  const availableCountries = Array.from(new Set(brandsArray.map(b => b.country_name).filter((c): c is string => !!c))).sort();
  const availableCurrencies = Array.from(new Set(brandsArray.map(b => b.currency).filter((c): c is string => !!c))).sort();

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

  if (showFavoritesOnly) {
    filteredProducts = filteredProducts.filter(b => likedProducts.has(String(b.product_id)));
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

  // Apply sorting
  if (sortOrder === 'az') {
    filteredProducts = [...filteredProducts].sort((a, b) => a.brand_name.localeCompare(b.brand_name));
  } else if (sortOrder === 'za') {
    filteredProducts = [...filteredProducts].sort((a, b) => b.brand_name.localeCompare(a.brand_name));
  }

  const toggleBrandFilter = (brandName: string) => {
    setSelectedBrandFilters(prev =>
      prev.includes(brandName)
        ? prev.filter(b => b !== brandName)
        : [...prev, brandName]
    );
  };

  const toggleLike = useCallback((productId: string) => {
    setLikedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('likedProducts', JSON.stringify(Array.from(newSet)));
      }
      return newSet;
    });
  }, []);

  const selectProduct = useCallback((product: BrandProduct) => {
    setSelectedProduct(product);
  }, []);

  // Count active filters for badge
  const activeFilterCount =
    (countryFilter !== 'all' ? 1 : 0) +
    (currencyFilter !== 'all' ? 1 : 0) +
    selectedBrandFilters.length +
    (searchQuery ? 1 : 0) +
    (showFavoritesOnly ? 1 : 0);

  // Filter content component to avoid duplication
  const filterContent = (
    <div className="space-y-6 sm:space-y-8">
      {/* Search */}
      <div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search for a brand..."
            aria-label="Search gift card brands"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-11 pr-4 py-3 min-h-[44px] border-2 border-slate-600 rounded-lg text-sm text-slate-100 placeholder:text-slate-400 bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none hover:border-slate-500 transition-colors"
          />
          {searchInput && searchInput !== searchQuery ? (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-slate-500 border-t-indigo-400 rounded-full animate-spin" />
          ) : (
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
      </div>

      {/* Sort Order */}
      <div>
        <h3 className="text-base font-bold text-slate-100 mb-4 pb-3 border-b-2 border-slate-600">Sort</h3>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'default' | 'az' | 'za')}
          className="w-full px-4 py-3 min-h-[44px] border-2 border-slate-600 rounded-lg text-sm font-medium text-slate-100 bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none hover:border-slate-500 transition-colors"
        >
          <option value="default">Default</option>
          <option value="az">Name A–Z</option>
          <option value="za">Name Z–A</option>
        </select>
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
            <span className="text-xs text-slate-400 block mt-1">
              {showUniqueBrandsOnly
                ? `Showing 1 product per brand`
                : `Showing all product variations`}
            </span>
          </div>
        </label>
      </div>

      {/* Show Favorites Only Toggle */}
      {likedProducts.size > 0 && (
        <div>
          <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/50 p-3 rounded-lg transition-colors border-2 border-slate-600">
            <input
              type="checkbox"
              checked={showFavoritesOnly}
              onChange={(e) => setShowFavoritesOnly(e.target.checked)}
              className="w-5 h-5 text-red-500 border-slate-500 rounded focus:ring-red-500 bg-slate-700"
            />
            <div className="flex-1">
              <span className="text-sm font-bold text-slate-100 block">Favorites Only</span>
              <span className="text-xs text-slate-400 block mt-1">Show {likedProducts.size} liked product{likedProducts.size !== 1 ? 's' : ''}</span>
            </div>
          </label>
        </div>
      )}

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
          {(showAllBrands ? allUniqueBrands : allUniqueBrands.slice(0, 30)).map((brandName) => (
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
            <button
              onClick={() => setShowAllBrands(prev => !prev)}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-bold ml-2"
            >
              {showAllBrands ? 'Show Less' : `View All (${allUniqueBrands.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Clear Filters */}
      {(selectedBrandFilters.length > 0 || countryFilter !== 'all' || currencyFilter !== 'all' || searchQuery || showUniqueBrandsOnly || showFavoritesOnly || sortOrder !== 'default') && (
        <button
          onClick={() => {
            setSelectedBrandFilters([]);
            setCountryFilter('all');
            setCurrencyFilter('all');
            setSearchQuery('');
            setSearchInput('');
            setShowUniqueBrandsOnly(false);
            setShowFavoritesOnly(false);
            setSortOrder('default');
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

              {/* Wallet Auth Section */}
              <div className="mb-6 p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                {!walletReady ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                    Initializing...
                  </div>
                ) : isConnected && address ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                        <Wallet className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => setShowWalletView(true)}
                          className="text-xs font-medium text-slate-200 truncate hover:text-indigo-400 transition-colors cursor-pointer text-left w-full block"
                          title="View wallet details"
                        >
                          Connected
                        </button>
                        <button
                          onClick={() => setShowWalletView(true)}
                          className="text-[10px] text-slate-400 hover:text-indigo-400 font-mono truncate transition-colors cursor-pointer text-left w-full block"
                          title="View wallet details"
                        >
                          {address.slice(0, 6)}...{address.slice(-4)}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => disconnect()}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 py-1.5 rounded hover:bg-slate-700/50 transition-colors"
                    >
                      <LogOut className="w-3 h-3" />
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => open()}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <Wallet className="w-4 h-4" />
                    Connect Wallet
                  </button>
                )}
              </div>

              {filterContent}
            </div>
          </aside>

          {/* Mobile Filter Bottom Sheet */}
          {showMobileFilters && (
            <div
              className="fixed inset-0 z-50 lg:hidden"
              onKeyDown={(e) => { if (e.key === 'Escape') setShowMobileFilters(false); }}
            >
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
          <main ref={mainRef} className="flex-1 overflow-y-auto bg-slate-900">
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
                <button
                  onClick={() => { setActiveTab('orders'); setHasNewOrders(false); }}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'orders'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  My Orders
                  {hasNewOrders && activeTab !== 'orders' && (
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  )}
                </button>
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
                  {/* Sort control — gift cards tab only */}
                  {activeTab === 'giftcards' && (
                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value as 'default' | 'az' | 'za')}
                      className="hidden sm:block px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none hover:border-slate-500 transition-colors"
                    >
                      <option value="default">Sort: Default</option>
                      <option value="az">Name A–Z</option>
                      <option value="za">Name Z–A</option>
                    </select>
                  )}
                  {/* Mobile Wallet Auth */}
                  <div className="lg:hidden">
                    {walletReady && !isConnected ? (
                      <button
                        onClick={() => open()}
                        className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-lg transition-colors"
                      >
                        <Wallet className="w-4 h-4" />
                        Connect
                      </button>
                    ) : walletReady && isConnected ? (
                      <button
                        onClick={() => setShowWalletView(true)}
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

              {/* Active filter chips (quick-remove without opening filter panel) */}
              {activeTab === 'giftcards' && activeFilterCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-900/40 border border-indigo-700/50 rounded-full text-xs text-indigo-300">
                      Search: &quot;{searchQuery}&quot;
                      <button onClick={() => { setSearchQuery(''); setSearchInput(''); }} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {countryFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-900/40 border border-indigo-700/50 rounded-full text-xs text-indigo-300">
                      {countryFilter}
                      <button onClick={() => setCountryFilter('all')} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {currencyFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-900/40 border border-indigo-700/50 rounded-full text-xs text-indigo-300">
                      {currencyFilter}
                      <button onClick={() => setCurrencyFilter('all')} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {selectedBrandFilters.map(brand => (
                    <span key={brand} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-900/40 border border-indigo-700/50 rounded-full text-xs text-indigo-300">
                      {brand}
                      <button onClick={() => toggleBrandFilter(brand)} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {showFavoritesOnly && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-900/40 border border-red-700/50 rounded-full text-xs text-red-300">
                      Favorites
                      <button onClick={() => setShowFavoritesOnly(false)} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {activeFilterCount > 1 && (
                    <button
                      onClick={() => { setSelectedBrandFilters([]); setCountryFilter('all'); setCurrencyFilter('all'); setSearchQuery(''); setSearchInput(''); setShowFavoritesOnly(false); setSortOrder('default'); }}
                      className="text-xs text-slate-400 hover:text-slate-200 underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}

              {/* Tab Content */}
              {activeTab === 'orders' ? (
                <OrderHistoryList
                  walletAddress={address}
                  onViewOrder={(orderId, orderToken, email) => {
                    setCurrentOrderId(orderId);
                    setCurrentOrderToken(orderToken);
                    setCurrentUserEmail(email);
                    setShowOrderStatusModal(true);
                  }}
                />
              ) : activeTab === 'mastercards' ? (
                loadingMastercards ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden animate-pulse">
                        <div className="h-40 sm:h-56 bg-slate-700" />
                        <div className="p-4 border-t border-slate-700 space-y-3">
                          <div className="h-4 bg-slate-700 rounded w-3/4" />
                          <div className="h-3 bg-slate-700 rounded w-1/3" />
                          <div className="h-12 bg-slate-700 rounded-lg" />
                          <div className="h-3 bg-slate-700 rounded w-2/3" />
                          <div className="h-10 bg-slate-700 rounded-lg" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : mastercardFetchError ? (
                  <div className="text-center py-20">
                    <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-100 mb-2">Something went wrong</h3>
                    <p className="text-slate-400 mb-6">{mastercardFetchError}</p>
                    <button
                      onClick={fetchMastercards}
                      className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors"
                    >
                      Try Again
                    </button>
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
                              loading="lazy"
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
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden animate-pulse">
                      <div className="h-32 sm:h-56 bg-slate-700" />
                      <div className="p-2.5 sm:p-4 border-t border-slate-700 space-y-2 sm:space-y-3">
                        <div className="h-4 bg-slate-700 rounded w-3/4" />
                        <div className="h-3 bg-slate-700 rounded w-1/2 hidden sm:block" />
                        <div className="flex gap-1.5 hidden sm:flex">
                          <div className="h-6 bg-slate-700 rounded w-16" />
                          <div className="h-6 bg-slate-700 rounded w-16" />
                        </div>
                        <div className="h-3 bg-slate-700 rounded w-2/3" />
                        <div className="h-9 sm:h-10 bg-slate-700 rounded-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : fetchError ? (
                <div className="text-center py-20">
                  <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-100 mb-2">Something went wrong</h3>
                  <p className="text-slate-400 mb-6">{fetchError}</p>
                  <button
                    onClick={fetchBrands}
                    className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : filteredProducts.length === 0 && showFavoritesOnly ? (
                <div className="text-center py-20">
                  <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <h3 className="text-xl font-bold text-slate-100 mb-2">No favorites match your filters</h3>
                  <p className="text-slate-400 mb-6">Try removing country or currency filters, or browse all products to add more favorites.</p>
                  <button
                    onClick={() => setShowFavoritesOnly(false)}
                    className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors"
                  >
                    Show All Products
                  </button>
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
                    <ProductCard
                      key={product.product_id}
                      product={product}
                      isLiked={likedProducts.has(String(product.product_id))}
                      onToggleLike={toggleLike}
                      onSelect={selectProduct}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Back to Top FAB */}
            {showBackToTop && (
              <button
                onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                className="fixed bottom-20 right-4 sm:right-8 z-30 w-10 h-10 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all"
                aria-label="Back to top"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            )}
          </main>
        </div>

        {/* Product Details Modal */}
        {selectedProduct && !showPurchaseModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => setSelectedProduct(null)}>
            <div ref={productDetailRef} role="dialog" aria-modal="true" aria-label={`${selectedProduct.brand_name} details`} className="bg-slate-800 rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-700" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-100">{selectedProduct.brand_name}</h2>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    aria-label="Close"
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
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}

                <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                  {/* Product Description */}
                  {selectedProduct.product_description && (
                    <p className="text-sm text-slate-300 leading-relaxed">{selectedProduct.product_description}</p>
                  )}

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
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-400 mb-2">Quick Buy — tap a denomination</h3>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {selectedProduct.denominations.map((denom: number, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setPurchaseInitialAmount(String(denom));
                              setShowPurchaseModal(true);
                            }}
                            className="bg-slate-700 hover:bg-indigo-600 text-slate-200 hover:text-white px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors border border-slate-600 hover:border-indigo-500"
                          >
                            {selectedProduct.currency} {denom}
                          </button>
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

                {/* Inline amount input for variable-amount cards (no denominations) */}
                {selectedProduct.value_restrictions && (!selectedProduct.denominations || !Array.isArray(selectedProduct.denominations) || selectedProduct.denominations.length === 0) && (
                  <>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Amount ({selectedProduct.currency})</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder={`${selectedProduct.value_restrictions.minVal || selectedProduct.value_restrictions.min} - ${selectedProduct.value_restrictions.maxVal || selectedProduct.value_restrictions.max}`}
                          value={purchaseInitialAmount}
                          onChange={(e) => setPurchaseInitialAmount(e.target.value)}
                          onBlur={() => {
                            const val = parseFloat(purchaseInitialAmount);
                            if (!isNaN(val) && val > 0) {
                              setPurchaseInitialAmount(val.toFixed(2));
                            }
                          }}
                          className="w-full px-3 py-2.5 border-2 border-slate-600 rounded-lg bg-slate-700 text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-semibold"
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (purchaseInitialAmount) setShowPurchaseModal(true);
                        }}
                        disabled={!purchaseInitialAmount}
                        className="px-5 py-2.5 min-h-[42px] bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors text-sm"
                      >
                        Buy Now
                      </button>
                    </div>
                    <div className="flex items-center gap-3 my-2">
                      <div className="flex-1 h-px bg-slate-700" />
                      <span className="text-xs text-slate-500 font-medium">or</span>
                      <div className="flex-1 h-px bg-slate-700" />
                    </div>
                  </>
                )}

                <button
                  onClick={() => {
                    if (!purchaseInitialAmount) setPurchaseInitialAmount('');
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
            selectedNetwork={selectedNetwork}
            onNetworkChange={(net: string) => {
              setSelectedNetwork(net);
              if (typeof window !== 'undefined') localStorage.setItem('preferredNetwork', net);
            }}
            walletProvider={walletProvider}
            onRefreshBalance={refetchBalance}
            initialAmount={purchaseInitialAmount}
            onClose={() => {
              setShowPurchaseModal(false);
              setPurchaseInitialAmount('');
              // Keep selectedProduct so user returns to product detail modal
            }}
            onPurchaseComplete={(orderId, email, orderToken, paymentTxHash) => {
              setShowPurchaseModal(false);
              setCurrentOrderId(orderId);
              setCurrentUserEmail(email);
              setCurrentOrderToken(orderToken);
              setCurrentPaymentTxHash(paymentTxHash || '');
              setShowOrderStatusModal(true);
              setHasNewOrders(true);
              refetchBalance();
            }}
          />
        )}

        {showOrderStatusModal && currentOrderId && (
          <OrderStatusModal
            orderId={currentOrderId}
            orderToken={currentOrderToken}
            userEmail={currentUserEmail}
            paymentTxHash={currentPaymentTxHash || undefined}
            onClose={() => {
              setShowOrderStatusModal(false);
              setCurrentOrderId(null);
              setCurrentUserEmail('');
              setCurrentOrderToken('');
              setCurrentPaymentTxHash('');
              setSelectedProduct(null);
            }}
          />
        )}
      </div>

      {/* On-Ramp Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-800/95 backdrop-blur-md border-t border-slate-700">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          {/* Left: USDC Balance (when authenticated) */}
          {isConnected && address ? (
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs">$</span>
                <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-bold bg-slate-700 text-slate-300 px-1 rounded border border-slate-600 leading-tight">
                  {selectedNetwork === 'conflux' ? 'CFX' : selectedNetwork === 'base' ? 'Base' : 'ETH'}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{tokenSymbol} Balance <span className="text-indigo-400">({NETWORKS[selectedNetwork]?.name})</span></p>
                <p className="text-sm sm:text-base font-bold text-slate-100 truncate">
                  {balanceLoading ? (
                    <span className="inline-block w-20 h-5 bg-slate-700 rounded animate-pulse" />
                  ) : usdcBalance !== null ? parseFloat(usdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                </p>
              </div>
              {ethBalance !== null && ethBalance !== undefined && (
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-slate-700/50 rounded-lg border border-slate-600 flex-shrink-0">
                  <span className="text-[10px] text-slate-400">{NETWORKS[selectedNetwork]?.nativeSymbol || 'ETH'}</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {parseFloat(ethBalance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                  </span>
                </div>
              )}
              <button
                onClick={() => setShowSendModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-semibold rounded-lg transition-colors border border-indigo-500/30 flex-shrink-0"
                title="Send USDC"
              >
                <Send className="w-3 h-3" />
                <span className="hidden sm:inline">Send {tokenSymbol}</span>
              </button>
              {/* Compact network switcher — visible on all screen sizes */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {Object.entries(NETWORKS).map(([key, net]) => {
                  const shortLabel = key === 'ethereum' ? 'ETH' : key === 'base' ? 'Base' : 'CFX';
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedNetwork(key);
                        if (typeof window !== 'undefined') localStorage.setItem('preferredNetwork', key);
                      }}
                      disabled={showPurchaseModal}
                      className={`px-2 py-2 sm:py-1 min-w-[44px] min-h-[44px] sm:min-h-0 text-[10px] font-bold rounded transition-colors ${
                        selectedNetwork === key
                          ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
                          : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-slate-600'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                      title={showPurchaseModal ? 'Network locked during checkout' : `Switch to ${net.name}`}
                      aria-label={`Switch to ${net.name} (${net.tokenSymbol})`}
                    >
                      <span className="hidden sm:inline">{shortLabel} </span>{net.tokenSymbol}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div />
          )}
        </div>
      </div>

      {/* Wallet View Modal */}
      {showWalletView && address && (
        <WalletViewModal
          onClose={() => setShowWalletView(false)}
          onOpenSendModal={(token: 'usdc' | 'eth') => {
            if (token === 'eth') {
              setShowSendEthModal(true);
            } else {
              setShowSendModal(true);
            }
          }}
          walletAddress={address}
          userEmail="Connected"
          usdcBalance={usdcBalance}
          ethBalance={ethBalance}
          balanceLoading={balanceLoading}
          onRefreshBalance={refetchBalance}
          onExportWallet={() => open()}
          selectedNetwork={selectedNetwork}
        />
      )}

      {/* Send USDC Modal */}
      {showSendModal && address && (
        <SendUsdcModal
          onClose={() => setShowSendModal(false)}
          walletAddress={address}
          currentBalance={usdcBalance}
          onTransactionComplete={refetchBalance}
          selectedNetwork={selectedNetwork}
        />
      )}

      {/* Send ETH Modal */}
      {showSendEthModal && address && (
        <SendEthModal
          onClose={() => setShowSendEthModal(false)}
          walletAddress={address}
          currentBalance={ethBalance}
          onTransactionComplete={refetchBalance}
          selectedNetwork={selectedNetwork}
        />
      )}
    </>
  );
}
