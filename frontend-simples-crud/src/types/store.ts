export type Product = {
  id: string
  name: string
  category: string
  price: number
  image: string
  description: string
  stock: number
  location: string
}

export type ProductDraft = {
  name: string
  category: string
  price: string
  image: string
  description: string
  stock: string
  location: string
}

export type CartItem = Product & {
  quantity: number
}

export type PaymentMethod = 'Pix' | 'Cartão'

export type OrderStatus = 'Pagamento aprovado' | 'Em preparação'

export type Order = {
  id: string
  createdAt: string
  total: number
  payment: PaymentMethod
  itemCount: number
  status: OrderStatus
}

export type CheckoutSummary = {
  itemCount: number
  subtotal: number
  shipping: number
  discount: number
  total: number
}
