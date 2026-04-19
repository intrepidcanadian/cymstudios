import CatalogueRoot from '@/components/catalogue/CatalogueRoot'

/**
 * /agents — developer docs. No wallet/providers needed; share the
 * catalogue palette via CatalogueRoot so the editorial look carries.
 */
export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark">
      <CatalogueRoot>{children}</CatalogueRoot>
    </div>
  )
}
