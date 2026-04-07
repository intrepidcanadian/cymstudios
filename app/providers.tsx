'use client';

import dynamic from 'next/dynamic';

const Web3Provider = dynamic(
  () => import('@/components/providers/Web3Provider'),
  { ssr: false }
);

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      {children}
    </Web3Provider>
  );
}
