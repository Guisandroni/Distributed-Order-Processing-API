import type { ReactNode } from 'react'

export type IconName = 'search' | 'bag' | 'menu' | 'close' | 'arrow' | 'truck' | 'card' | 'shield' | 'refresh' | 'instagram' | 'plus' | 'minus' | 'trash' | 'edit' | 'box' | 'orders' | 'check'

const pathByName: Record<IconName, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bag: <><path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
  truck: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18 6l2 6M18 16a7 7 0 0 1-12 2l-2-6"/></>,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  minus: <path d="M5 12h14"/>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/><path d="M10 11v6M14 11v6"/></>,
  edit: <path d="m14 5 5 5M4 20l4-1 11-11-4-4L4 15v5Z"/>,
  box: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>,
  orders: <><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {pathByName[name]}
    </svg>
  )
}
