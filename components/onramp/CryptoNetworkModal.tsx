'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Search, Check, Sparkles, Network } from 'lucide-react';
import { CryptoIcon, NetworkIcon } from '@/utils/cryptoIcons';

interface CryptoOption {
  symbol: string;
  name: string;
  networks: string[];
}

interface CryptoNetworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (crypto: string, network: string) => void;
  availableCryptos: CryptoOption[];
  selectedCrypto?: string;
  selectedNetwork?: string;
}

export function CryptoNetworkModal({
  isOpen,
  onClose,
  onSelect,
  availableCryptos,
  selectedCrypto,
  selectedNetwork
}: CryptoNetworkModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [networkSearchTerm, setNetworkSearchTerm] = useState('');
  const [selectedCryptoInternal, setSelectedCryptoInternal] = useState<string>(selectedCrypto || '');
  const [selectedNetworkInternal, setSelectedNetworkInternal] = useState<string>(selectedNetwork || '');

  useEffect(() => {
    if (isOpen) {
      setSelectedCryptoInternal(selectedCrypto || '');
      setSelectedNetworkInternal(selectedNetwork || '');
      setSearchTerm('');
      setNetworkSearchTerm('');
    }
  }, [isOpen, selectedCrypto, selectedNetwork]);

  const filteredCryptos = availableCryptos.filter(crypto =>
    crypto.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    crypto.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCryptoData = availableCryptos.find(c => c.symbol === selectedCryptoInternal);
  const availableNetworks = selectedCryptoData?.networks || [];

  const filteredNetworks = availableNetworks.filter(network =>
    network.toLowerCase().includes(networkSearchTerm.toLowerCase())
  );

  const handleCryptoSelect = (crypto: string) => {
    setSelectedCryptoInternal(crypto);
    const newCryptoData = availableCryptos.find(c => c.symbol === crypto);
    if (newCryptoData && !newCryptoData.networks.includes(selectedNetworkInternal)) {
      setSelectedNetworkInternal('');
    }
  };

  const handleNetworkSelect = (network: string) => {
    setSelectedNetworkInternal(network);
  };

  const handleConfirm = () => {
    if (selectedCryptoInternal && selectedNetworkInternal) {
      onSelect(selectedCryptoInternal, selectedNetworkInternal);
      onClose();
    }
  };

  if (!isOpen) return null;

  const networkNames: Record<string, string> = {
    'ERC20': 'Ethereum Network',
    'BEP20': 'Binance Smart Chain',
    'TRC20': 'TRON Network',
    'SOL': 'Solana Network',
    'BTC': 'Bitcoin Network',
    'LIGHTNING': 'Lightning Network',
    'ArbitrumOne': 'Arbitrum One',
    'Optimism': 'Optimism Network',
    'Polygon': 'Polygon Network',
    'BASE': 'Base Network',
    'AVAXC-Chain': 'Avalanche C-Chain',
    'Aptos': 'Aptos Network',
    'TON': 'TON Network',
    'Morph': 'Morph Network',
    'Noble': 'Noble Network',
    'SCROLL': 'Scroll Network',
    'Starknet': 'Starknet Network',
    'zkSyncEra': 'zkSync Era',
    'LINEA': 'Linea Network',
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-8"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-5xl max-h-[85vh] flex flex-col rounded-2xl my-4"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50/90 via-slate-100/80 to-slate-50/90 dark:from-canvas/90 dark:via-slate-800/80 dark:to-canvas/90 backdrop-blur-xl border border-white/20 dark:border-line/30 shadow-2xl rounded-2xl" />
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-500/10 animate-pulse opacity-50 rounded-2xl" />

          <div className="relative z-10 flex flex-col h-full overflow-hidden">
            <div className="relative flex items-center justify-between p-6 border-b border-white/10 dark:border-line/30 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-ember/20 backdrop-blur-sm border border-white/20 dark:border-line/30">
                  <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-ember bg-clip-text text-transparent">
                    Select Cryptocurrency & Network
                  </h2>
                  <p className="text-sm text-ink-mute dark:text-ink-dim mt-1">
                    Choose your cryptocurrency and network
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-white/10 dark:bg-canvas-soft/50 hover:bg-white/20 dark:hover:bg-canvas-lift/50 backdrop-blur-sm border border-white/10 dark:border-line/30 transition-all"
              >
                <X className="w-5 h-5 text-foreground" />
              </button>
            </div>

            <div className="p-6 border-b border-white/10 dark:border-line/30 grid grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-dim dark:text-ink-mute z-10" />
                <input
                  type="text"
                  placeholder="Search cryptocurrencies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/20 dark:bg-canvas-soft/30 backdrop-blur-md border border-white/20 dark:border-line/30 text-foreground placeholder:text-ink-dim dark:placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-dim dark:text-ink-mute z-10" />
                <input
                  type="text"
                  placeholder={selectedCryptoInternal ? "Search networks..." : "Select a cryptocurrency first"}
                  value={networkSearchTerm}
                  onChange={(e) => setNetworkSearchTerm(e.target.value)}
                  disabled={!selectedCryptoInternal}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/20 dark:bg-canvas-soft/30 backdrop-blur-md border border-white/20 dark:border-line/30 text-foreground placeholder:text-ink-dim dark:placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex-1 p-6 overflow-hidden flex gap-6 min-h-0">
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-foreground mb-2">Cryptocurrencies</h3>
                  <p className="text-sm text-ink-mute dark:text-ink-dim">Select a cryptocurrency</p>
                </div>
                <div className="space-y-3">
                  {filteredCryptos.map((crypto, index) => (
                    <motion.div
                      key={crypto.symbol}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`group relative cursor-pointer rounded-xl p-4 backdrop-blur-md border transition-all duration-300 ${
                        selectedCryptoInternal === crypto.symbol
                          ? 'bg-gradient-to-br from-blue-500/30 to-ember/30 border-blue-500/50 shadow-lg shadow-blue-500/20'
                          : 'bg-white/10 dark:bg-canvas-soft/30 border-white/20 dark:border-line/30 hover:bg-white/20 dark:hover:bg-canvas-lift/40 hover:border-blue-400/30 hover:shadow-lg'
                      }`}
                      onClick={() => handleCryptoSelect(crypto.symbol)}
                    >
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/0 via-indigo-500/0 to-blue-500/0 group-hover:from-blue-500/10 group-hover:via-indigo-500/10 group-hover:to-blue-500/10 transition-all duration-300 opacity-0 group-hover:opacity-100" />
                      <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`p-2 rounded-xl backdrop-blur-sm ${
                            selectedCryptoInternal === crypto.symbol
                              ? 'bg-white/20 dark:bg-canvas/40'
                              : 'bg-white/10 dark:bg-canvas-lift/30'
                          }`}>
                            <CryptoIcon symbol={crypto.symbol} size={36} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-base text-foreground">{crypto.symbol}</div>
                            <div className="text-sm text-ink-mute dark:text-ink-dim truncate">{crypto.name}</div>
                            <div className="flex items-center gap-1 mt-1">
                              <div className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/30">
                                {crypto.networks.length} network{crypto.networks.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                        {selectedCryptoInternal === crypto.symbol && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="p-1.5 rounded-full bg-blue-500 text-white shadow-lg"
                          >
                            <Check className="w-4 h-4" />
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="w-px bg-white/10 dark:bg-canvas-lift/30" />

              <div className="flex-1 overflow-y-auto pl-2">
                {selectedCryptoInternal ? (
                  <>
                    <div className="mb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <CryptoIcon symbol={selectedCryptoData?.symbol || ''} size={24} />
                        <h3 className="text-lg font-semibold text-foreground">
                          {selectedCryptoData?.name} Networks
                        </h3>
                      </div>
                      <p className="text-sm text-ink-mute dark:text-ink-dim">
                        Select a network for {selectedCryptoData?.symbol}
                      </p>
                    </div>
                    {filteredNetworks.length > 0 ? (
                      <div className="space-y-3">
                        {filteredNetworks.map((network, index) => (
                          <motion.div
                            key={network}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className={`group relative cursor-pointer rounded-xl p-4 backdrop-blur-md border transition-all duration-300 ${
                              selectedNetworkInternal === network
                                ? 'bg-gradient-to-br from-blue-500/30 to-ember/30 border-blue-500/50 shadow-lg shadow-blue-500/20'
                                : 'bg-white/10 dark:bg-canvas-soft/30 border-white/20 dark:border-line/30 hover:bg-white/20 dark:hover:bg-canvas-lift/40 hover:border-blue-400/30 hover:shadow-lg'
                            }`}
                            onClick={() => handleNetworkSelect(network)}
                          >
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/0 via-indigo-500/0 to-blue-500/0 group-hover:from-blue-500/10 group-hover:via-indigo-500/10 group-hover:to-blue-500/10 transition-all duration-300 opacity-0 group-hover:opacity-100" />
                            <div className="relative flex items-center justify-between">
                              <div className="flex items-center gap-4 flex-1">
                                <div className={`p-2 rounded-xl backdrop-blur-sm ${
                                  selectedNetworkInternal === network
                                    ? 'bg-white/20 dark:bg-canvas/40'
                                    : 'bg-white/10 dark:bg-canvas-lift/30'
                                }`}>
                                  <NetworkIcon network={network} size={36} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-base text-foreground">{network}</div>
                                  <div className="text-sm text-ink-mute dark:text-ink-dim">
                                    {networkNames[network] || `${network} Network`}
                                  </div>
                                </div>
                              </div>
                              {selectedNetworkInternal === network && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="p-1.5 rounded-full bg-blue-500 text-white shadow-lg"
                                >
                                  <Check className="w-4 h-4" />
                                </motion.div>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-ink-mute dark:text-ink-dim">
                        <p>No networks found matching &quot;{networkSearchTerm}&quot;</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <div className="p-4 rounded-xl bg-white/5 dark:bg-canvas-soft/20 backdrop-blur-sm border border-white/10 dark:border-line/20 inline-block mb-4">
                      <Network className="w-12 h-12 text-ink-dim dark:text-ink-mute" />
                    </div>
                    <p className="text-ink-mute dark:text-ink-dim font-medium">
                      Select a cryptocurrency to view available networks
                    </p>
                  </div>
                )}
              </div>
            </div>

            {selectedCryptoInternal && selectedNetworkInternal && (
              <div className="relative p-6 pb-6 border-t border-white/10 dark:border-line/30 backdrop-blur-sm bg-white/5 dark:bg-canvas/20 flex-shrink-0 mt-auto">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 dark:bg-canvas-soft/30 backdrop-blur-sm border border-white/20 dark:border-line/30">
                      <CryptoIcon symbol={selectedCryptoData?.symbol || ''} size={20} />
                      <span className="text-sm font-semibold text-foreground">{selectedCryptoData?.symbol}</span>
                      <span className="text-ink-dim">on</span>
                      <NetworkIcon network={selectedNetworkInternal} size={20} />
                      <span className="text-sm font-semibold text-foreground">{selectedNetworkInternal}</span>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleConfirm}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-ember text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all flex items-center gap-2 flex-shrink-0"
                  >
                    <Check className="w-4 h-4" />
                    Confirm Selection
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
