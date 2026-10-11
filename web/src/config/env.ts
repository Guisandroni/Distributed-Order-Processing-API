const configuredFreeShipping = Number(import.meta.env.VITE_FREE_SHIPPING_THRESHOLD)
const configuredPixDiscount = Number(import.meta.env.VITE_PIX_DISCOUNT_PERCENT)

export const env = Object.freeze({
  storeName: import.meta.env.VITE_STORE_NAME || 'Aura Casa',
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL || 'ola@auracasa.com.br',
  contactPhone: import.meta.env.VITE_CONTACT_PHONE || '(11) 3030-3030',
  instagramUrl: import.meta.env.VITE_INSTAGRAM_URL || 'https://instagram.com',
  freeShippingThreshold: Number.isFinite(configuredFreeShipping) && configuredFreeShipping > 0 ? configuredFreeShipping : 399,
  pixDiscountPercent: Number.isFinite(configuredPixDiscount) && configuredPixDiscount >= 0 ? configuredPixDiscount : 5,
})
