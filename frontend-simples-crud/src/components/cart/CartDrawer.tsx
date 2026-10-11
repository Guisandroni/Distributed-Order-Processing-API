import type { SubmitEvent } from 'react'
import { env } from '../../config/env'
import { useStore } from '../../contexts/store-context'
import { formatMoney } from '../../tools/currency'
import { Icon } from '../common/Icon'

export function CartDrawer() {
  const {
    cart,
    summary,
    payment,
    cartOpen,
    checkoutOpen,
    processingPayment,
    confirmationId,
    changeCartQuantity,
    removeFromCart,
    closeCart,
    startCheckout,
    returnToCart,
    setPayment,
    placeOrder,
  } = useStore()

  if (!cartOpen) return null

  function finishOrder(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    placeOrder()
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeCart() }}>
      <aside className="drawer" aria-label="Carrinho de compras">
        <div className="drawer__header">
          <div><span className="eyebrow">Sua seleção</span><h2>{checkoutOpen ? 'Finalizar compra' : 'Carrinho'} {!checkoutOpen && <small>({summary.itemCount})</small>}</h2></div>
          <button type="button" onClick={closeCart} aria-label="Fechar carrinho"><Icon name="close" /></button>
        </div>

        {confirmationId ? (
          <div className="success-state">
            <span className="success-state__icon"><Icon name="check" size={34} /></span>
            <span className="eyebrow">Pedido confirmado</span>
            <h3>Obrigada pela compra.</h3>
            <p>O pagamento foi aprovado e seu pedido já está sendo preparado.</p>
            <div><small>Número do pedido</small><strong>{confirmationId}</strong></div>
            <button className="primary-button" type="button" onClick={closeCart}>Continuar navegando</button>
          </div>
        ) : checkoutOpen ? (
          <form className="checkout-form" onSubmit={finishOrder}>
            <button className="back-button" type="button" onClick={returnToCart}>← Voltar ao carrinho</button>
            <fieldset><legend>1. Seus dados</legend><div className="form-grid"><label className="full">Nome completo<input required name="name" autoComplete="name" /></label><label className="full">E-mail<input required type="email" name="email" autoComplete="email" /></label><label>CEP<input required name="postalCode" inputMode="numeric" placeholder="00000-000" /></label><label>Número<input required name="number" inputMode="numeric" /></label><label className="full">Endereço<input required name="address" /></label></div></fieldset>
            <fieldset><legend>2. Pagamento</legend><div className="payment-tabs"><button className={payment === 'Pix' ? 'active' : ''} type="button" onClick={() => setPayment('Pix')}>Pix <small>{env.pixDiscountPercent}% de desconto</small></button><button className={payment === 'Cartão' ? 'active' : ''} type="button" onClick={() => setPayment('Cartão')}>Cartão <small>Até 10x</small></button></div>
              {payment === 'Pix' ? <div className="pix-note"><Icon name="shield" /><p>O QR Code será exibido após a confirmação. Aprovação imediata.</p></div> : <div className="form-grid card-fields"><label className="full">Número do cartão<input required inputMode="numeric" placeholder="0000 0000 0000 0000" /></label><label>Validade<input required placeholder="MM/AA" /></label><label>CVV<input required inputMode="numeric" placeholder="000" /></label><label className="full">Nome impresso no cartão<input required /></label></div>}
            </fieldset>
            {summary.discount > 0 && <div className="checkout-discount"><span>Desconto no Pix</span><strong>-{formatMoney(summary.discount)}</strong></div>}
            <div className="checkout-total"><span>Total</span><strong>{formatMoney(summary.total)}</strong></div>
            <button className="primary-button" type="submit" disabled={processingPayment}>{processingPayment ? 'Processando pagamento...' : `Pagar ${formatMoney(summary.total)}`}</button>
            <p className="secure-note"><Icon name="shield" size={15} /> Pagamento de demonstração protegido</p>
          </form>
        ) : cart.length ? (
          <>
            <div className="cart-items">{cart.map(item => <article className="cart-item" key={item.id}><img src={item.image} alt={item.name} /><div><p>{item.category}</p><h3>{item.name}</h3><strong>{formatMoney(item.price)}</strong><div className="quantity"><button type="button" onClick={() => changeCartQuantity(item.id, -1)} aria-label="Diminuir quantidade"><Icon name="minus" size={14} /></button><span>{item.quantity}</span><button type="button" onClick={() => changeCartQuantity(item.id, 1)} aria-label="Aumentar quantidade"><Icon name="plus" size={14} /></button></div></div><button className="remove-item" type="button" onClick={() => removeFromCart(item.id)} aria-label={`Remover ${item.name}`}><Icon name="trash" size={18} /></button></article>)}</div>
            <div className="cart-summary"><div><span>Subtotal</span><strong>{formatMoney(summary.subtotal)}</strong></div><div><span>Entrega</span><strong>{summary.shipping ? formatMoney(summary.shipping) : 'Grátis'}</strong></div>{summary.subtotal < env.freeShippingThreshold && <p>Faltam {formatMoney(env.freeShippingThreshold - summary.subtotal)} para o frete grátis.</p>}<div className="cart-total"><span>Total</span><strong>{formatMoney(summary.subtotal + summary.shipping)}</strong></div><button className="primary-button" type="button" onClick={startCheckout}>Ir para pagamento <Icon name="arrow" size={18} /></button><small><Icon name="shield" size={14} /> Compra segura e protegida</small></div>
          </>
        ) : <div className="empty-cart"><Icon name="bag" size={38} /><h3>Seu carrinho está vazio</h3><p>Escolha peças que façam sentido para a sua casa.</p><a className="primary-button" href="/#colecao" onClick={closeCart}>Ver coleção</a></div>}
      </aside>
    </div>
  )
}
