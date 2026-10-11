import { OrderList } from '../components/orders/OrderList'

export function OrdersPage() {
  return (
    <main className="internal-page section-width">
      <header className="internal-page__header">
        <span className="eyebrow">Acompanhamento</span>
        <h1>Meus pedidos</h1>
        <p>Acompanhe compras, pagamentos e valores dos seus pedidos.</p>
      </header>
      <section className="orders-modal orders-page-card" aria-label="Pedidos">
        <OrderList />
      </section>
    </main>
  )
}
