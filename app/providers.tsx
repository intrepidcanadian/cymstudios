'use client';

import dynamic from 'next/dynamic';

const PrivyClientProvider = dynamic(
  () => import('@/components/providers/PrivyClientProvider'),
  { ssr: false }
);

export default function Providers({
  children,
  privyAppId
}: {
  children: React.ReactNode;
  privyAppId?: string;
}) {
  if (!privyAppId) {
    return <>{children}</>;
  }

  return (
    <PrivyClientProvider appId={privyAppId}>
      {children}
    </PrivyClientProvider>
  );
}
