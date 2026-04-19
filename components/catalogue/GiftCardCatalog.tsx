'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import Link from 'next/link';
import { BrandProduct } from '@/lib/types/catalogue';
import PurchaseModal from './PurchaseModal';
import OrderStatusModal from './OrderStatusModal';
import { SlidersHorizontal, X, Shield, Wallet, LogOut, CreditCard, Send, Clock, ArrowUp, AlertCircle, ChevronDown } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useAccount, useDisconnect, useWalletClient } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { NETWORKS, DEFAULT_NETWORK } from '@/config/networks';
import WalletViewModal from './WalletViewModal';
import SendUsdcModal from './SendUsdcModal';
import SendEthModal from './SendEthModal';
import OrderHistoryList from './OrderHistoryList';
import styles from './catalogue.module.css';

/** M27: Simple fuzzy matching — suggests brand names similar to a mistyped search query */
function suggestBrands(query: string, brandNames: string[], maxSuggestions = 3): string[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  // Score each brand by how well it matches the query
  const scored = brandNames.map(name => {
    const n = name.toLowerCase();
    // Exact substring match — highest priority
    if (n.includes(q)) return { name, score: 0 };
    // Check if query is a subsequence
    let qi = 0;
    for (let ni = 0; ni < n.length && qi < q.length; ni++) {
      if (n[ni] === q[qi]) qi++;
    }
    if (qi === q.length) return { name, score: 1 };
    // Simple edit distance for short queries (≤8 chars) — allow up to 2 edits
    if (q.length <= 8) {
      const maxLen = Math.max(q.length, n.length);
      let dist = 0;
      for (let i = 0; i < Math.min(q.length, n.length); i++) {
        if (q[i] !== n[i]) dist++;
      }
      dist += Math.abs(q.length - n.length);
      if (dist <= 2) return { name, score: 2 + dist };
      // Also check against first word of brand name
      const firstWord = n.split(/[\s-]/)[0];
      let fDist = 0;
      for (let i = 0; i < Math.min(q.length, firstWord.length); i++) {
        if (q[i] !== firstWord[i]) fDist++;
      }
      fDist += Math.abs(q.length - firstWord.length);
      if (fDist <= 2) return { name, score: 2 + fDist };
    }
    return { name, score: Infinity };
  });
  return scored
    .filter(s => s.score < Infinity)
    .sort((a, b) => a.score - b.score)
    .slice(0, maxSuggestions)
    .map(s => s.name);
}

/** M27: Empty search state with fuzzy brand suggestions */
function EmptySearchState({
  searchQuery,
  allBrandNames,
  onSelectSuggestion,
  onClearFilters,
}: {
  searchQuery: string;
  allBrandNames: string[];
  onSelectSuggestion: (name: string) => void;
  onClearFilters: () => void;
}) {
  const suggestions = searchQuery ? suggestBrands(searchQuery, allBrandNames) : [];
  return (
    <div className="text-center py-20">
      <h3 className="text-xl font-bold text-ink mb-2">No products found</h3>
      <p className="text-ink-dim mb-4">Try adjusting your filters or search query</p>
      {suggestions.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-ink-dim mb-2">Did you mean:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map(name => (
              <button
                key={name}
                onClick={() => onSelectSuggestion(name)}
                className="px-3 py-1.5 bg-ember-soft border border-ember-soft rounded-full text-sm text-ember hover:bg-ember-soft hover:text-ember transition-colors"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={onClearFilters}
        className="px-6 py-2 bg-ember hover:bg-ember text-white font-medium rounded-lg transition-colors"
      >
        Clear All Filters
      </button>
    </div>
  );
}

/** M26b: Convert ISO country code to emoji flag (e.g. "US" → "🇺🇸") */
function countryCodeToFlag(code: string | undefined | null): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  const first = 0x1F1E6 + upper.charCodeAt(0) - 65;
  const second = 0x1F1E6 + upper.charCodeAt(1) - 65;
  return String.fromCodePoint(first, second);
}

/** M26b: Map of country names to ISO 3166-1 alpha-2 codes for flag lookup */
const COUNTRY_CODE_MAP: Record<string, string> = {
  'United States': 'US', 'United States of America': 'US', 'United Kingdom': 'GB', 'Canada': 'CA', 'Australia': 'AU',
  'Germany': 'DE', 'France': 'FR', 'Italy': 'IT', 'Spain': 'ES', 'Netherlands': 'NL',
  'Belgium': 'BE', 'Austria': 'AT', 'Switzerland': 'CH', 'Sweden': 'SE', 'Norway': 'NO',
  'Denmark': 'DK', 'Finland': 'FI', 'Ireland': 'IE', 'Portugal': 'PT', 'Poland': 'PL',
  'Czech Republic': 'CZ', 'Greece': 'GR', 'Hungary': 'HU', 'Romania': 'RO',
  'Japan': 'JP', 'South Korea': 'KR', 'China': 'CN', 'Hong Kong': 'HK', 'Taiwan': 'TW',
  'Singapore': 'SG', 'Malaysia': 'MY', 'Thailand': 'TH', 'Philippines': 'PH',
  'India': 'IN', 'Indonesia': 'ID', 'Vietnam': 'VN', 'Turkey': 'TR', 'Türkiye': 'TR',
  'South Africa': 'ZA', 'Nigeria': 'NG', 'Kenya': 'KE', 'Egypt': 'EG', 'Ghana': 'GH',
  'Brazil': 'BR', 'Mexico': 'MX', 'Argentina': 'AR', 'Colombia': 'CO', 'Chile': 'CL',
  'Peru': 'PE', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE', 'Qatar': 'QA',
  'Kuwait': 'KW', 'Bahrain': 'BH', 'Oman': 'OM', 'Israel': 'IL', 'New Zealand': 'NZ',
  'Luxembourg': 'LU', 'Croatia': 'HR', 'Slovakia': 'SK', 'Slovenia': 'SI', 'Bulgaria': 'BG',
  'Serbia': 'RS', 'Ukraine': 'UA', 'Russia': 'RU', 'Pakistan': 'PK', 'Bangladesh': 'BD',
  'Sri Lanka': 'LK', 'Nepal': 'NP', 'Costa Rica': 'CR', 'Panama': 'PA', 'Jamaica': 'JM',
  'Global': '🌍', 'European Union': 'EU',
};

