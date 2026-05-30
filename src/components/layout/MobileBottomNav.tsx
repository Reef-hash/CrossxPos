import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { navItems } from './navItems'

export function MobileBottomNav() {
  const { currentStaff, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const visibleItems = navItems.filter((item) => currentStaff && item.roles.includes(currentStaff.role))

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur lg:hidden">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1 px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-medium transition-colors',
                isActive ? 'bg-blue-50 text-blue-600' : 'text-zinc-500'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}

        <button
          onClick={handleLogout}
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-medium text-zinc-500 transition-colors active:bg-red-50 active:text-red-600"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="truncate">Logout</span>
        </button>
      </div>
    </nav>
  )
}