'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, Loader2, ArrowLeft, Mail, Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
interface OrderData {
  order_id: string;
  status: string;
  brand_name?: string;
  product_name?: string;
  price?: number;
  currency?: string;
  face_value?: number;
  voucher_currency?: string;
  voucher_code?: string;
  voucher_pin?: string;
  voucher_validity_date?: string;
  how_to_use?: string;
  error_message?: string;
  created_at?: string;
  completed_at?: string;
  user_email?: string;
}

interface TransactionStatusProps {
  status: 'success' | 'fail';
  orderId: string | null;
  orderToken?: string | null;
  onBack: () => void;
}

export function TransactionStatus({ status, orderId, orderToken, onBack }: TransactionStatusProps) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);

  const fetchOrderStatus = async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    try {
      // Use orderToken if available (from purchase flow)
      if (!orderToken) {
        setError('Order token not available. Please check your email for confirmation.');
        stopPolling();
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${orderToken}`,
        },
      });
      const data = await response.json();

      if (data.success && data.data) {
        setOrder(data.data);

        // Stop polling if order is in a terminal state
        if (data.data.status === 'completed' || data.data.status === 'failed') {
          stopPolling();
        }
      } else {
        // Order not found yet — keep polling if it was just created
        if (pollCountRef.current > 20) {
          setError('Unable to find order details. Please check your email for confirmation.');
          stopPolling();
        }
      }
    } catch (err) {
      console.error('Error fetching order status:', err);
      if (pollCountRef.current > 5) {
        setError('Unable to check order status. Please check your email for confirmation.');
        stopPolling();
      }
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    pollCountRef.current = 0;
    fetchOrderStatus();

    pollRef.current = setInterval(() => {
      pollCountRef.current += 1;
      fetchOrderStatus();
    }, 5000); // Poll every 5 seconds
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    if (orderId && orderToken) {
      startPolling();
    } else {
      setLoading(false);
    }

    return () => stopPolling();
  }, [orderId, orderToken]);

  const handleCopy = async (text: string, type: 'code' | 'pin') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedPin(true);
        setTimeout(() => setCopiedPin(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Determine display status from order data or URL param
  const displayStatus = order?.status || (status === 'success' ? 'processing' : 'failed');

  const isCompleted = displayStatus === 'completed';
  const isFailed = displayStatus === 'failed';
  const isProcessing = displayStatus === 'processing' || displayStatus === 'pending';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative w-full max-w-md mx-auto"
    >
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 shadow-lg">
        <div className="relative p-6 space-y-5">
          {/* Status Icon */}
          <div className="text-center space-y-3">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
              isCompleted
                ? 'bg-green-100 dark:bg-green-900/30'
                : isFailed
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : 'bg-blue-100 dark:bg-blue-900/30'
            }`}>
              {isCompleted ? (
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              ) : isFailed ? (
                <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              ) : loading ? (
                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
              ) : (
                <Clock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              )}
            </div>

            <h3 className={`text-lg font-semibold ${
              isCompleted
                ? 'text-green-700 dark:text-green-300'
                : isFailed
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-blue-700 dark:text-blue-300'
            }`}>
              {isCompleted
                ? 'Transaction Complete'
                : isFailed
                  ? 'Transaction Failed'
                  : 'Processing Transaction'}
            </h3>

            <p className="text-sm text-muted-foreground">
              {isCompleted
                ? 'Your purchase has been completed successfully.'
                : isFailed
                  ? order?.error_message || 'Your transaction could not be completed. Please try again.'
                  : 'Your transaction is being processed. This may take a moment.'}
            </p>
          </div>

          {/* Order Details */}
          {order && (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200/60 dark:border-slate-700/60 divide-y divide-slate-200/60 dark:divide-slate-700/60">
                {(order.product_name || order.brand_name) && (
                  <div className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Product</span>
                    <span className="text-sm font-medium text-foreground">{order.product_name || order.brand_name}</span>
                  </div>
                )}

                {order.face_value && (
                  <div className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Value</span>
                    <span className="text-sm font-medium text-foreground">
                      {order.voucher_currency || order.currency || ''} {order.face_value}
                    </span>
                  </div>
                )}

                {order.price && (
                  <div className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Amount Paid</span>
                    <span className="text-sm font-medium text-foreground">
                      {order.currency || ''} {order.price}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className={`text-sm font-medium ${
                    isCompleted ? 'text-green-600' : isFailed ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Processing'}
                    {isProcessing && (
                      <Loader2 className="w-3 h-3 inline-block ml-1 animate-spin" />
                    )}
                  </span>
                </div>

                {orderId && (
                  <div className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Order ID</span>
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{orderId}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Voucher Details (completed orders) */}
          {isCompleted && order?.voucher_code && (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-50/50 dark:bg-green-950/20 border border-green-200/50 dark:border-green-800/50 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-green-700 dark:text-green-300">Voucher Details</h4>

                {/* Voucher Code */}
                <div className="space-y-1">
                  <span className="text-xs text-green-600 dark:text-green-400">Code</span>
                  <div className="flex items-center gap-2">
                    {order.voucher_code.startsWith('http') ? (
                      <a
                        href={order.voucher_code}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline truncate flex-1"
                      >
                        Redeem Here <ExternalLink className="w-3 h-3 inline-block ml-1" />
                      </a>
                    ) : (
                      <span className="text-sm font-mono text-foreground truncate flex-1">{order.voucher_code}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => handleCopy(order.voucher_code!, 'code')}
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* Voucher PIN */}
                {order.voucher_pin && (
                  <div className="space-y-1">
                    <span className="text-xs text-green-600 dark:text-green-400">PIN</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-foreground">{order.voucher_pin}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => handleCopy(order.voucher_pin!, 'pin')}
                      >
                        {copiedPin ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Validity Date */}
                {order.voucher_validity_date && (
                  <div className="space-y-1">
                    <span className="text-xs text-green-600 dark:text-green-400">Valid Until</span>
                    <span className="text-sm text-foreground block">{order.voucher_validity_date}</span>
                  </div>
                )}
              </div>

              {/* How to Use */}
              {order.how_to_use && (
                <div className="rounded-lg bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">How to Use</h4>
                  <p className="text-xs text-muted-foreground whitespace-pre-line">{order.how_to_use}</p>
                </div>
              )}
            </div>
          )}

          {/* Email notification note */}
          {(isCompleted || isProcessing) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isCompleted
                  ? 'Voucher details have also been sent to your email.'
                  : 'You will receive an email once the transaction is complete.'}
              </span>
            </div>
          )}

          {/* Error details for failed transactions */}
          {isFailed && error && (
            <div className="text-xs text-red-500 bg-red-50/50 dark:bg-red-950/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* No order ID fallback */}
          {!orderId && !loading && (
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                {status === 'success'
                  ? 'Your payment was submitted. Check your email for confirmation.'
                  : 'The transaction was not completed.'}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 space-y-2">
            <Button
              onClick={onBack}
              variant="default"
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {isCompleted ? 'Make Another Purchase' : isFailed ? 'Try Again' : 'Back to Form'}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
