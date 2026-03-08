'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { OnRampForm } from '@/components/onramp/OnRampForm';
import { TransactionStatus } from '@/components/onramp/TransactionStatus';

function OnrampContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const status = searchParams.get('status') as 'success' | 'fail' | null;
  const orderId = searchParams.get('orderId') || (() => {
    // Fallback: try to get orderId from localStorage if not in URL
    try {
      return localStorage.getItem('osl_last_merchant_order');
    } catch {
      return null;
    }
  })();

  const handleBack = () => {
    // Clear the status params and go back to the form
    router.replace('/onramp');
  };

  if (status === 'success' || status === 'fail') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <TransactionStatus
          status={status}
          orderId={orderId}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg mb-4">
        <Link
          href="/catalogue"
          className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium text-sm transition-colors"
        >
          &larr; Back to Catalogue
        </Link>
      </div>
      <OnRampForm />
    </div>
  );
}

export default function OnrampPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <OnrampContent />
    </Suspense>
  );
}
