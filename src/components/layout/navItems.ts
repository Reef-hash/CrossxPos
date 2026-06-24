import {
  ShoppingCart,
  LayoutGrid,
  ClipboardList,
  ChefHat,
  Settings,
} from 'lucide-react'
import type { StaffRole } from '@/types'

export type NavItem = {
  to: string
  label: string
  icon: typeof ShoppingCart
  roles: StaffRole[]
}

export const navItems: NavItem[] = [
  { to: '/cashier', icon: ShoppingCart, label: 'Cashier', roles: ['admin', 'cashier', 'waiter'] },
  { to: '/orders', icon: ClipboardList, label: 'Orders', roles: ['admin', 'cashier'] },
  { to: '/kitchen', icon: ChefHat, label: 'Kitchen', roles: ['admin', 'kitchen', 'cashier'] },
  { to: '/tables', icon: LayoutGrid, label: 'Tables', roles: ['admin', 'cashier', 'waiter'] },
  { to: '/settings', icon: Settings, label: 'Settings', roles: ['admin'] },
]