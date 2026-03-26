'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, AlertCircle, RefreshCw, ArrowUpDown } from 'lucide-react';

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
  status: string;
  created_at: string;
  completed_at?: string;
  error_message?: string;
  orderToken: string;
}

interface OrderHistoryListProps {
  getAccessToken: () => Promise<string | null>;
  onViewOrder: (orderId: string, orderToken: string, userEmail: string) => void;
}

type StatusFilter = 'all' | 'failed' | 'processing' | 'completed';
type SortBy = 'date' | 'status';

const STATUS_ORDER: Record<string, number> = { failed: 0, processing: 1, completed: 2, pending: 3 };

export default function OrderHistoryList({ getAccessToken, onViewOrder }: OrderHistoryListProps) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [resolvedEmail, setResolvedEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }
      const response = await fetch('/api/orders', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      if (data.success) {
        setOrders(data.data || []);
        if (data.userEmail) setResolvedEmail(data.userEmail);
      } else {
        setError(data.error || 'Failed to load orders');
      }
    } catch {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      pending:    { bg: 'bg-yellow-900/50 border-yellow-700/50', text: 'text-yellow-300', label: 'Pending' },
      processing: { bg: 'bg-blue-900/50 border-blue-700/50',    text: 'text-blue-300',   label: 'Processing' },
      completed:  { bg: 'bg-green-900/50 border-green-700/50',  text: 'text-green-300',  label: 'Completed' },
      failed:     { bg: 'bg-red-900/50 border-red-700/50',      text: 'text-red-300',    label: 'Failed' },
    };
    const c = config[status] || config.pending;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold border ${c.bg} ${c.text}`}>
        {c.label}
      </span>
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

  if (error) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-100 mb-2">Something went wrong</h3>
        <p className="text-slate-400 mb-6">{error}</p>
        <button
          onClick={fetchOrders}
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
          {(['all', 'failed', 'processing', 'completed'] as StatusFilter[]).map((f) => {
            const count = f === 'all' ? orders.length : orders.filter((o) => o.status === f).length;
            const active = statusFilter === f;
            const colors: Record<StatusFilter, string> = {
              all: active ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200',
              failed: active ? 'bg-red-900/60 text-red-300 border-red-700/50' : 'text-slate-400 hover:text-red-300',
              processing: active ? 'bg-blue-900/60 text-blue-300 border-blue-700/50' : 'text-slate-400 hover:text-blue-300',
              completed: active ? 'bg-green-900/60 text-green-300 border-green-700/50' : 'text-slate-400 hover:text-green-300',
            };
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium border border-transparent transition-colors ${colors[f]}`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
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
          <button
            onClick={fetchOrders}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredOrders.map((order) => (
          <button
            key={order.order_id}
            onClick={() => onViewOrder(order.order_id, order.orderToken, resolvedEmail)}
            className="text-left bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-600 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-200"
          >
            <div className="flex items-start gap-3">
              {/* Product Image */}
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-white flex-shrink-0 overflow-hidden flex items-center justify-center">
                {order.product_image ? (
                  <img
                    src={order.product_image}
                    alt={order.brand_name}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <Package className="w-6 h-6 text-slate-400" />
                )}
              </div>

              {/* Order Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-slate-100 text-sm truncate">
                    {order.product_name || order.brand_name}
                  </h3>
                  {getStatusBadge(order.status)}
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

                <p className="text-xs text-slate-500">
                  {formatDate(order.created_at)}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
