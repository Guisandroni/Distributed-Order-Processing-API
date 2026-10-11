import { Icon } from '../common/Icon'

export function HeroSection() {
  return (
    <section className="hero section-width" id="inicio">
      <img src="https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=88" alt="Sala contemporânea com móveis em tons naturais" />
      <div className="hero__shade" />
      <div className="hero__content">
        <p>Nova coleção · 2026</p>
        <h1>Objetos que fazem<br />a casa respirar.</h1>
        <a href="#colecao">Descobrir a coleção <Icon name="arrow" size={18} /></a>
      </div>
    </section>
  )
}
