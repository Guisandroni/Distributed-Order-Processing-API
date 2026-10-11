import { useStore } from '../../contexts/store-context'
import { formatMoney } from '../../tools/currency'
import { Icon } from '../common/Icon'

export function OrderList() {
  const { orders } = useStore()

  if (orders.length === 0) {
    return <div className="empty-state"><Icon name="orders" size={34} /><h3>Nenhum pedido ainda</h3><p>Seus pedidos aparecerão aqui após a compra.</p></div>
  }

  return (
    <div className="orders-list">
      {orders.map(order => (
        <article key={order.id}>
          <span className="order-icon"><Icon name="box" /></span>
          <div><strong>{order.id}</strong><small>{new Date(order.createdAt).toLocaleDateString('pt-BR')} · {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'} · {order.payment}</small></div>
          <span className="order-status"><i />{order.status}</span>
          <strong>{formatMoney(order.total)}</strong>
        </article>
      ))}
    </div>
  )
}
