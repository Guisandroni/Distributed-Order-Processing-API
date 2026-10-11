import { useStore } from '../../contexts/store-context'
import { ProductCard } from '../product/ProductCard'
import { Icon } from '../common/Icon'

export function NewArrivalsSection() {
  const { products } = useStore()

  return (
    <section className="section-width products-section" aria-labelledby="lancamentos-title">
      <div className="section-heading section-heading--line">
        <div><span className="eyebrow">Curadoria da semana</span><h2 id="lancamentos-title">Lançamentos</h2></div>
        <a className="text-link" href="#colecao">Ver todos <Icon name="arrow" size={17} /></a>
      </div>
      <div className="product-grid product-grid--featured">
        {products.slice(0, 4).map(product => <ProductCard key={product.id} product={product} />)}
      </div>
    </section>
  )
}