function getCountryFlag(countryName: string | undefined | null): string {
  if (!countryName) return '';
  if (countryName === 'Global') return '🌍';
  const code = COUNTRY_CODE_MAP[countryName];
  return code ? countryCodeToFlag(code) : '';
}

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
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`group relative bg-canvas-soft border border-line rounded-xl p-4 sm:p-5 hover:border-line-strong transition-all duration-300 ${styles.productCard}`}
    >
      {/* Like Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleLike(String(product.product_id));
        }}
        aria-label={`${isLiked ? 'Unlike' : 'Like'} ${product.brand_name}`}
        className="absolute top-3 sm:top-4 right-3 sm:right-4 z-10 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-canvas/70 backdrop-blur flex items-center justify-center hover:bg-canvas transition-colors border border-line"
      >
        {isLiked ? (
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 fill-current" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-ink-dim hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        )}
      </button>

      {/* Tilted gift-card art */}
      <div className={`cursor-pointer ${styles.cardArtWrap}`} onClick={() => onSelect(product)}>
        <div className={styles.cardArt} style={{ background: '#ffffff' }}>
          {product.product_image && !imgError ? (
            <img
              src={product.product_image}
              alt={product.brand_name}
              loading="lazy"
              style={{ objectFit: 'contain', padding: '14px' }}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-canvas-lift" role="img" aria-label={product.brand_name}>
              <span className="text-4xl sm:text-7xl text-ink-dim">Reward</span>
            </div>
          )}
        </div>
      </div>

      {/* Product Info */}
      <div>
        <div className="mb-2 sm:mb-3 cursor-pointer" onClick={() => onSelect(product)}>
          <h3 className="font-serif font-normal text-ink text-base sm:text-lg mb-0.5 sm:mb-1 leading-tight line-clamp-2 tracking-tight">
            {product.brand_name}
          </h3>
        </div>

        {/* Denominations or Value Range */}
        {product.denominations && Array.isArray(product.denominations) && product.denominations.length > 0 ? (
          <div className="mb-2 sm:mb-3">
            <div className="flex flex-wrap gap-1 sm:gap-1.5">
              {product.denominations.slice(0, 2).map((denom: number, idx: number) => (
                <span key={idx} className="text-[10px] sm:text-xs bg-canvas-lift text-ink-dim font-medium px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md">
                  {product.currency} {denom}
                </span>
              ))}
              <span className="hidden sm:inline">
                {product.denominations.length > 2 && product.denominations[2] && (
                  <span className="text-xs bg-canvas-lift text-ink-dim font-medium px-2.5 py-1 rounded-md">
                    {product.currency} {product.denominations[2]}
                  </span>
                )}
              </span>
              {product.denominations.length > 2 && (
                <span className="sm:hidden text-[10px] text-ink-mute px-1 py-0.5 font-medium">
                  +{product.denominations.length - 2}
                </span>
              )}
              {product.denominations.length > 3 && (
                <span className="hidden sm:inline text-xs text-ink-mute px-2 py-1 font-medium">
                  +{product.denominations.length - 3}
                </span>
              )}
            </div>
          </div>
        ) : product.value_restrictions ? (
          <div className="mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs bg-canvas-lift text-ink-dim font-medium px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md">
              {product.currency} {product.value_restrictions.minVal || product.value_restrictions.min}–{product.value_restrictions.maxVal || product.value_restrictions.max}
            </span>
          </div>
        ) : null}

        {/* Country & Currency */}
        <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-ink-dim mb-2 sm:mb-3 pb-2 sm:pb-3 border-b border-line cursor-pointer" onClick={() => onSelect(product)}>
          {getCountryFlag(product.country_name) && (
            <span className="flex-shrink-0" aria-hidden="true">{getCountryFlag(product.country_name)}</span>
          )}
          <span className="font-medium truncate">{product.currency} · {product.country_name}</span>
        </div>

        {/* View Button */}
        <button
          onClick={() => onSelect(product)}
          className="w-full px-3 sm:px-4 py-2 sm:py-2.5 min-h-[36px] sm:min-h-[40px] bg-ember hover:bg-ember text-white font-semibold text-xs sm:text-sm rounded-lg transition-colors shadow-sm"
          aria-label={`View and redeem ${product.brand_name}`}
        >
          <span className="sm:hidden">View</span>
          <span className="hidden sm:inline">View & Redeem</span>
        </button>
      </div>
    </div>
  );
});

/** Product detail modal image with React-based fallback */
function DetailImage({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false);
  if (error) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="w-full h-48 sm:h-64 object-contain bg-white rounded-lg mb-4 sm:mb-6"
      onError={() => setError(true)}
    />
  );
}

/** Recently viewed card with React-based image fallback */
function RecentlyViewedCard({ product, onSelect }: { product: BrandProduct; onSelect: (p: BrandProduct) => void }) {
  const [imgError, setImgError] = useState(false);
  return (
    <button
      onClick={() => onSelect(product)}
      className="bg-canvas-soft border border-line rounded-lg overflow-hidden hover:border-line-strong transition-colors text-left"
    >
      <div className="h-14 sm:h-20 bg-white overflow-hidden">
        {product.product_image && !imgError ? (
          <img src={product.product_image} alt={product.brand_name} loading="lazy" className="w-full h-full object-contain p-1.5 sm:p-2" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-canvas-lift" role="img" aria-label={product.brand_name}>
            <span className="text-sm sm:text-lg text-ink-dim">Reward</span>
          </div>
        )}
      </div>
      <div className="p-1 sm:p-2">
        <p className="text-[9px] sm:text-xs font-medium text-ink truncate">{product.brand_name}</p>
        <p className="text-[8px] sm:text-[10px] text-ink-dim">{product.currency}</p>
      </div>
    </button>
  );
}

/** Mastercard image with React-based fallback (no innerHTML injection) */
function MastercardImage({ product, onSelect }: { product: BrandProduct; onSelect: () => void }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div className="relative h-40 sm:h-56 bg-gradient-to-br from-canvas to-canvas-soft overflow-hidden cursor-pointer flex items-center justify-center group" onClick={onSelect}>
      {product.product_image && !imgError ? (
        <img
          src={product.product_image}
          alt={product.brand_name}
          loading="lazy"
          className="w-full h-full object-contain p-4 sm:p-6 [@media(hover:hover)]:group-hover:scale-105 transition-transform duration-500"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-3" role="img" aria-label={product.brand_name}>
          <CreditCard className="w-16 h-16 text-orange-400" />
          <span className="text-lg font-bold text-ink-dim">Mastercard Prepaid</span>
        </div>
      )}
    </div>
  );
}

