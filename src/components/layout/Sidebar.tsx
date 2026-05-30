import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, MonitorSmartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { navItems } from './navItems'

export function Sidebar() {
  const { currentStaff, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const visibleItems = navItems.filter(
    (item) => currentStaff && item.roles.includes(currentStaff.role)
  )

  return (
    <aside className="hidden h-screen w-14 flex-col items-center border-r border-zinc-200/80 bg-white py-3 lg:flex lg:w-52 lg:items-start lg:px-2.5">
      {/* Logo */}
      <div className="mb-5 flex items-center gap-2 px-2">
        <MonitorSmartphone className="h-6 w-6 shrink-0 text-blue-600" />
        <span className="hidden text-sm font-bold text-zinc-900 lg:block">CrossxPOS</span>
      </div>

      {/* Nav */}
      <nav className="flex w-full flex-1 flex-col gap-0.5">
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden lg:block">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="mt-auto w-full border-t border-zinc-100 pt-2.5">
        <div className="hidden px-2 pb-2 lg:block">
          <p className="text-xs font-semibold text-zinc-800">{currentStaff?.name}</p>
          <p className="text-[11px] capitalize text-zinc-400">{currentStaff?.role}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="hidden lg:block">Logout</span>
        </button>
      </div>
    </aside>
  )
}
