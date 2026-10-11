import { env } from '../config/env'
import type { CartItem, CheckoutSummary, PaymentMethod } from '../types/store'

export function calculateCheckout(items: CartItem[], payment: PaymentMethod): CheckoutSummary {
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const shipping = subtotal === 0 || subtotal >= env.freeShippingThreshold ? 0 : 24.9
  const discount = payment === 'Pix' ? Math.round(subtotal * env.pixDiscountPercent) / 100 : 0

  return {
    itemCount,
    subtotal,
    shipping,
    discount,
    total: Math.round((subtotal + shipping - discount) * 100) / 100,
  }
}
