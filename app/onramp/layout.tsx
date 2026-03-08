import { Toaster } from '@/components/ui/toaster';

export default function OnrampLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark">
      {children}
      <Toaster />
    </div>
  );
}
