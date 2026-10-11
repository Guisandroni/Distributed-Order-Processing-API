import { describe, expect, it } from 'vitest'
import { calculateCheckout } from '../tools/checkout'
import type { CartItem } from '../types/store'

const product: CartItem = {
  id: 'produto-teste',
  name: 'Produto teste',
  category: 'Decoração',
  price: 189,
  image: 'https://example.com/product.jpg',
  description: 'Produto usado para validar totais.',
  stock: 10,
  location: 'Sala',
  quantity: 1,
}

describe('calculateCheckout', () => {
  it('mantém o carrinho vazio sem cobrança', () => {
    expect(calculateCheckout([], 'Pix')).toEqual({
      itemCount: 0,
      subtotal: 0,
      shipping: 0,
      discount: 0,
      total: 0,
    })
  })

  it('cobra frete e aplica desconto Pix sobre os produtos', () => {
    expect(calculateCheckout([product], 'Pix')).toEqual({
      itemCount: 1,
      subtotal: 189,
      shipping: 24.9,
      discount: 9.45,
      total: 204.45,
    })
  })

  it('libera frete acima do limite e não desconta cartão', () => {
    const result = calculateCheckout([{ ...product, price: 200, quantity: 2 }], 'Cartão')

    expect(result).toEqual({
      itemCount: 2,
      subtotal: 400,
      shipping: 0,
      discount: 0,
      total: 400,
    })
  })
})
