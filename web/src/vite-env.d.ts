/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORE_NAME?: string
  readonly VITE_CONTACT_EMAIL?: string
  readonly VITE_CONTACT_PHONE?: string
  readonly VITE_INSTAGRAM_URL?: string
  readonly VITE_FREE_SHIPPING_THRESHOLD?: string
  readonly VITE_PIX_DISCOUNT_PERCENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
