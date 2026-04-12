'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, AlertCircle, RefreshCw, ArrowUpDown, CreditCard, Gift } from 'lucide-react';

/** Order image with React-based fallback instead of hiding via style.display */
function OrderImage({ image, name }: { image?: string; name: string }) {
  const [error, setError] = useState(false);
  if (!image || error) return <Package className="w-6 h-6 text-slate-400" />;
  return (
    <img
      src={image}
      alt={name}
      loading="lazy"
      className="w-full h-full object-contain p-1"
      onError={() => setError(true)}
    />
  );
}

interface OrderSummary {
  order_id: string;
  brand_name: string;
  product_name?: string;
  product_image?: string;
  country_name?: string;
  currency: string;
  price: number;
  face_value?: number;
  voucher_currency?: string;
  payment_network?: string;
  status: string;
  created_at: string;
  completed_at?: string;
  error_message?: string;
  orderToken: string;
}

interface OrderHistoryListProps {
  walletAddress?: string;
  onViewOrder: (orderId: string, orderToken: string, userEmail: string) => void;
}

type StatusFilter = 'all' | 'failed' | 'processing' | 'completed' | 'pending_review';
type SortBy = 'date' | 'status';

const STATUS_ORDER: Record<string, number> = { failed: 0, pending_review: 1, processing: 2, completed: 3, pending: 4 };

