import { ProductManager } from '../components/admin/ProductManager'

export function AdminPage() {
  return (
    <main className="internal-page section-width">
      <header className="internal-page__header">
        <span className="eyebrow">Área administrativa</span>
        <h1>Gestão de produtos</h1>
        <p>Controle o catálogo, preços e disponibilidade em um só lugar.</p>
      </header>
      <ProductManager />
    </main>
  )
}
