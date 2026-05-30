import {
  ShoppingCart,
  LayoutGrid,
  UtensilsCrossed,
  ClipboardList,
  BarChart3,
  Settings,
  Users,
  ChefHat,
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
  { to: '/menu', icon: UtensilsCrossed, label: 'Menu', roles: ['admin'] },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['admin'] },
  { to: '/staff', icon: Users, label: 'Staff', roles: ['admin', 'cashier'] },
  { to: '/settings', icon: Settings, label: 'Settings', roles: ['admin'] },
]