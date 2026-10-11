import { useState } from 'react'
import { useStore } from '../../contexts/store-context'
import { Icon } from '../common/Icon'
import { ProductCard } from '../product/ProductCard'

export function CollectionSection() {
  const [search, setSearch] = useState('')
  const { products } = useStore()
  const normalizedSearch = search.toLocaleLowerCase('pt-BR')
  const visibleProducts = products.filter(product => `${product.name} ${product.category}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch))

  return (
    <section className="section-width collection-section" id="colecao" aria-labelledby="colecao-title">
      <div className="section-heading section-heading--line collection-heading">
        <div><span className="eyebrow">Escolha com calma</span><h2 id="colecao-title">Coleção completa</h2></div>
        <div className="collection-tools">
          <label className="search-field" htmlFor="busca"><Icon name="search" size={17} /><input id="busca" type="search" placeholder="Buscar produto" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <span>{visibleProducts.length} {visibleProducts.length === 1 ? 'produto' : 'produtos'}</span>
        </div>
      </div>
      {visibleProducts.length > 0 ? (
        <div className="product-grid collection-grid">
          {visibleProducts.map(product => <ProductCard key={product.id} product={product} compact />)}
        </div>
      ) : <div className="empty-state"><Icon name="search" size={30} /><h3>Nenhum produto encontrado</h3><p>Tente buscar por outro nome ou categoria.</p></div>}
    </section>
  )
}
