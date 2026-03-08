export default function CatalogueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark" style={{ minHeight: '100vh', background: '#0f172a' }}>
      {children}
    </div>
  );
}
