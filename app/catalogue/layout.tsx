import Providers from '../providers';

export default function CatalogueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="dark" style={{ minHeight: '100vh', background: '#0f172a' }}>
        {children}
      </div>
    </Providers>
  );
}
