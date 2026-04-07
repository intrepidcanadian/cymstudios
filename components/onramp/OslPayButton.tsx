import { useOslPay } from '@/hooks/useOslPay';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { motion } from 'framer-motion';
import { Wallet, Sparkles, LogIn } from 'lucide-react';
import { OslPayUrlParams } from '@/config/oslPay';

interface OslPayButtonProps extends OslPayUrlParams {
  className?: string;
  children?: React.ReactNode;
}

export function OslPayButton({
  appId,
  amount,
  crypto,
  network,
  fiatCurrency = 'USD',
  payWayCode,
  email,
  accessToken,
  merchantUser,
  merchantOrder,
  address,
  successUrl,
  failUrl,
  callbackUrl,
  useBorder,
  locale,
  checkType,
  className,
  children
}: OslPayButtonProps) {
  const { openOslPay, loading, error, isBackendAuthenticated } = useOslPay();
  const { isConnected, status } = useAccount();
  const { open } = useAppKit();

  const needsSignIn = status !== 'reconnecting' && !isConnected;

  const handleClick = async () => {
    if (needsSignIn) {
      open();
      return;
    }

    if (!isBackendAuthenticated) {
      return;
    }

    await openOslPay({
      appId,
      amount,
      crypto,
      network,
      fiatCurrency,
      payWayCode,
      email,
      accessToken,
      merchantUser,
      merchantOrder,
      address: address || '',
      successUrl,
      failUrl,
      callbackUrl,
      useBorder,
      locale,
      checkType
    });
  };

  return (
    <div className="relative">
      {needsSignIn && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 p-3 bg-amber-500/10 backdrop-blur-sm rounded-lg border border-amber-500/20"
        >
          <p className="text-amber-400 text-sm font-medium text-center">
            Please sign in to use OSL Pay
          </p>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative"
      >
        <motion.button
          onClick={handleClick}
          disabled={loading}
          className={`
            relative overflow-hidden group
            px-6 py-4 rounded-xl
            ${needsSignIn
              ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:via-orange-500 hover:to-amber-600'
              : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:via-indigo-500 hover:to-blue-600'
            }
            active:from-blue-700 active:via-indigo-700 active:to-blue-800
            disabled:from-gray-400 disabled:via-gray-500 disabled:to-gray-600
            disabled:cursor-not-allowed
            transition-all duration-300 ease-out
            transform hover:scale-105 active:scale-95
            shadow-lg hover:shadow-xl
            backdrop-blur-sm
            border border-white/20
            ${className || ''}
          `}
          whileHover={{
            scale: 1.02,
            transition: { duration: 0.2 }
          }}
          whileTap={{
            scale: 0.98,
            transition: { duration: 0.1 }
          }}
        >
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm rounded-xl" />
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-blue-700/20 animate-pulse" />
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <Sparkles className="w-4 h-4 text-white/60" />
          </div>
          <div className="relative flex items-center justify-center gap-3 text-white font-semibold">
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="text-sm">Processing...</span>
              </div>
            ) : needsSignIn ? (
              <>
                <LogIn className="w-5 h-5" />
                <span className="text-base font-medium tracking-wide">
                  Sign In to Continue
                </span>
              </>
            ) : (
              <>
                <Wallet className="w-5 h-5" />
                <span className="text-base font-medium tracking-wide">
                  {children || 'On-ramp with OSL Pay'}
                </span>
              </>
            )}
          </div>
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400/0 via-indigo-400/0 to-blue-400/0 group-hover:from-blue-400/20 group-hover:via-indigo-400/20 group-hover:to-blue-400/20 transition-all duration-500" />
        </motion.button>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 p-3 bg-red-500/10 backdrop-blur-sm rounded-lg border border-red-500/20"
        >
          <p className="text-red-400 text-sm font-medium text-center">{error}</p>
        </motion.div>
      )}
    </div>
  );
}
