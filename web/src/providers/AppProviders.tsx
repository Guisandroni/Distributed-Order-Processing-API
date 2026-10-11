import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { StoreProvider } from './StoreProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <StoreProvider>{children}</StoreProvider>
    </BrowserRouter>
  )
}
