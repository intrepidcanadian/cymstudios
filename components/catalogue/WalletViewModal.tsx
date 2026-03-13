'use client';

import { useState } from 'react';
import { X, Copy, Check, Send, Download, ExternalLink, Wallet } from 'lucide-react';

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
}: WalletViewModalProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const truncatedAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-md border border-slate-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">My Wallet</h3>
              <p className="text-xs text-slate-400">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-slate-100 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wallet Address */}
        <div className="px-5 pt-5">
          <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-xl border border-slate-600">
            <span className="font-mono text-sm text-slate-300 flex-1 truncate">{truncatedAddress}</span>
            <button
              onClick={copyAddress}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-600 bg-slate-700 hover:bg-slate-600 hover:border-indigo-500 transition-colors"
              title="Copy full address"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-slate-300" />
              )}
            </button>
            <a
              href={`https://etherscan.io/address/${walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-600 bg-slate-700 hover:bg-slate-600 hover:border-indigo-500 transition-colors"
              title="View on Etherscan"
            >
              <ExternalLink className="w-4 h-4 text-slate-300" />
            </a>
          </div>
        </div>

        {/* Balances */}
        <div className="px-5 pt-4 space-y-3">
          {/* USDC Balance */}
          <div className="p-4 bg-slate-700/30 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-xs">$</span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">USDC</p>
                  <p className="text-lg font-bold text-slate-100">
                    {balanceLoading ? (
                      <span className="text-slate-500">Loading...</span>
                    ) : usdcBalance !== null ? (
                      parseFloat(usdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    ) : (
                      '0.00'
                    )}
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-500 bg-slate-700 px-2 py-1 rounded-md">Ethereum</span>
            </div>
          </div>

          {/* ETH Balance */}
          <div className="p-4 bg-slate-700/30 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">E</span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">ETH</p>
                  <p className="text-lg font-bold text-slate-100">
                    {balanceLoading ? (
                      <span className="text-slate-500">Loading...</span>
                    ) : ethBalance !== null ? (
                      parseFloat(ethBalance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
                    ) : (
                      '0.0000'
                    )}
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-500 bg-slate-700 px-2 py-1 rounded-md">Ethereum</span>
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
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all shadow-lg"
            >
              <Send className="w-4 h-4" />
              Send USDC
            </button>
            <button
              onClick={() => {
                onClose();
                onOpenSendModal('eth');
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-semibold rounded-xl transition-all shadow-lg border border-slate-500"
            >
              <Send className="w-4 h-4" />
              Send ETH
            </button>
          </div>

          <button
            onClick={onExportWallet}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-xl transition-colors border border-slate-600"
          >
            <Download className="w-4 h-4" />
            Export Wallet
          </button>

          <button
            onClick={onRefreshBalance}
            disabled={balanceLoading}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-300 py-2 transition-colors disabled:opacity-50"
          >
            {balanceLoading ? 'Refreshing...' : 'Refresh Balances'}
          </button>
        </div>
      </div>
    </div>
  );
}
