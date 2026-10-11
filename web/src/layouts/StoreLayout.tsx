import { Outlet } from 'react-router-dom'
import { CartDrawer } from '../components/cart/CartDrawer'
import { Footer } from '../components/layout/Footer'
import { Header } from '../components/layout/Header'

export function StoreLayout() {
  return (
    <div className="app-shell">
      <Header />
      <Outlet />
      <Footer />
      <CartDrawer />
    </div>
  )
}
