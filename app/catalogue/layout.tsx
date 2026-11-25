import { notFound } from 'next/navigation';
import Providers from '../providers';
import { REWARDS_ENABLED } from '@/config/features';
import CatalogueRoot from '@/components/catalogue/CatalogueRoot';

export default function CatalogueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!REWARDS_ENABLED) notFound();

  return (
    <Providers>
      <div className="dark">
        <CatalogueRoot>{children}</CatalogueRoot>
      </div>
    </Providers>
  );
}
