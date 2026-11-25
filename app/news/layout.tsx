import { notFound } from 'next/navigation'
import { NEWS_ENABLED } from '@/config/features'
import CatalogueRoot from '@/components/catalogue/CatalogueRoot'

/**
 * /news — editorial articles. No wallet/providers needed; share the
 * catalogue palette via CatalogueRoot so the editorial look carries.
 */
export default function NewsLayout({ children }: { children: React.ReactNode }) {
  if (!NEWS_ENABLED) notFound()

  return (
    <div className="dark">
      <CatalogueRoot>{children}</CatalogueRoot>
    </div>
  )
}
