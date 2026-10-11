import { useStore } from '../../contexts/store-context'

export function PlacesSection() {
  const { products } = useStore()

  return (
    <section className="section-width places-section" aria-labelledby="ambientes-title">
      <div className="section-heading"><span className="eyebrow">Para viver melhor</span><h2 id="ambientes-title">Três ambientes</h2></div>
      <div className="places-grid">
        {products.slice(1, 4).map((product, index) => (
          <article className="place-card" key={product.id}>
            <div className="place-card__image"><img src={product.image} alt={product.location} loading="lazy" /><span>0{index + 1}</span></div>
            <p>{product.category}</p>
            <h3>{product.location}</h3>
          </article>
        ))}
      </div>
    </section>
  )
}
