import { useMemo, useState, type SubmitEvent } from 'react'
import { useStore } from '../../contexts/store-context'
import { formatMoney } from '../../tools/currency'
import type { Product, ProductDraft } from '../../types/store'
import { Icon } from '../common/Icon'

const emptyDraft: ProductDraft = {
  name: '',
  category: 'Decoração',
  price: '',
  image: '',
  description: '',
  stock: '',
  location: '',
}

export function ProductManager() {
  const { products, orders, createProduct, updateProduct, deleteProduct } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft)
  const categories = useMemo(() => new Set(products.map(product => product.category)).size, [products])

  function startCreate() {
    setEditingId(null)
    setDraft(emptyDraft)
  }

  function startEdit(product: Product) {
    setEditingId(product.id)
    setDraft({
      name: product.name,
      category: product.category,
      price: String(product.price),
      image: product.image,
      description: product.description,
      stock: String(product.stock),
      location: product.location,
    })
  }

  function saveProduct(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingId) updateProduct(editingId, draft)
    else createProduct(draft)
    startCreate()
  }

  function confirmDelete(productId: string) {
    if (!window.confirm('Excluir este produto permanentemente?')) return
    deleteProduct(productId)
    if (editingId === productId) startCreate()
  }

  return (
    <section className="admin-modal admin-page-card" aria-label="Gerenciar produtos">
      <div className="admin-stats"><div><Icon name="box" /><span><strong>{products.length}</strong><small>Produtos ativos</small></span></div><div><Icon name="orders" /><span><strong>{orders.length}</strong><small>Pedidos recebidos</small></span></div><div><Icon name="shield" /><span><strong>{categories}</strong><small>Categorias</small></span></div></div>
      <div className="admin-content">
        <div className="admin-list"><div className="admin-list__head"><div><h3>Catálogo</h3><p>Cadastre e atualize sua coleção.</p></div><button className="secondary-button" type="button" onClick={startCreate}><Icon name="plus" size={17} /> Novo produto</button></div>
          <div className="product-table">{products.map(product => <article key={product.id}><img src={product.image} alt="" /><div className="table-product"><strong>{product.name}</strong><span>{product.category}</span></div><strong>{formatMoney(product.price)}</strong><span className={product.stock <= 3 ? 'stock stock--low' : 'stock'}>{product.stock} un.</span><div className="table-actions"><button type="button" onClick={() => startEdit(product)} aria-label={`Editar ${product.name}`}><Icon name="edit" size={17} /></button><button type="button" onClick={() => confirmDelete(product.id)} aria-label={`Excluir ${product.name}`}><Icon name="trash" size={17} /></button></div></article>)}</div>
        </div>
        <form className="product-form" onSubmit={saveProduct}><span className="eyebrow">{editingId ? 'Editando produto' : 'Novo produto'}</span><h3>{editingId ? draft.name : 'Adicionar ao catálogo'}</h3><label>Nome<input required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><div className="form-grid"><label>Categoria<input required value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} /></label><label>Estoque<input required min="0" type="number" value={draft.stock} onChange={event => setDraft({ ...draft, stock: event.target.value })} /></label><label>Preço<input required min="0" step="0.01" type="number" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} /></label><label>Ambiente<input required value={draft.location} onChange={event => setDraft({ ...draft, location: event.target.value })} /></label></div><label>URL da imagem<input required type="url" value={draft.image} onChange={event => setDraft({ ...draft, image: event.target.value })} /></label><label>Descrição<textarea required rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label><div className="form-actions">{editingId && <button className="ghost-button" type="button" onClick={startCreate}>Cancelar</button>}<button className="primary-button" type="submit">{editingId ? 'Salvar alterações' : 'Cadastrar produto'}</button></div></form>
      </div>
    </section>
  )
}
