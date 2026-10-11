import { createContext, use } from 'react'
import type { CheckoutSummary, Order, PaymentMethod, Product, ProductDraft } from '../types/store'

export type StoreContextValue = {
  products: Product[]
  orders: Order[]
  cart: Array<Product & { quantity: number }>
  summary: CheckoutSummary
  payment: PaymentMethod
  cartOpen: boolean
  checkoutOpen: boolean
  processingPayment: boolean
  confirmationId: string
  addToCart: (product: Product) => void
  changeCartQuantity: (productId: string, delta: number) => void
  removeFromCart: (productId: string) => void
  openCart: () => void
  closeCart: () => void
  startCheckout: () => void
  returnToCart: () => void
  setPayment: (payment: PaymentMethod) => void
  placeOrder: () => void
  createProduct: (draft: ProductDraft) => void
  updateProduct: (productId: string, draft: ProductDraft) => void
  deleteProduct: (productId: string) => void
}

export const StoreContext = createContext<StoreContextValue | null>(null)

export function useStore() {
  const store = use(StoreContext)
  if (!store) throw new Error('useStore deve ser usado dentro de StoreProvider')
  return store
}
