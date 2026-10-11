import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { StoreContext, type StoreContextValue } from '../contexts/store-context'
import { initialProducts } from '../data/products'
import { calculateCheckout } from '../tools/checkout'
import { createOrderId, createProductId } from '../tools/ids'
import { readStorage, writeStorage } from '../tools/storage'
import type { CartItem, Order, PaymentMethod, Product, ProductDraft } from '../types/store'

const PRODUCT_STORAGE_KEY = 'aura-products'
const ORDER_STORAGE_KEY = 'aura-orders'

function buildProduct(id: string, draft: ProductDraft): Product {
  return {
    id,
    name: draft.name.trim(),
    category: draft.category.trim(),
    price: Number(draft.price),
    image: draft.image.trim(),
    description: draft.description.trim(),
    stock: Number(draft.stock),
    location: draft.location.trim(),
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => readStorage(PRODUCT_STORAGE_KEY, initialProducts))
  const [orders, setOrders] = useState<Order[]>(() => readStorage(ORDER_STORAGE_KEY, []))
  const [cart, setCart] = useState<CartItem[]>([])
  const [payment, setPayment] = useState<PaymentMethod>('Pix')
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [processingPayment, setProcessingPayment] = useState(false)
  const [confirmationId, setConfirmationId] = useState('')

  const summary = useMemo(() => calculateCheckout(cart, payment), [cart, payment])

  useEffect(() => writeStorage(PRODUCT_STORAGE_KEY, products), [products])
  useEffect(() => writeStorage(ORDER_STORAGE_KEY, orders), [orders])

  function addToCart(product: Product) {
    setCart(current => {
      const existing = current.find(item => item.id === product.id)
      if (existing) {
        return current.map(item => item.id === product.id
          ? { ...item, quantity: Math.min(item.quantity + 1, item.stock) }
          : item)
      }
      return [...current, { ...product, quantity: 1 }]
    })
    setCartOpen(true)
  }

  function changeCartQuantity(productId: string, delta: number) {
    setCart(current => current
      .map(item => item.id === productId
        ? { ...item, quantity: Math.min(item.stock, item.quantity + delta) }
        : item)
      .filter(item => item.quantity > 0))
  }

  function removeFromCart(productId: string) {
    setCart(current => current.filter(item => item.id !== productId))
  }

  function openCart() {
    setCartOpen(true)
  }

  function closeCart() {
    setCartOpen(false)
    setCheckoutOpen(false)
    setConfirmationId('')
  }

  function startCheckout() {
    if (cart.length > 0) setCheckoutOpen(true)
  }

  function returnToCart() {
    setCheckoutOpen(false)
  }

  function placeOrder() {
    if (cart.length === 0 || processingPayment) return
    setProcessingPayment(true)
    const purchasedItems = cart
    const orderId = createOrderId()
    const order: Order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      total: summary.total,
      payment,
      itemCount: summary.itemCount,
      status: 'Pagamento aprovado',
    }

    window.setTimeout(() => {
      setOrders(current => [order, ...current])
      setProducts(current => current.map(product => {
        const item = purchasedItems.find(cartItem => cartItem.id === product.id)
        return item ? { ...product, stock: Math.max(0, product.stock - item.quantity) } : product
      }))
      setCart([])
      setConfirmationId(orderId)
      setProcessingPayment(false)
    }, 700)
  }

  function createProduct(draft: ProductDraft) {
    setProducts(current => [buildProduct(createProductId(draft.name), draft), ...current])
  }

  function updateProduct(productId: string, draft: ProductDraft) {
    setProducts(current => current.map(product => product.id === productId ? buildProduct(productId, draft) : product))
  }

  function deleteProduct(productId: string) {
    setProducts(current => current.filter(product => product.id !== productId))
    removeFromCart(productId)
  }

  const value: StoreContextValue = {
    products,
    orders,
    cart,
    summary,
    payment,
    cartOpen,
    checkoutOpen,
    processingPayment,
    confirmationId,
    addToCart,
    changeCartQuantity,
    removeFromCart,
    openCart,
    closeCart,
    startCheckout,
    returnToCart,
    setPayment,
    placeOrder,
    createProduct,
    updateProduct,
    deleteProduct,
  }

  return <StoreContext value={value}>{children}</StoreContext>
}
