import { env } from '../../config/env'
import { formatMoney } from '../../tools/currency'
import { Icon } from '../common/Icon'

export function BenefitsSection() {
  return (
    <section className="benefits" aria-label="Benefícios da loja">
      <div className="section-width benefits__grid">
        <div><Icon name="truck" size={28} /><span><strong>Frete grátis</strong><small>Acima de {formatMoney(env.freeShippingThreshold)}</small></span></div>
        <div><Icon name="card" size={28} /><span><strong>Até 10x sem juros</strong><small>No cartão de crédito</small></span></div>
        <div><Icon name="shield" size={28} /><span><strong>Compra segura</strong><small>Seus dados protegidos</small></span></div>
        <div><Icon name="refresh" size={28} /><span><strong>Troca fácil</strong><small>Em até 7 dias</small></span></div>
      </div>
    </section>
  )
}
