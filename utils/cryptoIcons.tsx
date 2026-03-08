import React from 'react';
import {
  Network,
  Zap,
  Layers,
  Activity,
  Hexagon,
  Coins
} from 'lucide-react';

// Crypto color mapping for fallback and styling
const cryptoColors: Record<string, { color: string; bgColor: string }> = {
  'BTC': { color: 'text-orange-500', bgColor: 'bg-orange-500/20' },
  'ETH': { color: 'text-blue-500', bgColor: 'bg-blue-500/20' },
  'USDT': { color: 'text-green-500', bgColor: 'bg-green-500/20' },
  'USDC': { color: 'text-blue-400', bgColor: 'bg-blue-400/20' },
  'BNB': { color: 'text-yellow-500', bgColor: 'bg-yellow-500/20' },
  'SOL': { color: 'text-purple-500', bgColor: 'bg-purple-500/20' },
};

// Helper function to get crypto icon URL from public folder
const getCryptoIconUrl = (symbol: string): string => {
  const lowerSymbol = symbol.toLowerCase();
  return `/crypto-icons/${lowerSymbol}.svg`;
};

// Network icon mapping with colors
const networkIcons: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
  'ERC20': { icon: <Network className="w-full h-full" />, color: 'text-blue-500', bgColor: 'bg-blue-500/20' },
  'ETH': { icon: <Network className="w-full h-full" />, color: 'text-blue-500', bgColor: 'bg-blue-500/20' },
  'BEP20': { icon: <Network className="w-full h-full" />, color: 'text-yellow-500', bgColor: 'bg-yellow-500/20' },
  'TRC20': { icon: <Network className="w-full h-full" />, color: 'text-red-500', bgColor: 'bg-red-500/20' },
  'SOL': { icon: <Zap className="w-full h-full" />, color: 'text-purple-500', bgColor: 'bg-purple-500/20' },
  'BTC': { icon: <Coins className="w-full h-full" />, color: 'text-orange-500', bgColor: 'bg-orange-500/20' },
  'LIGHTNING': { icon: <Zap className="w-full h-full" />, color: 'text-yellow-400', bgColor: 'bg-yellow-400/20' },
  'ArbitrumOne': { icon: <Layers className="w-full h-full" />, color: 'text-blue-400', bgColor: 'bg-blue-400/20' },
  'Optimism': { icon: <Layers className="w-full h-full" />, color: 'text-red-400', bgColor: 'bg-red-400/20' },
  'Polygon': { icon: <Hexagon className="w-full h-full" />, color: 'text-purple-400', bgColor: 'bg-purple-400/20' },
  'BASE': { icon: <Layers className="w-full h-full" />, color: 'text-blue-300', bgColor: 'bg-blue-300/20' },
  'AVAXC-Chain': { icon: <Activity className="w-full h-full" />, color: 'text-red-500', bgColor: 'bg-red-500/20' },
  'Aptos': { icon: <Hexagon className="w-full h-full" />, color: 'text-blue-500', bgColor: 'bg-blue-500/20' },
  'TON': { icon: <Network className="w-full h-full" />, color: 'text-blue-400', bgColor: 'bg-blue-400/20' },
  'Morph': { icon: <Layers className="w-full h-full" />, color: 'text-purple-500', bgColor: 'bg-purple-500/20' },
  'Noble': { icon: <Network className="w-full h-full" />, color: 'text-indigo-500', bgColor: 'bg-indigo-500/20' },
  'SCROLL': { icon: <Layers className="w-full h-full" />, color: 'text-orange-400', bgColor: 'bg-orange-400/20' },
  'Starknet': { icon: <Hexagon className="w-full h-full" />, color: 'text-pink-500', bgColor: 'bg-pink-500/20' },
  'zkSyncEra': { icon: <Layers className="w-full h-full" />, color: 'text-blue-500', bgColor: 'bg-blue-500/20' },
  'LINEA': { icon: <Network className="w-full h-full" />, color: 'text-cyan-500', bgColor: 'bg-cyan-500/20' },
};

interface CryptoIconProps {
  symbol: string;
  size?: number;
}

export const CryptoIcon = ({ symbol, size = 24 }: CryptoIconProps) => {
  const displaySize = size || 24;
  const upperSymbol = symbol.toUpperCase();
  const lowerSymbol = symbol.toLowerCase();
  const colorData = cryptoColors[upperSymbol] || { color: 'text-slate-500', bgColor: 'bg-slate-500/20' };
  const [iconError, setIconError] = React.useState(false);

  const iconSrc = getCryptoIconUrl(lowerSymbol);

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full ${colorData.bgColor} border border-current/20 overflow-hidden`}
      style={{ width: displaySize, height: displaySize }}
    >
      {!iconError ? (
        <img
          src={iconSrc}
          alt={upperSymbol}
          className="w-full h-full object-contain p-1"
          style={{ width: displaySize * 0.9, height: displaySize * 0.9 }}
          onError={() => setIconError(true)}
        />
      ) : (
        <span className={`text-xs font-bold ${colorData.color}`} style={{ fontSize: displaySize * 0.4 }}>
          {upperSymbol.substring(0, 2)}
        </span>
      )}
    </div>
  );
};

interface NetworkIconProps {
  network: string;
  size?: number;
}

export const NetworkIcon = ({ network, size = 24 }: NetworkIconProps) => {
  const iconData = networkIcons[network];
  const displaySize = size || 24;

  if (iconData) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-lg ${iconData.bgColor} ${iconData.color} border border-current/20`}
        style={{ width: displaySize, height: displaySize }}
      >
        <div style={{ width: displaySize * 0.6, height: displaySize * 0.6 }}>
          {iconData.icon}
        </div>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center justify-center rounded-lg bg-slate-500/20 text-slate-500 border border-slate-500/20 px-2"
      style={{ height: displaySize }}
    >
      <span className="text-xs font-medium" style={{ fontSize: displaySize * 0.5 }}>
        {network.substring(0, 3)}
      </span>
    </div>
  );
};
