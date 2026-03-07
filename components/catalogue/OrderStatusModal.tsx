'use client';

import { useState, useEffect } from 'react';

interface Order {
  order_id: string;
  product_id: number;
  brand_name: string;
  country_name: string;
  currency: string;
  price: number;
  status: string;
  user_email: string;

  // Voucher details
  voucher_code?: string;
  voucher_pin?: string;
  voucher_validity_date?: string;
  vouchers?: Array<{
    code: string;
    pin: string;
    validityDate: string;
    voucherCurrency: string;
    faceValue: number;
  }>;

  // xRemit financial details
  face_value?: number;
  cost?: number;
  commission?: number;
  voucher_discount_percent?: number;
  voucher_currency?: string;
  base_currency?: string;

  // Product info
  product_name?: string;
  product_image?: string;
  how_to_use?: string;
  terms_and_conditions?: string;

  // Timestamps
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

interface OrderStatusModalProps {
  orderId: string;
  userEmail: string;
  onClose: () => void;
}

export default function OrderStatusModal({ orderId, userEmail, onClose }: OrderStatusModalProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderIdCopied, setOrderIdCopied] = useState(false);

  useEffect(() => {
    fetchOrderStatus();

    // Poll for updates every 3 seconds if order is still processing
    const interval = setInterval(() => {
      if (order?.status === 'processing' || order?.status === 'pending') {
        fetchOrderStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [orderId, order?.status]);

  const fetchOrderStatus = async () => {
    try {
      const url = `/api/orders/${orderId}?userEmail=${encodeURIComponent(userEmail)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setOrder(data.data);
      } else {
        setError(data.error || 'Failed to fetch order status');
      }
    } catch (err) {
      console.error('Error fetching order:', err);
      setError('Failed to fetch order status');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: { [key: string]: { color: string; icon: string; text: string } } = {
      pending: { color: 'bg-gray-100 text-gray-700', icon: '⏳', text: 'Pending' },
      processing: { color: 'bg-blue-100 text-blue-700', icon: '🔄', text: 'Processing' },
      completed: { color: 'bg-green-100 text-green-700', icon: '✅', text: 'Completed' },
      failed: { color: 'bg-red-100 text-red-700', icon: '❌', text: 'Failed' },
      cancelled: { color: 'bg-gray-100 text-gray-700', icon: '⚠️', text: 'Cancelled' },
    };

    const badge = badges[status] || badges.pending;

    return (
      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        <span>{badge.icon}</span>
        <span>{badge.text}</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900">Order Status</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading order details...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : order ? (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex flex-col items-center gap-2">
                {getStatusBadge(order.status)}
                {/* Status Explanation */}
                <div className="text-xs text-gray-500 text-center max-w-xs">
                  {order.status === 'pending' && 'Payment verified, waiting for voucher generation'}
                  {order.status === 'processing' && 'Your order is being processed by xRemit (usually 1-5 minutes)'}
                  {order.status === 'completed' && 'Voucher generated and sent to your email'}
                  {order.status === 'failed' && 'Order could not be completed. Payment was refunded if processed.'}
                  {order.status === 'cancelled' && 'Order was cancelled. No charges were made.'}
                </div>
              </div>

              {/* Order Details */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Order ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-900">
                      {order.order_id.substring(0, 13)}...
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(order.order_id);
                          setOrderIdCopied(true);
                          setTimeout(() => setOrderIdCopied(false), 2000);
                        } catch (err) {
                          console.error('Failed to copy order ID:', err);
                        }
                      }}
                      className="flex items-center justify-center w-7 h-7 rounded border border-gray-300 bg-white hover:bg-gray-50 hover:border-purple-500 transition-colors cursor-pointer"
                      title="Copy full order ID"
                    >
                      {orderIdCopied ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Brand:</span>
                  <span className="font-semibold text-gray-900">{order.product_name || order.brand_name}</span>
                </div>

                {/* Show card value */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Card Value:</span>
                  <span className="font-semibold text-gray-900">
                    {order.face_value
                      ? `${order.voucher_currency || order.currency} ${order.face_value}`
                      : `${order.currency} ${order.price}`
                    }
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Email:</span>
                  <span className="text-gray-900">{order.user_email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Ordered:</span>
                  <span className="text-gray-900">{new Date(order.created_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Processing Message */}
              {(order.status === 'pending' || order.status === 'processing') && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 mb-2 font-medium">
                    Your order is being processed
                  </p>
                  <p className="text-xs text-blue-700">
                    Voucher details will be sent to <strong>{order.user_email}</strong> shortly.
                    This usually takes 1-5 minutes.
                  </p>
                </div>
              )}

              {/* Completed - Show Voucher */}
              {order.status === 'completed' && (
                <div className="space-y-3">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800 font-medium mb-2">
                      Order completed successfully!
                    </p>
                    <p className="text-xs text-green-700">
                      Voucher details have been sent to your email.
                    </p>
                  </div>

                  {/* Voucher Details */}
                  {order.voucher_code && (
                    <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-white">
                      <h4 className="font-semibold text-gray-900">Your Voucher:</h4>

                      {order.voucher_code && (() => {
                        // Extract code from URL if it's a URL, otherwise use as-is
                        let displayCode = order.voucher_code;
                        let codeUrl = null;

                        // Check if it's a URL
                        if (order.voucher_code.startsWith('http://') || order.voucher_code.startsWith('https://')) {
                          codeUrl = order.voucher_code;
                          // Try to extract code from URL (e.g., last path segment or hash)
                          const urlParts = order.voucher_code.split('/');
                          displayCode = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2] || order.voucher_code;
                          // If it's a very long code, truncate for display but keep full code available
                          if (displayCode.length > 50) {
                            displayCode = displayCode.substring(0, 30) + '...' + displayCode.substring(displayCode.length - 10);
                          }
                        }

                        const handleCopy = async () => {
                          try {
                            await navigator.clipboard.writeText(order.voucher_code!);
                          } catch (err) {
                            console.error('Failed to copy:', err);
                          }
                        };

                        return (
                          <div className="space-y-3">
                            {/* Gift Card Display with Product Image */}
                            {codeUrl && (
                              <a
                                href={codeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <div className="relative bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200 hover:border-purple-400 hover:shadow-xl transition-all duration-300 overflow-hidden group cursor-pointer">
                                  {/* Decorative background pattern */}
                                  <div className="absolute inset-0 opacity-5">
                                    <div className="absolute inset-0" style={{
                                      backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,0,0,0.3) 1px, transparent 0)',
                                      backgroundSize: '24px 24px'
                                    }}></div>
                                  </div>

                                  <div className="relative flex items-center gap-4">
                                    {/* Product Image */}
                                    <div className="flex-shrink-0 w-24 h-24 bg-white rounded-lg shadow-md p-2 border border-purple-200">
                                      {order.product_image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={order.product_image}
                                          alt={order.product_name || order.brand_name}
                                          className="w-full h-full object-contain"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50 rounded">
                                          <span className="text-5xl">🎁</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Card Info */}
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-bold text-lg text-gray-900 mb-1 truncate">
                                        {order.product_name || order.brand_name}
                                      </h5>
                                      {order.face_value && (
                                        <div className="text-2xl font-bold text-purple-600 mb-1">
                                          {order.voucher_currency || order.currency} {order.face_value}
                                        </div>
                                      )}
                                      <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <span className="inline-flex items-center gap-1">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          Click to redeem
                                        </span>
                                      </div>
                                    </div>

                                    {/* Arrow icon */}
                                    <div className="flex-shrink-0 text-purple-500 group-hover:translate-x-1 transition-transform">
                                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </div>
                                  </div>
                                </div>
                              </a>
                            )}

                            {/* Code Display (if not a URL or as additional info) */}
                            <div className="bg-gray-50 p-3 rounded border border-gray-200">
                              <div className="text-xs text-gray-600 mb-1">Code:</div>
                              <div
                                className="font-mono font-bold text-sm text-gray-900 break-all select-all cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors"
                                onClick={handleCopy}
                                title="Click to copy"
                              >
                                {displayCode}
                              </div>
                            </div>

                            {/* Copy Button */}
                            <button
                              onClick={handleCopy}
                              className="w-full p-3 bg-blue-50 border-2 border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer text-center"
                            >
                              <div className="text-sm font-medium text-blue-900">Copy {codeUrl ? 'Redemption URL' : 'Code'}</div>
                              <div className="text-xs text-blue-700 mt-1">Click to copy to clipboard</div>
                            </button>
                          </div>
                        );
                      })()}

                      {order.voucher_pin && (
                        <div className="bg-gray-50 p-3 rounded border border-gray-200">
                          <div className="text-xs text-gray-600 mb-1">PIN:</div>
                          <div className="font-mono font-bold text-lg text-gray-900 select-all">{order.voucher_pin}</div>
                        </div>
                      )}

                      {order.voucher_validity_date && (
                        <p className="text-xs text-gray-600">
                          Valid until: {new Date(order.voucher_validity_date).toLocaleDateString()}
                        </p>
                      )}

                      {/* Show all vouchers if multiple */}
                      {order.vouchers && order.vouchers.length > 1 && (
                        <div className="border-t border-gray-200 pt-3 mt-3">
                          <h5 className="text-sm font-semibold text-gray-700 mb-2">
                            All Vouchers ({order.vouchers.length}):
                          </h5>
                          {order.vouchers.map((voucher, idx) => (
                            <div key={idx} className="mb-2 p-2 bg-gray-50 rounded">
                              <div className="text-xs text-gray-600">Voucher {idx + 1}:</div>
                              <div className="font-mono text-xs text-gray-900 select-all">{voucher.code}</div>
                              <div className="text-xs text-gray-600">PIN: {voucher.pin}</div>
                              <div className="text-xs text-gray-500">
                                {voucher.voucherCurrency} {voucher.faceValue}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* How to Use Instructions */}
                      {order.how_to_use && (
                        <div className="border-t border-gray-200 pt-3 mt-3">
                          <h5 className="text-sm font-semibold text-gray-700 mb-2">How to Use:</h5>
                          <div
                            className="text-xs text-gray-600 leading-relaxed prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: order.how_to_use }}
                          />
                        </div>
                      )}

                      {/* Terms and Conditions */}
                      {order.terms_and_conditions && (
                        <div className="border-t border-gray-200 pt-3 mt-3">
                          <details className="group">
                            <summary className="text-xs font-semibold text-gray-700 cursor-pointer hover:text-gray-900 flex items-center gap-2">
                              <span className="group-open:rotate-90 transition-transform">▶</span>
                              Terms & Conditions
                            </summary>
                            <div
                              className="mt-2 text-xs text-gray-600 leading-relaxed prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: order.terms_and_conditions }}
                            />
                          </details>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Failed */}
              {order.status === 'failed' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800 font-medium mb-2">
                    Order failed
                  </p>
                  {order.error_message && (
                    <p className="text-xs text-red-700">{order.error_message}</p>
                  )}
                  <p className="text-xs text-red-700 mt-2">
                    Please contact support if you were charged.
                  </p>
                </div>
              )}

              {/* Close Button */}
              <button
                onClick={onClose}
                className="w-full py-3 px-6 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700 transition-all"
              >
                Close
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
