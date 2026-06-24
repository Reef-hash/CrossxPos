import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { initializeDatabase } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useLicenseStore } from '@/store/licenseStore'
import { useShiftStore } from '@/store/shiftStore'
import type { StaffRole } from '@/types'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { UnauthorizedPage, ROLE_HOME } from '@/pages/auth/UnauthorizedPage'
import { LicenseActivationPage } from '@/pages/license/LicenseActivationPage'
import { CashierPage } from '@/pages/cashier/CashierPage'
import { TablesPage } from '@/pages/tables/TablesPage'
import { KitchenPage } from '@/pages/kitchen/KitchenPage'
import { MenuPage } from '@/pages/menu/MenuPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { StaffPage } from '@/pages/staff/StaffPage'
import { ShiftPage } from '@/pages/shifts/ShiftPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'

/** Statuses that block access and require activation or renewal. */
const BLOCKING_STATUSES = new Set(['not_activated', 'invalid', 'expired', 'revoked', 'product_mismatch', 'grace_expired'])

/**
 * LicenseGuard — Semak lesen sebelum benarkan akses ke app.
 * active/grace → allow access.
 * device_mismatch/seat_exceeded → allow access but show warning banner (handled in LicenseActivationPage).
 * blocking statuses → show LicenseActivationPage.
 */
function LicenseGuard({ children }: { children: React.ReactNode }) {
  const status = useLicenseStore((s) => s.status)
  const rawKey = useLicenseStore((s) => s.rawKey)
  const isGracePassing = status === 'grace' && rawKey !== ''
  if (isGracePassing || status === 'active') return <>{children}</>
  if (BLOCKING_STATUSES.has(status)) return <LicenseActivationPage />
  // device_mismatch / seat_exceeded — show activation page with specific message
  return <LicenseActivationPage />
}

/**
 * ProtectedRoute — Semak pengesahan (authentication) sahaja.
 * Jika belum login → redirect ke /login.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

/**
 * RoleRoute — Semak kebenaran role selepas authentication.
 * Jika role tidak dibenarkan → redirect ke /unauthorized.
 *
 * @param allowedRoles - Senarai role yang dibenarkan untuk halaman ini
 *
 * Jadual kebenaran (konsisten dengan Sidebar navItems):
 *   /cashier  → admin, cashier, waiter
 *   /orders   → admin, cashier
 *   /kitchen  → admin, kitchen, cashier
 *   /tables   → admin, cashier, waiter
 *   /menu     → admin
 *   /reports  → admin
 *   /staff    → admin
 *   /settings → admin
 */
function RoleRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: StaffRole[] }) {
  const currentStaff = useAuthStore((s) => s.currentStaff)
  if (!currentStaff || !allowedRoles.includes(currentStaff.role)) {
    return <Navigate to="/unauthorized" replace />
  }
  return <>{children}</>
}

/**
 * RoleHomeRedirect — Redirect ke halaman utama berdasarkan role pengguna.
 * Menggantikan redirect statik ke /cashier.
 */
function RoleHomeRedirect() {
  const currentStaff = useAuthStore((s) => s.currentStaff)
  const home = currentStaff ? ROLE_HOME[currentStaff.role] : '/cashier'
  return <Navigate to={home} replace />
}

export default function App() {
  const { load } = useSettingsStore()
  const { loadCurrentShift } = useShiftStore()
  const revalidate = useLicenseStore((s) => s.revalidate)

  useEffect(() => {
    initializeDatabase()
    load()
    loadCurrentShift()
    // Revalidate license against server on every app startup.
    // If offline, grace cache check runs inside revalidate().
    revalidate()
  }, [load, loadCurrentShift, revalidate])

  return (
    <LicenseGuard>
      <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<RoleHomeRedirect />} />
          <Route path="cashier"  element={<RoleRoute allowedRoles={['admin', 'cashier', 'waiter']}><CashierPage /></RoleRoute>} />
          <Route path="orders"   element={<RoleRoute allowedRoles={['admin', 'cashier']}><OrdersPage /></RoleRoute>} />
          <Route path="kitchen"  element={<RoleRoute allowedRoles={['admin', 'kitchen', 'cashier']}><KitchenPage /></RoleRoute>} />
          <Route path="tables"   element={<RoleRoute allowedRoles={['admin', 'cashier', 'waiter']}><TablesPage /></RoleRoute>} />
          <Route path="menu"     element={<RoleRoute allowedRoles={['admin']}><MenuPage /></RoleRoute>} />
          <Route path="reports"  element={<RoleRoute allowedRoles={['admin']}><ReportsPage /></RoleRoute>} />
          <Route path="staff"    element={<RoleRoute allowedRoles={['admin', 'cashier']}><StaffPage /></RoleRoute>} />
          <Route path="shifts"   element={<RoleRoute allowedRoles={['admin', 'cashier']}><ShiftPage /></RoleRoute>} />
          <Route path="settings" element={<RoleRoute allowedRoles={['admin']}><SettingsPage /></RoleRoute>} />
          <Route path="unauthorized" element={<UnauthorizedPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </LicenseGuard>
  )
}
