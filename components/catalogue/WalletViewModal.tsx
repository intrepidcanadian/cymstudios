'use client';

import { useState } from 'react';
import { X, Copy, Check, Send, Download, ExternalLink, Wallet } from 'lucide-react';
import { NETWORKS, getNetwork } from '@/config/networks';

interface WalletViewModalProps {
  onClose: () => void;
  onOpenSendModal: (token: 'usdc' | 'eth') => void;
  walletAddress: string;
  userEmail: string;
  usdcBalance: string | null;
  ethBalance: string | null;
  balanceLoading: boolean;
  onRefreshBalance: () => void;
  onExportWallet: () => void;
  selectedNetwork?: string;
}

export default function WalletViewModal({
  onClose,
  onOpenSendModal,
  walletAddress,
  userEmail,
  usdcBalance,
  ethBalance,
  balanceLoading,
  onRefreshBalance,
  onExportWallet,
  selectedNetwork = 'ethereum',
}: WalletViewModalProps) {
  const network = getNetwork(selectedNetwork);
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may fail in some contexts
    }
  };

  const truncatedAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-canvas-soft/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-md border border-line overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-ember to-purple-600 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-ink">My Wallet</h3>
              <p className="text-xs text-ink-dim">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-canvas-lift/50 hover:bg-canvas-lift text-ink-dim hover:text-ink transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wallet Address */}
        <div className="px-5 pt-5">
          <div className="flex items-center gap-2 p-3 bg-canvas-lift/50 rounded-xl border border-line-strong">
            <span className="font-mono text-sm text-ink-dim flex-1 truncate">{truncatedAddress}</span>
            <button
              onClick={copyAddress}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-line-strong bg-canvas-lift hover:brightness-110 hover:border-ember transition-colors"
              title="Copy full address"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-ink-dim" />
              )}
            </button>
            <a
              href={`${network.explorerUrl}/address/${walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-line-strong bg-canvas-lift hover:brightness-110 hover:border-ember transition-colors"
              title={`View on ${network.name} explorer`}
            >
              <ExternalLink className="w-4 h-4 text-ink-dim" />
            </a>
          </div>
        </div>

        {/* Balances */}
        <div className="px-5 pt-4 space-y-3">
          {/* Stablecoin Balance */}
          <div className="p-4 bg-canvas-lift/30 rounded-xl border border-line">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-xs">$</span>
                </div>
                <div>
                  <p className="text-xs text-ink-dim">{network.tokenSymbol}</p>
                  <p className="text-lg font-bold text-ink">
                    {balanceLoading ? (
                      <span className="text-ink-mute">Loading...</span>
                    ) : usdcBalance !== null ? (
                      parseFloat(usdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    ) : (
                      '0.00'
                    )}
                  </p>
                </div>
              </div>
              <span className="text-xs text-ink-mute bg-canvas-lift px-2 py-1 rounded-md">{network.name}</span>
            </div>
          </div>

          {/* Native Token Balance */}
          <div className="p-4 bg-canvas-lift/30 rounded-xl border border-line">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-canvas-lift flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">{network.nativeSymbol.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-xs text-ink-dim">{network.nativeSymbol}</p>
                  <p className="text-lg font-bold text-ink">
                    {balanceLoading ? (
                      <span className="text-ink-mute">Loading...</span>
                    ) : ethBalance !== null ? (
                      parseFloat(ethBalance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
                    ) : (
                      '0.0000'
                    )}
                  </p>
                </div>
              </div>
              <span className="text-xs text-ink-mute bg-canvas-lift px-2 py-1 rounded-md">{network.name}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenSendModal('usdc');
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-ember to-ember hover:brightness-110 text-white font-semibold rounded-xl transition-all shadow-lg"
            >
              <Send className="w-4 h-4" />
              Send {network.tokenSymbol}
            </button>
            <button
              onClick={() => {
                onClose();
                onOpenSendModal('eth');
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-canvas-lift to-canvas-lift hover:from-canvas-lift hover:to-canvas-lift text-white font-semibold rounded-xl transition-all shadow-lg border border-line-strong"
            >
              <Send className="w-4 h-4" />
              Send {network.nativeSymbol}
            </button>
          </div>

          <button
            onClick={onExportWallet}
            className="w-full flex items-center gap-3 px-4 py-3 bg-canvas-lift hover:brightness-110 text-ink font-medium rounded-xl transition-colors border border-line-strong"
          >
            <Download className="w-4 h-4" />
            Export Wallet
          </button>

          <button
            onClick={onRefreshBalance}
            disabled={balanceLoading}
            className="w-full text-center text-xs text-ink-mute hover:text-ink-dim py-2 transition-colors disabled:opacity-50"
          >
            {balanceLoading ? 'Refreshing...' : 'Refresh Balances'}
          </button>
        </div>
      </div>
    </div>
  );
}
