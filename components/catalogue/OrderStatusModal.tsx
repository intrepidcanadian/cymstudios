'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';

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

  // Payment info
  payment_network?: string;
  payment_from?: string;
  payment_value?: string;

  // Timestamps
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

const NETWORK_EXPLORERS: Record<string, { url: string; name: string }> = {
  ethereum: { url: 'https://etherscan.io', name: 'Etherscan' },
  base: { url: 'https://basescan.org', name: 'BaseScan' },
  conflux: { url: 'https://evm.confluxscan.org', name: 'ConfluxScan' },
};

interface OrderStatusModalProps {
  orderId: string;
  orderToken: string;
  userEmail: string;
  onClose: () => void;
  paymentTxHash?: string;
}

export default function OrderStatusModal({ orderId, orderToken, userEmail, onClose, paymentTxHash }: OrderStatusModalProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderIdCopied, setOrderIdCopied] = useState(false);
  const [voucherCopied, setVoucherCopied] = useState(false);
  const [pollingExpired, setPollingExpired] = useState(false);
  const [manualChecking, setManualChecking] = useState(false);
  const [pollsRemaining, setPollsRemaining] = useState(40);
  const pollCountRef = useRef(0);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    if (modalRef.current) {
      const first = modalRef.current.querySelector<HTMLElement>('button');
      first?.focus();
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  const MAX_POLLS = 40; // Stop polling after ~3.3 minutes (40 × 5s)

  useEffect(() => {
    let cancelled = false;
    pollCountRef.current = 0;

    const fetchOrderStatus = async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}`, {
          headers: {
            'Authorization': `Bearer ${orderToken}`,
          },
        });
        const data = await response.json();

        if (!cancelled) {
          if (data.success) {
            setOrder(data.data);
          } else {
            setError(data.error || 'Failed to fetch order status');
          }
        }
      } catch (err) {
        console.error('Error fetching order:', err);
        if (!cancelled) {
          setError('Failed to fetch order status');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchOrderStatus();

    // Poll for updates every 5 seconds, only while status is pending/processing
    // and only up to MAX_POLLS times to avoid hammering the server
    const interval = setInterval(() => {
      pollCountRef.current += 1;
      setPollsRemaining(MAX_POLLS - pollCountRef.current);
      if (pollCountRef.current >= MAX_POLLS) {
        clearInterval(interval);
        setPollingExpired(true);
        return;
      }
      // Read the latest order status from the DOM-stable ref pattern:
      // We use a functional form to check current state without needing it as a dependency
      setOrder((current) => {
        if (current?.status === 'processing' || current?.status === 'pending') {
          fetchOrderStatus();
        }
        return current; // don't change state
      });
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderId, orderToken]);

  const handleManualCheck = async () => {
    setManualChecking(true);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${orderToken}` },
      });
      const data = await response.json();
      if (data.success) {
        setOrder(data.data);
      }
    } catch (err) {
      console.error('Manual status check failed:', err);
    } finally {
      setManualChecking(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: { [key: string]: { color: string; icon: string; text: string } } = {
      pending: { color: 'bg-slate-700 text-slate-300', icon: '⏳', text: 'Pending' },
      processing: { color: 'bg-blue-900/50 text-blue-300', icon: '🔄', text: 'Processing' },
      completed: { color: 'bg-green-900/50 text-green-300', icon: '✅', text: 'Completed' },
      failed: { color: 'bg-red-900/50 text-red-300', icon: '❌', text: 'Failed' },
      pending_review: { color: 'bg-yellow-900/50 text-yellow-300', icon: '🔍', text: 'Under Review' },
      cancelled: { color: 'bg-slate-700 text-slate-300', icon: '⚠️', text: 'Cancelled' },
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Order Status" className="bg-slate-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-700">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-100">Order Status</h3>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-200 text-2xl leading-none p-1"
            >
              ×
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading order details...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          ) : order ? (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex flex-col items-center gap-2">
                {getStatusBadge(order.status)}
                {/* Status Explanation */}
                <div className="text-xs text-slate-400 text-center max-w-xs">
                  {order.status === 'pending' && 'Token redemption verified, waiting for voucher generation'}
                  {order.status === 'processing' && 'Your order is being processed (usually 1-5 minutes)'}
                  {order.status === 'completed' && 'Voucher generated and sent to your email'}
                  {order.status === 'failed' && 'Order could not be completed. Tokens were refunded if processed.'}
                  {order.status === 'pending_review' && 'Your payment was received but the gift card provider timed out. Our team is reviewing your order.'}
                  {order.status === 'cancelled' && 'Order was cancelled. No tokens were deducted.'}
                </div>
              </div>

              {/* Order Details */}
              <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Order ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-200">
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
                      className="flex items-center justify-center w-7 h-7 rounded border border-slate-600 bg-slate-700 hover:bg-slate-600 hover:border-indigo-500 transition-colors cursor-pointer"
                      title="Copy full order ID"
                      aria-label="Copy order ID to clipboard"
                    >
                      {orderIdCopied ? (
                        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Brand:</span>
                  <span className="font-semibold text-slate-100">{order.product_name || order.brand_name}</span>
                </div>

                {/* Show card value */}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Reward Value:</span>
                  <span className="font-semibold text-slate-100">
                    {order.face_value
                      ? `${order.voucher_currency || order.currency} ${order.face_value}`
                      : `${order.currency} ${order.price}`
                    }
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-slate-200">{order.user_email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Ordered:</span>
                  <span className="text-slate-200">{new Date(order.created_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Transaction Link */}
              {paymentTxHash && order.payment_network && NETWORK_EXPLORERS[order.payment_network] && (
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <a
                    href={`${NETWORK_EXPLORERS[order.payment_network].url}/tx/${paymentTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>View transaction on {NETWORK_EXPLORERS[order.payment_network].name}</span>
                  </a>
                </div>
              )}

              {/* Pending Review Message */}
              {order.status === 'pending_review' && (
                <div className="p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
                  <p className="text-sm text-yellow-300 mb-2 font-medium">
                    Your order is under review
                  </p>
                  <p className="text-xs text-yellow-400">
                    Your payment was received successfully. The gift card provider experienced a timeout,
                    so our team is verifying your order. You will receive your voucher at{' '}
                    <strong className="text-yellow-200">{order.user_email}</strong> once confirmed.
                    If you need help, contact <strong>info@ginsengswap.com</strong> with your order ID.
                  </p>
                  <button
                    onClick={handleManualCheck}
                    disabled={manualChecking}
                    className="mt-2 px-3 py-1.5 text-xs font-medium text-yellow-300 bg-yellow-900/30 border border-yellow-700/50 rounded-lg hover:bg-yellow-900/50 transition-colors disabled:opacity-50"
                  >
                    {manualChecking ? 'Checking...' : 'Check Status'}
                  </button>
                </div>
              )}

              {/* Processing Message */}
              {(order.status === 'pending' || order.status === 'processing') && (
                <div className="p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                  <p className="text-sm text-blue-300 mb-2 font-medium">
                    Your order is being processed
                  </p>
                  <p className="text-xs text-blue-400">
                    Voucher details will be sent to <strong className="text-blue-200">{order.user_email}</strong> shortly.
                    This usually takes 1-5 minutes.
                  </p>
                  {!pollingExpired && pollsRemaining > 0 && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Auto-checking for {Math.ceil(pollsRemaining * 5 / 60)}:{String((pollsRemaining * 5) % 60).padStart(2, '0')} more
                    </p>
                  )}
                  {pollingExpired && (
                    <div className="mt-2">
                      <p className="text-xs text-yellow-400">
                        Still processing — check your email or come back to My Orders later to view the result.
                      </p>
                      <button
                        onClick={handleManualCheck}
                        disabled={manualChecking}
                        className="mt-2 px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-900/30 border border-blue-700/50 rounded-lg hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                      >
                        {manualChecking ? 'Checking...' : 'Check Status'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Completed - Show Voucher */}
              {order.status === 'completed' && (
                <div className="space-y-3">
                  <div className="p-4 bg-green-900/30 border border-green-700/50 rounded-lg">
                    <p className="text-sm text-green-300 font-medium mb-2">
                      Redemption completed successfully!
                    </p>
                    <p className="text-xs text-green-400">
                      Voucher details have been sent to your email.
                    </p>
                  </div>

                  {/* Voucher Details */}
                  {order.voucher_code && (
                    <div className="border border-slate-700 rounded-lg p-4 space-y-3 bg-slate-800">
                      <h4 className="font-semibold text-slate-100">Your Voucher:</h4>

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
                            setVoucherCopied(true);
                            setTimeout(() => setVoucherCopied(false), 2000);
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
                                <div className="relative bg-gradient-to-br from-indigo-900/40 to-slate-800 rounded-xl p-6 border-2 border-indigo-700/50 hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 overflow-hidden group cursor-pointer">
                                  {/* Decorative background pattern */}
                                  <div className="absolute inset-0 opacity-5">
                                    <div className="absolute inset-0" style={{
                                      backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.3) 1px, transparent 0)',
                                      backgroundSize: '24px 24px'
                                    }}></div>
                                  </div>

                                  <div className="relative flex items-center gap-4">
                                    {/* Product Image */}
                                    <div className="flex-shrink-0 w-24 h-24 bg-white rounded-lg shadow-md p-2 border border-slate-600">
                                      {order.product_image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={order.product_image}
                                          alt={order.product_name || order.brand_name}
                                          className="w-full h-full object-contain"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900/40 to-slate-700 rounded">
                                          <span className="text-5xl">🎁</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Card Info */}
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-bold text-lg text-slate-100 mb-1 truncate">
                                        {order.product_name || order.brand_name}
                                      </h5>
                                      {order.face_value && (
                                        <div className="text-2xl font-bold text-indigo-400 mb-1">
                                          {order.voucher_currency || order.currency} {order.face_value}
                                        </div>
                                      )}
                                      <div className="flex items-center gap-2 text-sm text-slate-400">
                                        <span className="inline-flex items-center gap-1">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          Click to redeem
                                        </span>
                                      </div>
                                    </div>

                                    {/* Arrow icon */}
                                    <div className="flex-shrink-0 text-indigo-400 group-hover:translate-x-1 transition-transform">
                                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </div>
                                  </div>
                                </div>
                              </a>
                            )}

                            {/* Code Display (if not a URL or as additional info) */}
                            <div className="bg-slate-700/50 p-3 rounded border border-slate-600">
                              <div className="text-xs text-slate-400 mb-1">Code:</div>
                              <div
                                className="font-mono font-bold text-sm text-slate-100 break-all select-all cursor-pointer hover:bg-slate-600/50 p-1 rounded transition-colors"
                                onClick={handleCopy}
                                title="Click to copy"
                              >
                                {displayCode}
                              </div>
                            </div>

                            {/* Copy Button */}
                            <button
                              onClick={handleCopy}
                              aria-label={`Copy ${codeUrl ? 'redemption URL' : 'voucher code'} to clipboard`}
                              className={`w-full p-3 border-2 rounded-lg transition-colors cursor-pointer text-center ${
                                voucherCopied
                                  ? 'bg-green-900/30 border-green-700/50'
                                  : 'bg-indigo-900/30 border-indigo-700/50 hover:bg-indigo-900/50 hover:border-indigo-600'
                              }`}
                            >
                              <div className={`text-sm font-medium ${voucherCopied ? 'text-green-200' : 'text-indigo-200'}`}>
                                {voucherCopied ? 'Copied!' : `Copy ${codeUrl ? 'Redemption URL' : 'Code'}`}
                              </div>
                              <div className={`text-xs mt-1 ${voucherCopied ? 'text-green-400' : 'text-indigo-400'}`}>
                                {voucherCopied ? 'Saved to clipboard' : 'Click to copy to clipboard'}
                              </div>
                            </button>
                          </div>
                        );
                      })()}

                      {order.voucher_pin && (
                        <div className="bg-slate-700/50 p-3 rounded border border-slate-600">
                          <div className="text-xs text-slate-400 mb-1">PIN:</div>
                          <div className="font-mono font-bold text-lg text-slate-100 select-all">{order.voucher_pin}</div>
                        </div>
                      )}

                      {order.voucher_validity_date && (
                        <p className="text-xs text-slate-400">
                          Valid until: {new Date(order.voucher_validity_date).toLocaleDateString()}
                        </p>
                      )}

                      {/* Show all vouchers if multiple */}
                      {order.vouchers && order.vouchers.length > 1 && (
                        <div className="border-t border-slate-700 pt-3 mt-3">
                          <h5 className="text-sm font-semibold text-slate-300 mb-2">
                            All Vouchers ({order.vouchers.length}):
                          </h5>
                          {order.vouchers.map((voucher, idx) => (
                            <div key={idx} className="mb-2 p-2 bg-slate-700/50 rounded">
                              <div className="text-xs text-slate-400">Voucher {idx + 1}:</div>
                              <div className="font-mono text-xs text-slate-200 select-all">{voucher.code}</div>
                              <div className="text-xs text-slate-400">PIN: {voucher.pin}</div>
                              <div className="text-xs text-slate-500">
                                {voucher.voucherCurrency} {voucher.faceValue}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* How to Use Instructions */}
                      {order.how_to_use && (
                        <div className="border-t border-slate-700 pt-3 mt-3">
                          <h5 className="text-sm font-semibold text-slate-300 mb-2">How to Use:</h5>
                          <div
                            className="text-xs text-slate-400 leading-relaxed prose prose-sm prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(order.how_to_use) }}
                          />
                        </div>
                      )}

                      {/* Terms and Conditions */}
                      {order.terms_and_conditions && (
                        <div className="border-t border-slate-700 pt-3 mt-3">
                          <details className="group">
                            <summary className="text-xs font-semibold text-slate-300 cursor-pointer hover:text-slate-100 flex items-center gap-2">
                              <span className="group-open:rotate-90 transition-transform">▶</span>
                              Terms & Conditions
                            </summary>
                            <div
                              className="mt-2 text-xs text-slate-400 leading-relaxed prose prose-sm prose-invert max-w-none"
                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(order.terms_and_conditions) }}
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
                <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
                  <p className="text-sm text-red-300 font-medium mb-2">
                    Redemption failed
                  </p>
                  {order.error_message && (() => {
                    // error_message is stored as JSON.stringify({...}) — parse and show human-readable message
                    try {
                      const parsed = JSON.parse(order.error_message);
                      const msg = parsed.message || parsed.reason || parsed.error || order.error_message;
                      const refundTx = parsed.refund_tx;
                      const paymentTx = parsed.payment_tx;
                      const network = order.payment_network;
                      const explorer = network && NETWORK_EXPLORERS[network];
                      return (
                        <div className="space-y-2">
                          <p className="text-xs text-red-400">{msg}</p>
                          {paymentTx && explorer && (
                            <a
                              href={`${explorer.url}/tx/${paymentTx}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                              View payment transaction on {explorer.name}
                            </a>
                          )}
                          {refundTx && explorer && (
                            <a
                              href={`${explorer.url}/tx/${refundTx}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                              View refund transaction on {explorer.name}
                            </a>
                          )}
                          {!refundTx && parsed.requires_manual_refund && (
                            <p className="text-xs text-yellow-400">
                              Auto-refund failed. Please contact support at <strong>info@ginsengswap.com</strong> with your order ID for a manual refund.
                            </p>
                          )}
                        </div>
                      );
                    } catch {
                      return <p className="text-xs text-red-400">{order.error_message}</p>;
                    }
                  })()}
                  {/* Fallback payment TX link from prop when error_message doesn't contain it */}
                  {paymentTxHash && order.payment_network && NETWORK_EXPLORERS[order.payment_network] && !order.error_message?.includes('payment_tx') && (
                    <div className="mt-2">
                      <a
                        href={`${NETWORK_EXPLORERS[order.payment_network].url}/tx/${paymentTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        View payment transaction on {NETWORK_EXPLORERS[order.payment_network].name}
                      </a>
                    </div>
                  )}
                  <p className="text-xs text-red-400 mt-2">
                    If you need assistance, contact <strong>info@ginsengswap.com</strong> with your order ID.
                  </p>
                </div>
              )}

              {/* Close Button */}
              <button
                onClick={onClose}
                className="w-full py-3 px-6 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium text-slate-200 transition-all"
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
