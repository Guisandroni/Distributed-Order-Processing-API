import { Link } from 'react-router-dom'
import { env } from '../../config/env'
import { Icon } from '../common/Icon'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="section-width footer-grid">
        <div className="footer-brand"><span className="brand__mark">A</span><h3>{env.storeName}</h3><p>Objetos essenciais para uma casa com alma.</p></div>
        <div><h4>Explore</h4><Link to="/">Início</Link><Link to="/#colecao">Coleção</Link><Link to="/#historia">Nossa casa</Link></div>
        <div><h4>Atendimento</h4><a href={`mailto:${env.contactEmail}`}>{env.contactEmail}</a><a href={`tel:${env.contactPhone.replace(/\D/g, '')}`}>{env.contactPhone}</a><span>Seg a sex, 9h às 18h</span></div>
        <div><h4>Receba novidades</h4><p>Curadoria, lançamentos e histórias.</p><form className="newsletter" onSubmit={event => event.preventDefault()}><input type="email" placeholder="Seu melhor e-mail" aria-label="Seu melhor e-mail" /><button type="submit" aria-label="Cadastrar e-mail"><Icon name="arrow" /></button></form></div>
      </div>
      <div className="section-width footer-bottom"><span>© 2026 {env.storeName}</span><span>Privacidade · Termos</span></div>
    </footer>
  )
}
