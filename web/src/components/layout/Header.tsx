import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useStore } from '../../contexts/store-context'
import { Icon } from '../common/Icon'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const { openCart, summary } = useStore()

  function goToCollection() {
    navigate('/#colecao')
    setMenuOpen(false)
    window.setTimeout(() => document.getElementById('colecao')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function focusSearch() {
    goToCollection()
    window.setTimeout(() => document.getElementById('busca')?.focus(), 550)
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="mobile-menu-button" type="button" onClick={() => setMenuOpen(current => !current)} aria-label="Abrir menu">
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>
        <Link className="brand" to="/" aria-label="Aura Casa, início">
          <span className="brand__mark">A</span>
          <span className="brand__word"><strong>Aura</strong><small>casa</small></span>
        </Link>
        <nav className={menuOpen ? 'main-nav main-nav--open' : 'main-nav'} aria-label="Navegação principal">
          <NavLink to="/" onClick={() => setMenuOpen(false)}>Início</NavLink>
          <button type="button" onClick={goToCollection}>Coleção</button>
          <Link to="/#historia" onClick={() => setMenuOpen(false)}>Nossa casa</Link>
          <NavLink to="/admin" onClick={() => setMenuOpen(false)}>Gerenciar</NavLink>
        </nav>
        <div className="header-actions">
          <button type="button" aria-label="Buscar produtos" onClick={focusSearch}><Icon name="search" /></button>
          <Link to="/pedidos" aria-label="Ver pedidos"><Icon name="orders" /></Link>
          <button className="cart-button" type="button" aria-label={`Carrinho com ${summary.itemCount} itens`} onClick={openCart}>
            <Icon name="bag" />{summary.itemCount > 0 && <span>{summary.itemCount}</span>}
          </button>
        </div>
      </div>
    </header>
  )
}