export default function OrderHistoryList({ walletAddress, onViewOrder }: OrderHistoryListProps) {
  const PAGE_SIZE = 50;
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [resolvedEmail, setResolvedEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  const fetchOrders = useCallback(async (offset = 0) => {
    const savedProfile = typeof window !== 'undefined' ? localStorage.getItem('userProfile') : null;
    let savedEmail: string | null = null;
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        if (parsed.email) savedEmail = parsed.email;
      } catch {}
    }

    if (!walletAddress && !savedEmail) {
      setError('no_lookup');
      setLoading(false);
      return;
    }

    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (walletAddress) params.set('address', walletAddress);
      if (savedEmail) params.set('email', savedEmail);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      const response = await fetch(`/api/orders?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        const fetched = data.data || [];
        if (offset === 0) {
          setOrders(fetched);
        } else {
          setOrders((prev) => {
            const ids = new Set(prev.map((o) => o.order_id));
            return [...prev, ...fetched.filter((o: OrderSummary) => !ids.has(o.order_id))];
          });
        }
        setHasMore(fetched.length >= PAGE_SIZE);
        if (data.userEmail) setResolvedEmail(data.userEmail);
        setLastUpdated(new Date());
      } else {
        setError(data.error || 'Failed to load orders');
      }
    } catch {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Tick every 15s to keep "last updated" relative time fresh
  useEffect(() => {
    if (!lastUpdated) return;
    const interval = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const getRelativeTime = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  // Auto-refresh every 30s when there are pending/processing orders
  const hasPendingOrders = orders.some((o) => o.status === 'pending' || o.status === 'processing' || o.status === 'pending_review');
  useEffect(() => {
    if (!hasPendingOrders) return;
    const interval = setInterval(() => fetchOrders(), 30_000);
    return () => clearInterval(interval);
  }, [hasPendingOrders, fetchOrders]);

  const parseRefundInfo = (errorMessage?: string): { refunded: boolean; manualRefundNeeded: boolean } => {
    if (!errorMessage) return { refunded: false, manualRefundNeeded: false };
    try {
      const parsed = JSON.parse(errorMessage);
      if (parsed.refund_tx) return { refunded: true, manualRefundNeeded: false };
      if (parsed.requires_manual_refund) return { refunded: false, manualRefundNeeded: true };
    } catch (_) { /* not JSON */ }
    return { refunded: false, manualRefundNeeded: false };
  };

  const getStatusBadge = (status: string, errorMessage?: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      pending:        { bg: 'bg-yellow-900/50 border-yellow-700/50', text: 'text-yellow-300', label: 'Pending' },
      processing:     { bg: 'bg-blue-900/50 border-blue-700/50',    text: 'text-blue-300',   label: 'Processing' },
      completed:      { bg: 'bg-green-900/50 border-green-700/50',  text: 'text-green-300',  label: 'Completed' },
      failed:         { bg: 'bg-red-900/50 border-red-700/50',      text: 'text-red-300',    label: 'Failed' },
      pending_review: { bg: 'bg-orange-900/50 border-orange-700/50', text: 'text-orange-300', label: 'Under Review' },
    };
    const c = config[status] || config.pending;
    const refundInfo = status === 'failed' ? parseRefundInfo(errorMessage) : { refunded: false, manualRefundNeeded: false };
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold border ${c.bg} ${c.text}`}>
          {c.label}
        </span>
        {refundInfo.refunded && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-green-900/40 border border-green-700/40 text-green-400">
            Refunded
          </span>
        )}
        {refundInfo.manualRefundNeeded && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-yellow-900/40 border border-yellow-700/40 text-yellow-400">
            Refund Pending
          </span>
        )}
      </div>
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filteredOrders = useMemo(() => {
    let filtered = statusFilter === 'all'
      ? orders
      : orders.filter((o) => o.status === statusFilter);

    if (sortBy === 'status') {
      filtered = [...filtered].sort(
        (a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
      );
    }
    return filtered;
  }, [orders, statusFilter, sortBy]);

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="relative inline-flex">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-700 border-t-indigo-500" />
        </div>
        <p className="text-slate-400 mt-6 font-medium">Loading orders...</p>
      </div>
    );
  }

  if (error === 'no_lookup') {
    return (
      <div className="text-center py-20">
        <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-100 mb-2">Connect wallet to view orders</h3>
        <p className="text-slate-400 mb-4">Connect your wallet or make a purchase to see your order history.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-100 mb-2">Something went wrong</h3>
        <p className="text-slate-400 mb-6">{error}</p>
        <button
          onClick={() => fetchOrders()}
          className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-20">
        <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-100 mb-2">No orders yet</h3>
        <p className="text-slate-400">Your purchase history will appear here.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filter & Sort Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'failed', 'pending_review', 'processing', 'completed'] as StatusFilter[]).map((f) => {
            const count = f === 'all' ? orders.length : orders.filter((o) => o.status === f).length;
            if (f !== 'all' && count === 0) return null; // hide empty filter tabs
            const active = statusFilter === f;
            const colors: Record<StatusFilter, string> = {
              all: active ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200',
              failed: active ? 'bg-red-900/60 text-red-300 border-red-700/50' : 'text-slate-400 hover:text-red-300',
              pending_review: active ? 'bg-orange-900/60 text-orange-300 border-orange-700/50' : 'text-slate-400 hover:text-orange-300',
              processing: active ? 'bg-blue-900/60 text-blue-300 border-blue-700/50' : 'text-slate-400 hover:text-blue-300',
              completed: active ? 'bg-green-900/60 text-green-300 border-green-700/50' : 'text-slate-400 hover:text-green-300',
            };
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium border border-transparent transition-colors ${colors[f]}`}
              >
                {f === 'all' ? 'All' : f === 'pending_review' ? 'Under Review' : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSortBy(sortBy === 'date' ? 'status' : 'date')}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {sortBy === 'date' ? 'By Date' : 'By Status'}
          </button>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[10px] text-slate-500">{getRelativeTime(lastUpdated)}</span>
            )}
            <button
              onClick={() => fetchOrders()}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-400 mb-3">
        {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
        {statusFilter !== 'all' ? ` (${statusFilter})` : ''}
      </p>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-400">No {statusFilter} orders found.</p>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredOrders.map((order) => (
          <button
            key={order.order_id}
            onClick={() => onViewOrder(order.order_id, order.orderToken, resolvedEmail)}
            className="text-left bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-600 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-200"
          >
            <div className="flex items-start gap-3">
              {/* Product Image */}
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-white flex-shrink-0 overflow-hidden flex items-center justify-center">
                <OrderImage image={order.product_image} name={order.brand_name} />
                {/* Order type badge */}
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border border-slate-700" title={order.brand_name.toLowerCase().includes('mastercard') ? 'Prepaid Mastercard' : 'Gift Card'}>
                  {order.brand_name.toLowerCase().includes('mastercard') ? (
                    <CreditCard className="w-2.5 h-2.5 text-orange-400" />
                  ) : (
                    <Gift className="w-2.5 h-2.5 text-indigo-400" />
                  )}
                </span>
              </div>

              {/* Order Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-slate-100 text-sm truncate">
                    {order.product_name || order.brand_name}
                  </h3>
                  {getStatusBadge(order.status, order.error_message)}
                </div>

                <div className="flex items-baseline gap-1.5 mb-2">
                  <span className="text-base font-bold text-slate-100">
                    {order.voucher_currency || order.currency}{' '}
                    {(order.face_value || order.price).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{formatDate(order.created_at)}</span>
                  {order.payment_network && (
                    <span className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] text-slate-400 uppercase tracking-wider">
                      {order.payment_network === 'conflux' ? 'CFX' : order.payment_network === 'base' ? 'Base' : 'ETH'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Load More */}
      {hasMore && statusFilter === 'all' && (
        <div className="text-center mt-6">
          <button
            onClick={() => fetchOrders(orders.length)}
            disabled={loadingMore}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-lg transition-colors inline-flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-slate-500 border-t-slate-200" />
                Loading...
              </>
            ) : (
              'Load More Orders'
            )}
          </button>
        </div>
      )}
      </>
      )}
    </div>
  );
}
