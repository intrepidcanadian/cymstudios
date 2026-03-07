'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BrandProduct } from '@/lib/types/catalogue';
import PurchaseModal from './PurchaseModal';
import OrderStatusModal from './OrderStatusModal';
import { SlidersHorizontal, X } from 'lucide-react';

export default function GiftCardCatalog() {
  const [brands, setBrands] = useState<BrandProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<BrandProduct | null>(null);

  // Filters
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBrandFilters, setSelectedBrandFilters] = useState<string[]>([]);
  const [showUniqueBrandsOnly, setShowUniqueBrandsOnly] = useState<boolean>(true);
  const [likedProducts, setLikedProducts] = useState<Set<string>>(new Set());

  // Mobile filter drawer state
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Purchase modal state
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showOrderStatusModal, setShowOrderStatusModal] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');

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
      console.log('[GiftCardCatalog] Fetching:', url);
      const response = await fetch(url);
      const result = await response.json();

      console.log('[GiftCardCatalog] API Response:', {
        success: result.success,
        dataLength: result.data?.length,
        uniqueBrands: result.data ? Array.from(new Set(result.data.map((b: any) => b.brand_name))).length : 0
      });

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

  const brandsArray = Array.isArray(brands) ? brands : [];

  // Get unique brand names
  const allUniqueBrands = Array.from(new Set(brandsArray.map(b => b.brand_name))).sort();

  // Get unique countries and currencies for filters
  const uniqueCountries = Array.from(new Set(brandsArray.map(b => b.country_name).filter(Boolean))) as string[];
  const uniqueCurrencies = Array.from(new Set(brandsArray.map(b => b.currency).filter(Boolean))) as string[];

  // Apply all filters
  let filteredProducts = brandsArray;

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

  // Debug logging
  console.log('[GiftCardCatalog] Filtered:', {
    brandsArrayLength: brandsArray.length,
    filteredProductsLength: filteredProducts.length,
    uniqueBrandNames: Array.from(new Set(filteredProducts.map(p => p.brand_name))),
    countryFilter,
    currencyFilter,
    showUniqueBrandsOnly
  });

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
  const FilterContent = () => (
    <div className="space-y-6 sm:space-y-8">
      {/* Search */}
      <div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search for a brand..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 min-h-[44px] border-2 border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none hover:border-gray-400 transition-colors"
          />
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Show Unique Brands Only Toggle */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors border-2 border-gray-200">
          <input
            type="checkbox"
            checked={showUniqueBrandsOnly}
            onChange={(e) => setShowUniqueBrandsOnly(e.target.checked)}
            className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
          />
          <div className="flex-1">
            <span className="text-sm font-bold text-gray-900 block">Show Unique Brands Only</span>
            <span className="text-xs text-gray-500 block mt-1">Display one product per brand</span>
          </div>
        </label>
      </div>

      {/* Country Filter */}
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-4 pb-3 border-b-2 border-gray-200">Country</h3>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="w-full px-4 py-3 min-h-[44px] border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-900 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none hover:border-gray-400 transition-colors"
        >
          <option value="all">All Countries</option>
          {uniqueCountries.map(country => (
            <option key={country} value={country}>{country}</option>
          ))}
        </select>
      </div>

      {/* Currency Filter */}
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-4 pb-3 border-b-2 border-gray-200">Currency</h3>
        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value)}
          className="w-full px-4 py-3 min-h-[44px] border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-900 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none hover:border-gray-400 transition-colors"
        >
          <option value="all">All Currencies</option>
          {uniqueCurrencies.map(currency => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </select>
      </div>

      {/* Brands Filter */}
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-4 pb-3 border-b-2 border-gray-200">Brands</h3>
        <div className="space-y-3 max-h-[300px] sm:max-h-[500px] overflow-y-auto pr-2">
          {allUniqueBrands.slice(0, 30).map((brandName) => (
            <label key={brandName} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors">
              <input
                type="checkbox"
                checked={selectedBrandFilters.includes(brandName)}
                onChange={() => toggleBrandFilter(brandName)}
                className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-gray-800 font-medium">{brandName}</span>
            </label>
          ))}
          {allUniqueBrands.length > 30 && (
            <button className="text-sm text-purple-600 hover:text-purple-700 font-bold ml-2">
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
            setShowUniqueBrandsOnly(false);
          }}
          className="w-full px-5 py-3 min-h-[44px] bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-bold rounded-lg transition-colors shadow-sm"
        >
          Clear All Filters
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="w-full max-w-[1920px] mx-auto">
        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-200px)] w-full bg-gray-50">
          {/* LEFT SIDEBAR - Filters (Hidden on mobile, shown on lg+) */}
          <aside className="hidden lg:block w-80 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0 shadow-sm">
            <div className="p-8">
              <Link href="/" className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 font-medium mb-6 text-sm">
                &larr; CYM Studio
              </Link>
              <FilterContent />
            </div>
          </aside>

          {/* Mobile Filter Bottom Sheet */}
          {showMobileFilters && (
            <div className="fixed inset-0 z-50 lg:hidden">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setShowMobileFilters(false)}
              />
              {/* Bottom Sheet */}
              <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
                {/* Handle */}
                <div className="flex justify-center py-3">
                  <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>
                {/* Header */}
                <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">Filters</h3>
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
                {/* Content */}
                <div className="p-4 overflow-y-auto max-h-[calc(85vh-120px)]">
                  <FilterContent />
                </div>
                {/* Footer */}
                <div className="p-4 border-t border-gray-200 bg-white">
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="w-full py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg transition-colors"
                  >
                    Show {filteredProducts.length} Results
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 overflow-y-auto bg-gray-50">
            <div className="p-4 sm:p-8 w-full">
              {/* Top Bar */}
              <div className="flex items-center justify-between mb-4 sm:mb-8 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="hidden sm:block h-1 w-1 bg-purple-500 rounded-full flex-shrink-0"></div>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                    All Products <span className="text-gray-600 font-normal text-sm sm:text-lg">({filteredProducts.length})</span>
                  </h2>
                </div>
                {/* Mobile Filter Button */}
                <button
                  onClick={() => setShowMobileFilters(true)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-purple-500 hover:bg-purple-600 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm flex-shrink-0"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="bg-white text-purple-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {loading ? (
                <div className="text-center py-20">
                  <div className="relative inline-flex">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-purple-500"></div>
                  </div>
                  <p className="text-gray-600 mt-6 font-medium">Loading catalog...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-20">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No products found</h3>
                  <p className="text-gray-600 mb-6">Try adjusting your filters or search query</p>
                  <button
                    onClick={() => {
                      setSelectedBrandFilters([]);
                      setCountryFilter('all');
                      setCurrencyFilter('all');
                      setSearchQuery('');
                    }}
                    className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-colors"
                  >
                    Clear All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.product_id}
                      className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-xl transition-all duration-300"
                    >
                      {/* Like Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(String(product.product_id));
                        }}
                        className="absolute top-2 sm:top-3 right-2 sm:right-3 z-10 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-colors shadow-lg border border-gray-200"
                      >
                        {likedProducts.has(String(product.product_id)) ? (
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 fill-current" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                          <div className="w-full h-full flex items-center justify-center bg-gray-50">
                            <span className="text-4xl sm:text-7xl">Gift</span>
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="p-2.5 sm:p-4 border-t border-gray-100">
                        <div className="mb-2 sm:mb-3">
                          <h3 className="font-bold text-gray-900 text-xs sm:text-base mb-0.5 sm:mb-1.5 leading-tight line-clamp-2">
                            {product.brand_name}
                          </h3>
                          <p className="text-xs text-gray-500 uppercase tracking-wide hidden sm:block">
                            {product.country_name}
                          </p>
                        </div>

                        {/* Denominations - Hidden on small mobile */}
                        {product.denominations && Array.isArray(product.denominations) && product.denominations.length > 0 && (
                          <div className="hidden sm:block mb-3">
                            <div className="flex flex-wrap gap-1.5">
                              {product.denominations.slice(0, 3).map((denom: number, idx: number) => (
                                <span key={idx} className="text-xs bg-gray-100 text-gray-700 font-medium px-2.5 py-1 rounded-md">
                                  {product.currency} {denom}
                                </span>
                              ))}
                              {product.denominations.length > 3 && (
                                <span className="text-xs text-gray-500 px-2 py-1 font-medium">
                                  +{product.denominations.length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Country & Currency - Simplified on mobile */}
                        <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3 pb-2 sm:pb-3 border-b border-gray-100">
                          <span className="font-medium truncate">{product.currency}</span>
                          <span className="hidden sm:inline font-medium truncate">* {product.country_name}</span>
                        </div>

                        {/* View Button */}
                        <button
                          onClick={() => setSelectedProduct(product)}
                          className="w-full px-3 sm:px-4 py-2 sm:py-2.5 min-h-[36px] sm:min-h-[40px] bg-purple-500 hover:bg-purple-600 text-white font-semibold text-xs sm:text-sm rounded-lg transition-colors shadow-sm"
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{selectedProduct.brand_name}</h2>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors -mr-2"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                  </button>
                </div>

                {selectedProduct.product_image && (
                  <img
                    src={selectedProduct.product_image}
                    alt={selectedProduct.brand_name}
                    className="w-full h-48 sm:h-64 object-contain bg-gray-50 rounded-lg mb-4 sm:mb-6"
                  />
                )}

                <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-1">Country</h3>
                      <p className="text-sm sm:text-base text-gray-900">{selectedProduct.country_name}</p>
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-1">Currency</h3>
                      <p className="text-sm sm:text-base text-gray-900">{selectedProduct.currency}</p>
                    </div>
                  </div>

                  {selectedProduct.denominations && Array.isArray(selectedProduct.denominations) && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">Available Denominations</h3>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {selectedProduct.denominations.map((denom: number, idx: number) => (
                          <span key={idx} className="bg-gray-100 text-gray-800 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium">
                            {selectedProduct.currency} {denom}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedProduct.value_restrictions && (
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-1">Value Range</h3>
                      <p className="text-sm sm:text-base text-gray-900">
                        {selectedProduct.currency} {selectedProduct.value_restrictions.min} - {selectedProduct.value_restrictions.max}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setShowPurchaseModal(true);
                  }}
                  className="w-full px-6 py-3 min-h-[48px] bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-colors"
                >
                  Purchase with Crypto
                </button>
              </div>
            </div>
          </div>
        )}

        {showPurchaseModal && selectedProduct && (
          <PurchaseModal
            product={selectedProduct}
            onClose={() => {
              setShowPurchaseModal(false);
              setSelectedProduct(null);
            }}
            onPurchaseComplete={(orderId, email) => {
              setShowPurchaseModal(false);
              setCurrentOrderId(orderId);
              setCurrentUserEmail(email);
              setShowOrderStatusModal(true);
            }}
          />
        )}

        {showOrderStatusModal && currentOrderId && (
          <OrderStatusModal
            orderId={currentOrderId}
            userEmail={currentUserEmail}
            onClose={() => {
              setShowOrderStatusModal(false);
              setCurrentOrderId(null);
              setCurrentUserEmail('');
              setSelectedProduct(null);
            }}
          />
        )}
      </div>
    </>
  );
}
