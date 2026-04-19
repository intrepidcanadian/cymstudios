import Providers from '../providers';
import CatalogueRoot from '@/components/catalogue/CatalogueRoot';

export default function CatalogueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="dark">
        <CatalogueRoot>{children}</CatalogueRoot>
      </div>
    </Providers>
  );
}