export default function GiftCardCatalog() {
  const { address, isConnected, status: accountStatus } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();
  const { data: walletClient } = useWalletClient();
  const [walletTimedOut, setWalletTimedOut] = useState(false);
  const walletReady = accountStatus !== 'reconnecting' || walletTimedOut;

  // M17: Timeout wallet initialization after 15 seconds
  useEffect(() => {
    if (accountStatus !== 'reconnecting') {
      setWalletTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setWalletTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [accountStatus]);

  const [selectedNetwork, setSelectedNetwork] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('preferredNetwork');
        if (saved && NETWORKS[saved]) return saved;
      } catch { /* localStorage unavailable or full */ }
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
      try { return localStorage.getItem('catalogCountryFilter') || 'all'; } catch { /* ignore */ }
    }
    return 'all';
  });
  const [currencyFilter, setCurrencyFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try { return localStorage.getItem('catalogCurrencyFilter') || 'all'; } catch { /* ignore */ }
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

  // Recently viewed collapse state
  const [recentlyViewedCollapsed, setRecentlyViewedCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try { return localStorage.getItem('recentlyViewedCollapsed') === 'true'; } catch { /* ignore */ }
    }
    return false;
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

  // Cached exchange rates for denomination token cost previews (display only)
  const [fxRateCache, setFxRateCache] = useState<Record<string, number>>({});
  const fxFetchedRef = useRef<Set<string>>(new Set());
  const fetchFxForCurrency = useCallback((currency: string) => {
    if (currency === 'USD' || fxFetchedRef.current.has(currency)) return;
    fxFetchedRef.current.add(currency);
    fetch(`/api/exchange-rate?from=${currency}&to=USD`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.rate) {
          setFxRateCache(prev => ({ ...prev, [currency]: data.rate }));
        }
      })
      .catch(() => { /* display-only — silent fail */ });
  }, []);

  // Fetch FX rate when product detail modal opens (for denomination cost preview)
  useEffect(() => {
    if (selectedProduct && selectedProduct.currency && selectedProduct.currency !== 'USD') {
      fetchFxForCurrency(selectedProduct.currency);
    }
  }, [selectedProduct, fetchFxForCurrency]);

  // Helper: estimate token cost for a denomination amount
  const estimateTokenCost = useCallback((denomAmount: number, currency: string): string | null => {
    const fee = currency === 'USD' ? 0.005 : 0.015; // 0.5% USD, 1.5% non-USD
    if (currency === 'USD') {
      return (Math.ceil(denomAmount * (1 + fee) * 100) / 100).toFixed(2);
    }
    const rate = fxRateCache[currency];
    if (!rate) return null;
    // rate is "1 fromCurrency = rate USD" (from /api/exchange-rate), so multiply
    const usdValue = denomAmount * rate;
    return (Math.ceil(usdValue * (1 + fee) * 100) / 100).toFixed(2);
  }, [fxRateCache]);

  // M11: Facilitator gas health — warn users before they attempt a purchase on a network with low gas
  const [facilitatorHealth, setFacilitatorHealth] = useState<Record<string, boolean>>({});
  const [facilitatorHealthReason, setFacilitatorHealthReason] = useState<Record<string, string>>({});
  const [facilitatorHealthLoaded, setFacilitatorHealthLoaded] = useState(false);
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const resp = await fetch('/api/facilitator-health');
        const data = await resp.json();
        if (data.networks) {
          const health: Record<string, boolean> = {};
          const reasons: Record<string, string> = {};
          for (const [key, val] of Object.entries(data.networks) as [string, { healthy: boolean; reason?: string }][]) {
            health[key] = val.healthy;
            if (val.reason) reasons[key] = val.reason;
          }
          setFacilitatorHealth(health);
          setFacilitatorHealthReason(reasons);
          setFacilitatorHealthLoaded(true);
        }
      } catch {
        // On health-check failure, mark all networks as potentially unhealthy
        // so users see warning rather than silently proceeding
        if (!facilitatorHealthLoaded) {
          const unhealthy: Record<string, boolean> = {};
          for (const key of Object.keys(NETWORKS)) unhealthy[key] = false;
          setFacilitatorHealth(unhealthy);
        }
        // If we had a previous successful check, keep those values (don't override with false)
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 120_000); // re-check every 2 min
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedNetworkHealthy = facilitatorHealth[selectedNetwork] !== false;

  // Persist filter selections to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('catalogCountryFilter', countryFilter);
        localStorage.setItem('catalogCurrencyFilter', currencyFilter);
      } catch { /* localStorage full or unavailable */ }
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
    // Scroll modal content to top when product changes
    el.scrollTop = 0;
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
        if (process.env.NODE_ENV === 'development') console.warn('Unexpected data format:', result);
        setBrands([]);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error fetching brands:', error);
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
      if (process.env.NODE_ENV === 'development') console.error('Error fetching Mastercards:', error);
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
        try { localStorage.setItem('likedProducts', JSON.stringify(Array.from(newSet))); } catch { /* ignore */ }
      }
      return newSet;
    });
  }, []);

  // M24: Recently viewed products — track last 8 viewed products
  const [recentlyViewed, setRecentlyViewed] = useState<BrandProduct[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('recentlyViewed');
        return saved ? JSON.parse(saved) : [];
      } catch { return []; }
    }
    return [];
  });

  const selectProduct = useCallback((product: BrandProduct) => {
    setSelectedProduct(product);
    setPurchaseInitialAmount(''); // Clear stale amount from previous product
    // Track recently viewed
    setRecentlyViewed(prev => {
      const filtered = prev.filter(p => p.product_id !== product.product_id);
      const updated = [product, ...filtered].slice(0, 8);
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('recentlyViewed', JSON.stringify(updated)); } catch { /* ignore */ }
      }
      return updated;
    });
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
            className="w-full pl-11 pr-9 py-3 min-h-[44px] border-2 border-line-strong rounded-lg text-sm text-ink placeholder:text-ink-dim bg-canvas-soft focus:ring-2 focus:ring-ember focus:border-ember outline-none hover:border-line-strong transition-colors"
          />
          {searchInput && searchInput !== searchQuery ? (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-line-strong border-t-ember rounded-full animate-spin" />
          ) : (
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
          {searchInput && (
            <button
              type="button"
              onClick={() => { handleSearchChange(''); setSearchQuery(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-ink-dim hover:text-ink transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sort Order */}
      <div>
        <h3 className="text-base font-bold text-ink mb-4 pb-3 border-b-2 border-line-strong">Sort</h3>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'default' | 'az' | 'za')}
          className="w-full px-4 py-3 min-h-[44px] border-2 border-line-strong rounded-lg text-sm font-medium text-ink bg-canvas-soft focus:ring-2 focus:ring-ember focus:border-ember outline-none hover:border-line-strong transition-colors"
        >
          <option value="default">Default</option>
          <option value="az">Name A–Z</option>
          <option value="za">Name Z–A</option>
        </select>
      </div>

      {/* Show Unique Brands Only Toggle */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer hover:bg-canvas-lift/50 p-3 rounded-lg transition-colors border-2 border-line-strong">
          <input
            type="checkbox"
            checked={showUniqueBrandsOnly}
            onChange={(e) => setShowUniqueBrandsOnly(e.target.checked)}
            className="w-5 h-5 text-ember border-line-strong rounded focus:ring-ember bg-canvas-lift"
          />
          <div className="flex-1">
            <span className="text-sm font-bold text-ink block">Show Unique Brands Only</span>
            <span className="text-xs text-ink-dim block mt-1">
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
          <label className="flex items-center gap-3 cursor-pointer hover:bg-canvas-lift/50 p-3 rounded-lg transition-colors border-2 border-line-strong">
            <input
              type="checkbox"
              checked={showFavoritesOnly}
              onChange={(e) => setShowFavoritesOnly(e.target.checked)}
              className="w-5 h-5 text-red-500 border-line-strong rounded focus:ring-red-500 bg-canvas-lift"
            />
            <div className="flex-1">
              <span className="text-sm font-bold text-ink block">Favorites Only</span>
              <span className="text-xs text-ink-dim block mt-1">Show {likedProducts.size} liked product{likedProducts.size !== 1 ? 's' : ''}</span>
            </div>
          </label>
        </div>
      )}

      {/* Country Filter */}
      <div>
        <h3 className="text-base font-bold text-ink mb-4 pb-3 border-b-2 border-line-strong">Country</h3>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="w-full px-4 py-3 min-h-[44px] border-2 border-line-strong rounded-lg text-sm font-medium text-ink bg-canvas-soft focus:ring-2 focus:ring-ember focus:border-ember outline-none hover:border-line-strong transition-colors"
        >
          <option value="all">All Countries</option>
          {availableCountries.map(country => (
            <option key={country} value={country}>{getCountryFlag(country)} {country}</option>
          ))}
        </select>
      </div>

      {/* Currency Filter */}
      <div>
        <h3 className="text-base font-bold text-ink mb-4 pb-3 border-b-2 border-line-strong">Currency</h3>
        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value)}
          className="w-full px-4 py-3 min-h-[44px] border-2 border-line-strong rounded-lg text-sm font-medium text-ink bg-canvas-soft focus:ring-2 focus:ring-ember focus:border-ember outline-none hover:border-line-strong transition-colors"
        >
          <option value="all">All Currencies</option>
          {availableCurrencies.map(currency => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </select>
      </div>

      {/* Brands Filter */}
      <div>
        <h3 className="text-base font-bold text-ink mb-4 pb-3 border-b-2 border-line-strong">Brands</h3>
        <div className="space-y-3 max-h-[300px] sm:max-h-[500px] overflow-y-auto pr-2">
          {(showAllBrands ? allUniqueBrands : allUniqueBrands.slice(0, 30)).map((brandName) => (
            <label key={brandName} className="flex items-center gap-3 cursor-pointer hover:bg-canvas-lift/50 p-2 rounded-lg transition-colors">
              <input
                type="checkbox"
                checked={selectedBrandFilters.includes(brandName)}
                onChange={() => toggleBrandFilter(brandName)}
                className="w-5 h-5 text-ember border-line-strong rounded focus:ring-ember bg-canvas-lift"
              />
              <span className="text-sm text-ink font-medium">{brandName}</span>
            </label>
          ))}
          {allUniqueBrands.length > 30 && (
            <button
              onClick={() => setShowAllBrands(prev => !prev)}
              className="text-sm text-ember hover:text-ember font-bold ml-2"
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
          className="w-full px-5 py-3 min-h-[44px] bg-canvas-lift hover:bg-canvas-lift text-ink text-sm font-bold rounded-lg transition-colors shadow-sm"
        >
          Clear All Filters
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="w-full max-w-[1920px] mx-auto">
        <div className="flex flex-col lg:flex-row h-[calc(100vh-56px)] w-full bg-canvas">
          {/* LEFT SIDEBAR - Filters (Hidden on mobile, shown on lg+) */}
          <aside className="hidden lg:block w-80 bg-canvas-soft border-r border-line overflow-y-auto flex-shrink-0 shadow-sm">
            <div className="p-8">
              <Link href="/" className="inline-flex items-center gap-1 text-ember hover:text-ember font-medium mb-6 text-sm">
                &larr; CYM Studio
              </Link>

              {/* Wallet Auth Section */}
              <div className="mb-6 p-3 rounded-lg border border-line bg-canvas-soft/50">
                {!walletReady ? (
                  <div className="flex items-center gap-2 text-xs text-ink-dim">
                    <div className="w-3 h-3 border-2 border-line-strong border-t-transparent rounded-full animate-spin" />
                    Initializing...
                  </div>
                ) : isConnected && address ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-ember flex items-center justify-center flex-shrink-0">
                        <Wallet className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => setShowWalletView(true)}
                          className="text-xs font-medium text-ink truncate hover:text-ember transition-colors cursor-pointer text-left w-full block"
                          title="View wallet details"
                        >
                          Connected
                        </button>
                        <button
                          onClick={() => setShowWalletView(true)}
                          className="text-[10px] text-ink-dim hover:text-ember font-mono truncate transition-colors cursor-pointer text-left w-full block"
                          title="View wallet details"
                        >
                          {address.slice(0, 6)}...{address.slice(-4)}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => disconnect()}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-ink-dim hover:text-ink py-1.5 rounded hover:bg-canvas-lift/50 transition-colors"
                    >
                      <LogOut className="w-3 h-3" />
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {walletTimedOut && (
                      <p className="text-xs text-amber-400">Wallet connection timed out — try reconnecting.</p>
                    )}
                    <button
                      onClick={() => open()}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-ember hover:bg-ember text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      <Wallet className="w-4 h-4" />
                      {walletTimedOut ? 'Reconnect Wallet' : 'Connect Wallet'}
                    </button>
                  </div>
                )}
              </div>

              {filterContent}
            </div>
          </aside>

          {/* Mobile Filter Bottom Sheet */}
          {showMobileFilters && (
            <div
              className="fixed inset-0 z-50 lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Filter products"
              onKeyDown={(e) => { if (e.key === 'Escape') setShowMobileFilters(false); }}
            >
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/60"
                onClick={() => setShowMobileFilters(false)}
              />
              {/* Bottom Sheet */}
              <div className="absolute bottom-0 left-0 right-0 bg-canvas-soft rounded-t-2xl max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
                {/* Handle */}
                <div className="flex justify-center py-3">
                  <div className="w-12 h-1.5 bg-canvas-lift rounded-full" />
                </div>
                {/* Header */}
                <div className="flex items-center justify-between px-4 pb-3 border-b border-line">
                  <h3 className="text-lg font-bold text-ink">Filters</h3>
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="p-2 hover:bg-canvas-lift rounded-lg transition-colors"
                    aria-label="Close filters"
                  >
                    <X className="w-5 h-5 text-ink-dim" />
                  </button>
                </div>
                {/* Content */}
                <div className="p-4 overflow-y-auto max-h-[calc(85vh-120px)]">
                  {filterContent}
                </div>
                {/* Footer */}
                <div className="p-4 border-t border-line bg-canvas-soft">
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="w-full py-3 bg-ember hover:bg-ember text-white font-semibold rounded-lg transition-colors"
                  >
                    Show {filteredProducts.length} Results
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MAIN CONTENT AREA */}
          <main ref={mainRef} className="flex-1 overflow-y-auto bg-canvas">
            <div className="p-4 sm:p-8 pb-20 sm:pb-24 w-full">
              {/* Serif hero — Tournament Prize Redemptions */}
              <section className={styles.heroSerif}>
                <div>
                  <div className={styles.heroCrumb}>
                    <span>Tournament Prize Redemption</span>
                    <span>·</span>
                    <span>Season 22</span>
                  </div>
                  <h1 className={styles.heroTitle}>
                    Turn your winnings<br />into something <em>real.</em>
                  </h1>
                  <p className={styles.heroLede}>
                    Redeem prize tokens awarded from CYM Studio&apos;s Tournaments, Competitions, and Player Reward Programs
                    for digital gift cards across ~{allUniqueBrands.length || 300} brands. All redemptions are final and subject to official tournament rules.
                  </p>
                </div>
                <div className={styles.heroMeta}>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatN}>{allUniqueBrands.length || 0}</span>
                    <span className={styles.heroStatL}>Brands</span>
                  </div>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatN}>{availableCountries.length || 0}</span>
                    <span className={styles.heroStatL}>Countries</span>
                  </div>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatN}>{availableCurrencies.length || 0}</span>
                    <span className={styles.heroStatL}>Currencies</span>
                  </div>
                </div>
              </section>

              {/* Pill tabs */}
              <div className="mb-4 sm:mb-6 overflow-x-auto scrollbar-none -mx-4 sm:mx-0 px-4 sm:px-0">
                <div className={styles.pillTabs}>
                  <button
                    onClick={() => { setActiveTab('giftcards'); mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={`${styles.pillTab} ${activeTab === 'giftcards' ? styles.pillTabActive : ''}`}
                  >
                    Gift Cards
                    {!loading && filteredProducts.length > 0 && (
                      <span className={styles.pillTabCount}>{filteredProducts.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => { setActiveTab('mastercards'); mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={`${styles.pillTab} ${activeTab === 'mastercards' ? styles.pillTabActive : ''}`}
                  >
                    <CreditCard className="w-4 h-4 flex-shrink-0" />
                    Prepaid Mastercards
                    {mastercardsFetched && mastercards.length > 0 && (
                      <span className={styles.pillTabCount}>{mastercards.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => { setActiveTab('orders'); setHasNewOrders(false); mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={`${styles.pillTab} ${activeTab === 'orders' ? styles.pillTabActive : ''}`}
                  >
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    My Orders
                    {hasNewOrders && activeTab !== 'orders' && (
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                    )}
                  </button>
                </div>
              </div>

              {/* M24: Recently Viewed Products — collapsible, above grid */}
              {recentlyViewed.length > 0 && !loading && activeTab !== 'orders' && (
                <div className="mb-4 sm:mb-6">
                  <button
                    onClick={() => setRecentlyViewedCollapsed(prev => {
                      const next = !prev;
                      if (typeof window !== 'undefined') {
                        try { localStorage.setItem('recentlyViewedCollapsed', String(next)); } catch { /* ignore */ }
                      }
                      return next;
                    })}
                    className="w-full flex items-center justify-between group mb-3"
                    aria-expanded={!recentlyViewedCollapsed}
                    aria-label={`Recently viewed products (${recentlyViewed.length})`}
                  >
                    <h3 className="text-sm font-bold text-ink-dim uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Recently Viewed
                      <span className="text-xs font-normal normal-case text-ink-mute">({recentlyViewed.length})</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecentlyViewed([]);
                          if (typeof window !== 'undefined') {
                            try { localStorage.removeItem('recentlyViewed'); } catch { /* ignore */ }
                          }
                        }}
                        className="text-[10px] text-ink-mute hover:text-ink-dim transition-colors px-1.5 py-0.5 rounded hover:bg-canvas-lift/50"
                        aria-label="Clear recently viewed products"
                      >
                        Clear
                      </button>
                      <ChevronDown className={`w-4 h-4 text-ink-mute group-hover:text-ink-dim transition-transform ${recentlyViewedCollapsed ? '' : 'rotate-180'}`} />
                    </div>
                  </button>
                  {!recentlyViewedCollapsed && (
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3">
                      {recentlyViewed.map((product) => (
                        <RecentlyViewedCard key={product.product_id} product={product} onSelect={selectProduct} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Top Bar */}
              <div className="flex items-center justify-between mb-4 sm:mb-8 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="hidden sm:block h-1 w-1 bg-ember rounded-full flex-shrink-0"></div>
                  <h2 className="font-serif font-normal text-2xl sm:text-3xl text-ink truncate tracking-tight">
                    {activeTab === 'orders' ? (
                      <>My Orders</>
                    ) : activeTab === 'giftcards' ? (
                      <>All brands <span className="text-ink-mute font-normal text-base sm:text-xl">— {filteredProducts.length}</span></>
                    ) : (
                      <>Prepaid Mastercards <span className="text-ink-mute font-normal text-base sm:text-xl">— {mastercards.length}</span></>
                    )}
                  </h2>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Sort control — gift cards tab only, visible on all screen sizes */}
                  {activeTab === 'giftcards' && (
                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value as 'default' | 'az' | 'za')}
                      className="px-2 sm:px-3 py-2 min-h-[36px] text-[11px] sm:text-xs font-medium text-ink-dim bg-canvas-soft border border-line-strong rounded-lg focus:ring-2 focus:ring-ember focus:border-ember outline-none hover:border-line-strong transition-colors"
                      aria-label="Sort products"
                    >
                      <option value="default">Sort</option>
                      <option value="az">A–Z</option>
                      <option value="za">Z–A</option>
                    </select>
                  )}
                  {/* Mobile Wallet Auth */}
                  <div className="lg:hidden">
                    {walletReady && !isConnected ? (
                      <button
                        onClick={() => open()}
                        className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-ember hover:bg-ember text-white font-semibold text-sm rounded-lg transition-colors"
                      >
                        <Wallet className="w-4 h-4" />
                        Connect
                      </button>
                    ) : walletReady && isConnected ? (
                      <button
                        onClick={() => setShowWalletView(true)}
                        className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-canvas-lift hover:bg-canvas-lift text-ink text-sm rounded-lg transition-colors border border-line-strong"
                      >
                        <div className="w-5 h-5 rounded-full bg-ember flex items-center justify-center">
                          <Wallet className="w-2.5 h-2.5 text-white" />
                        </div>
                      </button>
                    ) : null}
                  </div>
                  {/* Mobile Filter Button - only for gift cards tab */}
                  {activeTab === 'giftcards' && (
                    <button
                      onClick={() => setShowMobileFilters(true)}
                      className="lg:hidden flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-ember hover:bg-ember text-white font-semibold text-sm rounded-lg transition-colors shadow-sm"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      Filters
                      {activeFilterCount > 0 && (
                        <span className="bg-white text-ember text-xs font-bold px-1.5 py-0.5 rounded-full">
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
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-ember-soft border border-ember-soft rounded-full text-xs text-ember">
                      Search: &quot;{searchQuery}&quot;
                      <button onClick={() => { setSearchQuery(''); setSearchInput(''); }} className="ml-0.5 hover:text-white" aria-label="Remove search filter"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {countryFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-ember-soft border border-ember-soft rounded-full text-xs text-ember">
                      {getCountryFlag(countryFilter) && <span aria-hidden="true">{getCountryFlag(countryFilter)}</span>}
                      {countryFilter}
                      <button onClick={() => setCountryFilter('all')} className="ml-0.5 hover:text-white" aria-label={`Remove ${countryFilter} filter`}><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {currencyFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-ember-soft border border-ember-soft rounded-full text-xs text-ember">
                      {currencyFilter}
                      <button onClick={() => setCurrencyFilter('all')} className="ml-0.5 hover:text-white" aria-label={`Remove ${currencyFilter} filter`}><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {selectedBrandFilters.map(brand => (
                    <span key={brand} className="inline-flex items-center gap-1 px-2.5 py-1 bg-ember-soft border border-ember-soft rounded-full text-xs text-ember">
                      {brand}
                      <button onClick={() => toggleBrandFilter(brand)} className="ml-0.5 hover:text-white" aria-label={`Remove ${brand} filter`}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {showFavoritesOnly && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-900/40 border border-red-700/50 rounded-full text-xs text-red-300">
                      Favorites
                      <button onClick={() => setShowFavoritesOnly(false)} className="ml-0.5 hover:text-white" aria-label="Remove favorites filter"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {activeFilterCount > 1 && (
                    <button
                      onClick={() => { setSelectedBrandFilters([]); setCountryFilter('all'); setCurrencyFilter('all'); setSearchQuery(''); setSearchInput(''); setShowFavoritesOnly(false); setSortOrder('default'); }}
                      className="text-xs text-ink-dim hover:text-ink underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}

              {/* Screen reader announcement for search/filter results */}
              {activeTab === 'giftcards' && !loading && (
                <div role="status" aria-live="polite" className="sr-only">
                  {filteredProducts.length === 0
                    ? 'No products found matching your filters'
                    : `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''} found`}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6" aria-busy="true" aria-label="Loading Mastercard products">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="bg-canvas-soft border border-line rounded-xl overflow-hidden animate-pulse">
                        <div className="h-40 sm:h-56 bg-canvas-lift" />
                        <div className="p-4 border-t border-line space-y-3">
                          <div className="h-4 bg-canvas-lift rounded w-3/4" />
                          <div className="h-3 bg-canvas-lift rounded w-1/3" />
                          <div className="h-12 bg-canvas-lift rounded-lg" />
                          <div className="h-3 bg-canvas-lift rounded w-2/3" />
                          <div className="h-10 bg-canvas-lift rounded-lg" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : mastercardFetchError ? (
                  <div className="text-center py-20">
                    <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-ink mb-2">Something went wrong</h3>
                    <p className="text-ink-dim mb-6">{mastercardFetchError}</p>
                    <button
                      onClick={fetchMastercards}
                      className="px-6 py-2 bg-ember hover:bg-ember text-white font-medium rounded-lg transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : mastercards.length === 0 ? (
                  <div className="text-center py-20">
                    <CreditCard className="w-16 h-16 text-ink-mute mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-ink mb-2">No Mastercard products available</h3>
                    <p className="text-ink-dim">Prepaid Mastercard products are not currently available in your region.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {mastercards.map((product) => (
                      <div
                        key={product.product_id}
                        className="group relative bg-canvas-soft border border-line rounded-xl overflow-hidden hover:shadow-xl hover:shadow-ember/10 hover:border-line-strong transition-all duration-300"
                      >
                        {/* Product Image */}
                        <MastercardImage product={product} onSelect={() => setSelectedProduct(product)} />

                        {/* Product Info */}
                        <div className="p-4 border-t border-line">
                          <h3 className="font-bold text-ink text-base mb-1">{product.brand_name}</h3>

                          {/* Value Range */}
                          {product.value_restrictions && (
                            <div className="mb-3 p-2.5 bg-canvas-lift/50 rounded-lg">
                              <p className="text-xs text-ink-dim mb-1">Value Range</p>
                              <p className="text-sm font-semibold text-ink">
                                {product.currency} {product.value_restrictions.minVal || product.value_restrictions.min} - {product.value_restrictions.maxVal || product.value_restrictions.max}
                              </p>
                            </div>
                          )}

                          <p className="text-xs text-ink-dim mb-3">
                            {getCountryFlag(product.country_name) && <span className="mr-0.5" aria-hidden="true">{getCountryFlag(product.country_name)}</span>}
                            {product.currency} · {product.country_name}
                          </p>

                          <button
                            onClick={() => setSelectedProduct(product)}
                            className="w-full px-4 py-2.5 min-h-[40px] bg-ember hover:bg-ember text-white font-semibold text-sm rounded-lg transition-colors shadow-sm"
                          >
                            View & Redeem
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6" aria-busy="true" aria-label="Loading products">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-canvas-soft border border-line rounded-xl overflow-hidden animate-pulse">
                      <div className="h-36 sm:h-56 bg-canvas-lift" />
                      <div className="p-2.5 sm:p-4 border-t border-line space-y-2 sm:space-y-3">
                        <div className="h-4 bg-canvas-lift rounded w-3/4" />
                        <div className="h-3 bg-canvas-lift rounded w-1/2 hidden sm:block" />
                        <div className="hidden sm:flex gap-1.5">
                          <div className="h-6 bg-canvas-lift rounded w-16" />
                          <div className="h-6 bg-canvas-lift rounded w-16" />
                        </div>
                        <div className="h-3 bg-canvas-lift rounded w-2/3" />
                        <div className="h-9 sm:h-10 bg-canvas-lift rounded-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : fetchError ? (
                <div className="text-center py-20">
                  <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-ink mb-2">Something went wrong</h3>
                  <p className="text-ink-dim mb-6">{fetchError}</p>
                  <button
                    onClick={fetchBrands}
                    className="px-6 py-2 bg-ember hover:bg-ember text-white font-medium rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : filteredProducts.length === 0 && showFavoritesOnly ? (
                <div className="text-center py-20">
                  <svg className="w-16 h-16 text-ink-mute mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <h3 className="text-xl font-bold text-ink mb-2">No favorites match your filters</h3>
                  <p className="text-ink-dim mb-6">Try removing country or currency filters, or browse all products to add more favorites.</p>
                  <button
                    onClick={() => setShowFavoritesOnly(false)}
                    className="px-6 py-2 bg-ember hover:bg-ember text-white font-medium rounded-lg transition-colors"
                  >
                    Show All Products
                  </button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <EmptySearchState
                  searchQuery={searchQuery}
                  allBrandNames={allUniqueBrands}
                  onSelectSuggestion={(name) => { setSearchQuery(name); setSearchInput(name); }}
                  onClearFilters={() => {
                    setSelectedBrandFilters([]);
                    setCountryFilter('all');
                    setCurrencyFilter('all');
                    setSearchQuery('');
                    setSearchInput('');
                  }}
                />
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
                className="fixed bottom-20 right-4 sm:right-8 z-30 w-10 h-10 bg-ember hover:bg-ember text-white rounded-full shadow-lg flex items-center justify-center transition-all"
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
            <div ref={productDetailRef} role="dialog" aria-modal="true" aria-label={`${selectedProduct.brand_name} details`} className="bg-canvas-soft rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto border border-line" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="font-serif font-normal text-2xl sm:text-3xl text-ink tracking-tight">{selectedProduct.brand_name}</h2>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    aria-label="Close"
                    className="p-2.5 sm:p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-canvas-lift rounded-lg transition-colors -mr-2"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6 text-ink-dim" />
                  </button>
                </div>

                {selectedProduct.product_image && (
                  <DetailImage src={selectedProduct.product_image} alt={selectedProduct.brand_name} />
                )}

                <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                  {/* Product Description */}
                  {selectedProduct.product_description && (
                    <p className="text-sm text-ink-dim leading-relaxed">{selectedProduct.product_description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-ink-dim mb-1">Country</h3>
                      <p className="text-sm sm:text-base text-ink">
                        {getCountryFlag(selectedProduct.country_name) && <span className="mr-1" aria-hidden="true">{getCountryFlag(selectedProduct.country_name)}</span>}
                        {selectedProduct.country_name}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-ink-dim mb-1">Currency</h3>
                      <p className="text-sm sm:text-base text-ink">{selectedProduct.currency}</p>
                    </div>
                  </div>

                  {selectedProduct.denominations && Array.isArray(selectedProduct.denominations) && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-ink-dim mb-2">Quick Buy — tap a denomination</h3>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {selectedProduct.denominations.map((denom: number, idx: number) => {
                          const tokenEst = selectedProduct.currency ? estimateTokenCost(denom, selectedProduct.currency) : null;
                          return (
                            <button
                              key={idx}
                              onClick={() => {
                                setPurchaseInitialAmount(String(denom));
                                setShowPurchaseModal(true);
                              }}
                              className="bg-canvas-lift hover:bg-ember text-ink hover:text-white px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors border border-line-strong hover:border-ember"
                            >
                              {selectedProduct.currency} {denom}
                              {tokenEst && (
                                <span className="block text-[9px] sm:text-[10px] font-normal opacity-60">≈ {tokenEst} {NETWORKS[selectedNetwork]?.tokenSymbol}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedProduct.value_restrictions && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-ink-dim mb-1">Value Range</h3>
                      <p className="text-sm sm:text-base text-ink">
                        {selectedProduct.currency} {selectedProduct.value_restrictions.minVal || selectedProduct.value_restrictions.min} - {selectedProduct.value_restrictions.maxVal || selectedProduct.value_restrictions.max}
                      </p>
                    </div>
                  )}

                  {/* Expiry & Validity */}
                  {selectedProduct.expiry_and_validity && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-ink-dim mb-1">Expiry & Validity</h3>
                      <div className="text-sm text-ink-dim leading-relaxed prose-sm prose-invert" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedProduct.expiry_and_validity) }} />
                    </div>
                  )}

                  {/* How to Use — collapsible */}
                  {selectedProduct.how_to_use && (
                    <details className="group">
                      <summary className="flex items-center justify-between cursor-pointer text-xs sm:text-sm font-semibold text-ink-dim hover:text-ink-dim transition-colors">
                        How to Use
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-2 text-sm text-ink-dim leading-relaxed prose-sm prose-invert max-h-48 overflow-y-auto" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedProduct.how_to_use) }} />
                    </details>
                  )}

                  {/* Terms & Conditions — collapsible */}
                  {selectedProduct.terms_and_conditions && (
                    <details className="group">
                      <summary className="flex items-center justify-between cursor-pointer text-xs sm:text-sm font-semibold text-ink-dim hover:text-ink-dim transition-colors">
                        Terms & Conditions
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-2 text-sm text-ink-dim leading-relaxed prose-sm prose-invert max-h-48 overflow-y-auto" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedProduct.terms_and_conditions) }} />
                    </details>
                  )}
                </div>

                {/* Inline amount input for variable-amount cards (no denominations) */}
                {selectedProduct.value_restrictions && (!selectedProduct.denominations || !Array.isArray(selectedProduct.denominations) || selectedProduct.denominations.length === 0) && (
                  <>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-ink-dim mb-1">Amount ({selectedProduct.currency})</label>
                        <input
                          type="number"
                          step="0.01"
                          min={selectedProduct.value_restrictions.minVal || selectedProduct.value_restrictions.min || 1}
                          max={selectedProduct.value_restrictions.maxVal || selectedProduct.value_restrictions.max || 10000}
                          placeholder={`${selectedProduct.value_restrictions.minVal || selectedProduct.value_restrictions.min} - ${selectedProduct.value_restrictions.maxVal || selectedProduct.value_restrictions.max}`}
                          value={purchaseInitialAmount}
                          onChange={(e) => setPurchaseInitialAmount(e.target.value)}
                          onBlur={() => {
                            const val = parseFloat(purchaseInitialAmount);
                            if (!isNaN(val) && val > 0) {
                              setPurchaseInitialAmount(val.toFixed(2));
                            }
                          }}
                          className="w-full px-3 py-2.5 border-2 border-line-strong rounded-lg bg-canvas-lift text-ink placeholder:text-ink-dim focus:ring-2 focus:ring-ember focus:border-ember outline-none text-sm font-semibold"
                        />
                        {/* Real-time inline validation */}
                        {(() => {
                          if (!purchaseInitialAmount) return null;
                          const val = parseFloat(purchaseInitialAmount);
                          if (isNaN(val) || val <= 0) return null;
                          const minVal = selectedProduct!.value_restrictions?.minVal || selectedProduct!.value_restrictions?.min;
                          const maxVal = selectedProduct!.value_restrictions?.maxVal || selectedProduct!.value_restrictions?.max;
                          if (minVal && val < minVal) return <p className="text-xs text-red-400 mt-1">Minimum is {selectedProduct!.currency} {minVal}</p>;
                          if (maxVal && val > maxVal) return <p className="text-xs text-red-400 mt-1">Maximum is {selectedProduct!.currency} {maxVal}</p>;
                          return null;
                        })()}
                      </div>
                      <button
                        onClick={() => {
                          if (!purchaseInitialAmount) return;
                          const val = parseFloat(purchaseInitialAmount);
                          const min = selectedProduct!.value_restrictions?.minVal || selectedProduct!.value_restrictions?.min;
                          const max = selectedProduct!.value_restrictions?.maxVal || selectedProduct!.value_restrictions?.max;
                          if (isNaN(val) || val <= 0) return;
                          if (min && val < min) {
                            setPurchaseInitialAmount(String(min));
                            return;
                          }
                          if (max && val > max) {
                            setPurchaseInitialAmount(String(max));
                            return;
                          }
                          setShowPurchaseModal(true);
                        }}
                        disabled={!purchaseInitialAmount || (() => {
                          const val = parseFloat(purchaseInitialAmount);
                          if (isNaN(val) || val <= 0) return true;
                          const minVal = selectedProduct!.value_restrictions?.minVal || selectedProduct!.value_restrictions?.min;
                          const maxVal = selectedProduct!.value_restrictions?.maxVal || selectedProduct!.value_restrictions?.max;
                          return (minVal && val < minVal) || (maxVal && val > maxVal) || false;
                        })()}
                        className="px-5 py-2.5 min-h-[42px] bg-ember hover:bg-ember disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors text-sm whitespace-nowrap"
                      >
                        Buy with {NETWORKS[selectedNetwork]?.tokenSymbol}
                      </button>
                    </div>
                    <div className="flex items-center gap-3 my-2">
                      <div className="flex-1 h-px bg-canvas-lift" />
                      <span className="text-xs text-ink-mute font-medium">or</span>
                      <div className="flex-1 h-px bg-canvas-lift" />
                    </div>
                  </>
                )}

                <button
                  onClick={() => {
                    if (!purchaseInitialAmount) setPurchaseInitialAmount('');
                    setShowPurchaseModal(true);
                  }}
                  className="w-full px-6 py-3 min-h-[48px] bg-ember hover:bg-ember text-white font-bold rounded-lg transition-colors"
                >
                  Redeem with Tokens
                  <span className="block text-xs font-normal opacity-80 mt-0.5">
                    Pay with {NETWORKS[selectedNetwork]?.tokenSymbol} on {NETWORKS[selectedNetwork]?.name}
                    {!selectedNetworkHealthy && ' (delayed)'}
                  </span>
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
              if (typeof window !== 'undefined') try { localStorage.setItem('preferredNetwork', net); } catch { /* ignore */ }
            }}
            walletProvider={walletProvider}
            onRefreshBalance={refetchBalance}
            initialAmount={purchaseInitialAmount}
            facilitatorHealthy={selectedNetworkHealthy}
            facilitatorHealthReason={facilitatorHealthReason[selectedNetwork]}
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
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-canvas-soft/95 backdrop-blur-md border-t border-line">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          {/* Left: USDC Balance (when authenticated) */}
          {isConnected && address ? (
            <>
              {/* Left group: balance pill + send + networks */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className={styles.balancePill}>
                  <div>
                    <div className={styles.balancePillLabel}>
                      <span className="hidden sm:inline">{tokenSymbol} · {NETWORKS[selectedNetwork]?.name}</span>
                      <span className="sm:hidden">{tokenSymbol}</span>
                    </div>
                    <div className={styles.balancePillAmount}>
                      {balanceLoading ? (
                        <span className="inline-block w-20 h-5 bg-canvas-lift rounded animate-pulse" />
                      ) : usdcBalance !== null ? parseFloat(usdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                      <span className={styles.balancePillUnit}>{tokenSymbol}</span>
                    </div>
                  </div>
                  <div className={styles.balancePillIcon}>◈</div>
                </div>
                {ethBalance !== null && ethBalance !== undefined && (
                  <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-canvas-lift/50 rounded-lg border border-line-strong flex-shrink-0">
                    <span className="text-[10px] text-ink-dim">{NETWORKS[selectedNetwork]?.nativeSymbol || 'ETH'}</span>
                    <span className="text-xs font-semibold text-ink">
                      {parseFloat(ethBalance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setShowSendModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-ember/20 hover:bg-ember/30 text-ember text-xs font-semibold rounded-lg transition-colors border border-ember/30 flex-shrink-0"
                  title={`Send ${tokenSymbol}`}
                  aria-label={`Send ${tokenSymbol} tokens`}
                >
                  <Send className="w-3 h-3" />
                  <span className="hidden sm:inline">Send {tokenSymbol}</span>
                </button>
                <button
                  onClick={() => setShowSendEthModal(true)}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-canvas-lift/50 hover:bg-canvas-lift text-ink-dim text-xs font-semibold rounded-lg transition-colors border border-line-strong flex-shrink-0"
                  title={`Send ${NETWORKS[selectedNetwork]?.nativeSymbol || 'ETH'}`}
                  aria-label={`Send ${NETWORKS[selectedNetwork]?.nativeSymbol || 'ETH'}`}
                >
                  <Send className="w-3 h-3" />
                  Send {NETWORKS[selectedNetwork]?.nativeSymbol || 'ETH'}
                </button>
                {/* Networks Supported — grouped switcher */}
                <div className="flex items-center gap-1 px-2 py-1 bg-canvas-lift/40 rounded-lg border border-line-strong flex-shrink-0">
                  <span className="hidden sm:inline text-[9px] text-ink-mute font-medium uppercase tracking-wider mr-1">Networks</span>
                  {Object.entries(NETWORKS).map(([key, net]) => {
                    const shortLabel = key === 'ethereum' ? 'ETH' : 'CFX';
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setSelectedNetwork(key);
                          if (typeof window !== 'undefined') try { localStorage.setItem('preferredNetwork', key); } catch { /* ignore */ }
                        }}
                        disabled={showPurchaseModal}
                        className={`px-2 py-1.5 sm:py-1 min-w-[40px] min-h-[36px] sm:min-h-0 text-[10px] font-bold rounded transition-colors ${
                          selectedNetwork === key
                            ? 'bg-ember/30 text-ember border border-ember/40'
                            : 'text-ink-dim hover:text-ink border border-transparent hover:border-line-strong'
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
              {/* Right group: Facilitator status — separate from networks */}
              {(() => {
                const anyUnhealthy = Object.entries(facilitatorHealth).some(([, healthy]) => healthy === false);
                if (!anyUnhealthy) return null;
                return (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg flex-shrink-0 group relative cursor-help" role="status" aria-label="Facilitator gas low warning">
                    <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                    <span className="hidden sm:inline text-[10px] text-amber-300 font-medium whitespace-nowrap">
                      {Object.values(facilitatorHealthReason).includes('rpc_unreachable') ? 'Network: RPC issue' : 'Facilitator: Gas low'}
                    </span>
                    <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-canvas-soft border border-line-strong rounded-lg shadow-xl text-xs text-ink-dim w-64 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      <p className="font-semibold text-amber-300 mb-1">
                        {Object.values(facilitatorHealthReason).includes('rpc_unreachable') ? 'Network RPC Unreachable' : 'Facilitator Gas Low'}
                      </p>
                      <p className="text-ink-dim leading-relaxed">
                        {Object.values(facilitatorHealthReason).includes('rpc_unreachable')
                          ? 'One or more network RPCs are not responding. Transactions on affected networks may fail. Try switching to another network.'
                          : 'The facilitator wallet that settles your gasless payments is running low on gas. Transactions may take longer to process until it is refilled.'}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="flex items-center gap-3 w-full">
              <div className="flex items-center gap-2 min-w-0">
                <Shield className="w-4 h-4 text-ember flex-shrink-0" />
                <p className="text-xs text-ink-dim truncate">Connect a wallet to redeem gift cards with crypto</p>
              </div>
              <button
                onClick={() => open()}
                className="flex items-center gap-1.5 px-4 py-2 bg-ember hover:bg-ember text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
              >
                <Wallet className="w-3.5 h-3.5" />
                Connect Wallet
              </button>
            </div>
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
