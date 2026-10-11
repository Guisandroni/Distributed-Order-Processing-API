import { useStore } from '../../contexts/store-context'
import { formatMoney } from '../../tools/currency'
import type { Product } from '../../types/store'
import { Icon } from '../common/Icon'

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { addToCart } = useStore()

  return (
    <article className={`product-card ${compact ? 'product-card--compact' : ''}`}>
      <div className="product-card__image-wrap">
        <img className="product-card__image" src={product.image} alt={product.name} loading="lazy" />
        {product.stock > 0 ? (
          <button className="product-card__add" type="button" onClick={() => addToCart(product)} aria-label={`Adicionar ${product.name} ao carrinho`}>
            <Icon name="bag" size={18} /> <span>Adicionar</span>
          </button>
        ) : <span className="sold-out">Esgotado</span>}
      </div>
      <div className="product-card__info">
        <p className="product-card__category">{product.category}</p>
        <h3>{product.name}</h3>
        <p className="product-card__price">A partir de {formatMoney(product.price)}</p>
      </div>
    </article>
  )
}
