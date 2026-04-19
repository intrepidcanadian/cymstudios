import Providers from '../providers'
import CatalogueRoot from '@/components/catalogue/CatalogueRoot'

/**
 * /chat shares the catalogue's providers + palette so it can reuse
 * the PurchaseModal (wagmi hooks, Reown AppKit) without re-wrapping.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="dark">
        <CatalogueRoot>{children}</CatalogueRoot>
      </div>
    </Providers>
  )
}
