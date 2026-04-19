'use client';

import { useState } from 'react';
import { X, Send, AlertTriangle, ExternalLink, ArrowLeft } from 'lucide-react';
import { useWalletClient, useSwitchChain } from 'wagmi';
import { NETWORKS } from '@/config/networks';

interface SendUsdcModalProps {
  onClose: () => void;
  walletAddress: string;
  currentBalance: string | null;
  onTransactionComplete: () => void;
  selectedNetwork: string;
}

type Step = 'input' | 'confirm' | 'sending' | 'success' | 'error';

export default function SendUsdcModal({
  onClose,
  walletAddress,
  currentBalance,
  onTransactionComplete,
  selectedNetwork,
}: SendUsdcModalProps) {
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const networkConfig = NETWORKS[selectedNetwork];

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const validateInputs = async (): Promise<boolean> => {
    const { ethers } = await import('ethers');

    if (!recipientAddress || !ethers.isAddress(recipientAddress)) {
      setError('Please enter a valid address');
      return false;
    }

    if (recipientAddress.toLowerCase() === walletAddress.toLowerCase()) {
      setError('Cannot send to your own address');
      return false;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount');
      return false;
    }

    if (currentBalance !== null && parsedAmount > parseFloat(currentBalance)) {
      setError(`Insufficient balance. You have ${parseFloat(currentBalance).toFixed(2)} ${networkConfig?.tokenSymbol}`);
      return false;
    }

    setError(null);
    return true;
  };

  const handleContinue = async () => {
    if (await validateInputs()) {
      setStep('confirm');
    }
  };

  const handleSend = async () => {
    if (!walletClient || !networkConfig) {
      setError('No wallet connected');
      setStep('error');
      return;
    }

    setSending(true);
    setStep('sending');

    try {
      const { ethers } = await import('ethers');

      // Switch chain if needed
      if (walletClient.chain.id !== networkConfig.chainId) {
        await switchChain({ chainId: networkConfig.chainId });
      }

      const provider = new ethers.BrowserProvider(walletClient.transport);
      const signer = await provider.getSigner();

      const tokenContract = new ethers.Contract(
        networkConfig.tokenAddress,
        ['function transfer(address to, uint256 amount) returns (bool)'],
        signer
      );

      const atomicAmount = ethers.parseUnits(amount, networkConfig.tokenDecimals);
      const tx = await tokenContract.transfer(recipientAddress, atomicAmount);
      setTxHash(tx.hash);

      await tx.wait();

      setStep('success');
      onTransactionComplete();
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') console.error('[SendUsdcModal] Transaction error:', err);
      if (err.code === 'ACTION_REJECTED' || err.message?.includes('rejected')) {
        setError('Transaction was rejected');
      } else if (err.message?.includes('insufficient funds for gas')) {
        setError(`Insufficient ${networkConfig?.nativeSymbol} for gas fees.`);
      } else {
        setError(err.message || 'Transaction failed');
      }
      setStep('error');
    } finally {
      setSending(false);
    }
  };

  const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const explorerUrl = networkConfig?.explorerUrl || 'https://etherscan.io';
  const tokenSymbol = networkConfig?.tokenSymbol || 'USDC';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-canvas-soft/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-md border border-line overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div className="flex items-center gap-3">
            {step === 'confirm' && (
              <button
                onClick={() => setStep('input')}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-canvas-lift/50 hover:bg-canvas-lift text-ink-dim transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-ember to-blue-600 flex items-center justify-center">
              <Send className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-ink">Send {tokenSymbol}</h3>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-canvas-lift/50 hover:bg-canvas-lift text-ink-dim hover:text-ink transition-all disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {step === 'input' && (
            <div className="space-y-4">
              <div className="p-3 bg-canvas-lift/30 rounded-xl border border-line">
                <p className="text-xs text-ink-dim">Available Balance</p>
                <p className="text-lg font-bold text-ink">
                  {currentBalance !== null
                    ? `${parseFloat(currentBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tokenSymbol}`
                    : `-- ${tokenSymbol}`}
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-2">Recipient Address</label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => { setRecipientAddress(e.target.value); setError(null); }}
                  placeholder="0x..."
                  className="w-full px-4 py-3 border-2 border-line-strong rounded-xl bg-canvas-lift text-ink placeholder:text-ink-mute focus:ring-2 focus:ring-ember focus:border-ember outline-none font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-2">Amount ({tokenSymbol})</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setError(null); }}
                    placeholder="0.00"
                    className="w-full px-4 py-3 pr-16 border-2 border-line-strong rounded-xl bg-canvas-lift text-ink placeholder:text-ink-mute focus:ring-2 focus:ring-ember focus:border-ember outline-none font-semibold"
                  />
                  {currentBalance !== null && parseFloat(currentBalance) > 0 && (
                    <button
                      onClick={() => setAmount(parseFloat(currentBalance).toFixed(2))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ember hover:text-ember font-semibold"
                    >
                      MAX
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-amber-900/20 border border-amber-700/30 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-300">
                  Sending {tokenSymbol} requires a small amount of {networkConfig?.nativeSymbol} for gas fees.
                </p>
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleContinue}
                disabled={!recipientAddress || !amount}
                className="w-full py-3 bg-gradient-to-r from-ember to-ember hover:from-ember hover:to-ember text-white font-semibold rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="p-4 bg-canvas-lift/30 rounded-xl border border-line space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-dim">From</span>
                  <span className="font-mono text-ink">{truncate(walletAddress)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-dim">To</span>
                  <span className="font-mono text-ink">{truncate(recipientAddress)}</span>
                </div>
                <div className="border-t border-line-strong pt-3 flex justify-between">
                  <span className="text-ink-dim text-sm">Amount</span>
                  <span className="text-lg font-bold text-ink">{parseFloat(amount).toFixed(2)} {tokenSymbol}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-amber-900/20 border border-amber-700/30 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-300">
                  Please verify the recipient address. Transactions cannot be reversed.
                </p>
              </div>

              <button
                onClick={handleSend}
                className="w-full py-3 bg-gradient-to-r from-ember to-ember hover:from-ember hover:to-ember text-white font-semibold rounded-xl transition-all shadow-lg"
              >
                Confirm & Send
              </button>

              <button
                onClick={() => setStep('input')}
                className="w-full py-2 text-sm text-ink-dim hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {step === 'sending' && (
            <div className="text-center py-8 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ember mx-auto" />
              <div>
                <p className="text-ink font-semibold">Sending {tokenSymbol}...</p>
                <p className="text-xs text-ink-dim mt-1">Please confirm in your wallet</p>
              </div>
              {txHash && (
                <a href={`${explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-ember hover:text-ember">
                  View on Explorer <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-900/30 border border-green-700/50 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-ink">Transaction Sent!</p>
                <p className="text-sm text-ink-dim mt-1">
                  {parseFloat(amount).toFixed(2)} {tokenSymbol} sent to {truncate(recipientAddress)}
                </p>
              </div>
              {txHash && (
                <a href={`${explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 bg-canvas-lift hover:bg-canvas-lift text-ink text-sm rounded-lg border border-line-strong transition-colors">
                  View on Explorer <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button onClick={onClose} className="w-full py-3 bg-canvas-lift hover:bg-canvas-lift text-ink font-medium rounded-xl transition-colors border border-line-strong">
                Done
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-700/50 flex items-center justify-center mx-auto">
                <X className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-ink">Transaction Failed</p>
                <p className="text-sm text-red-300 mt-1">{error}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setError(null); setStep('input'); }}
                  className="flex-1 py-3 bg-gradient-to-r from-ember to-ember hover:from-ember hover:to-ember text-white font-semibold rounded-xl transition-all"
                >
                  Try Again
                </button>
                <button onClick={onClose} className="flex-1 py-3 bg-canvas-lift hover:bg-canvas-lift text-ink font-medium rounded-xl transition-colors border border-line-strong">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
