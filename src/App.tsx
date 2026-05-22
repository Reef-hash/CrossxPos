import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { initializeDatabase } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useLicenseStore } from '@/store/licenseStore'
import { isLicenseExpired } from '@/lib/license'
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
import { SettingsPage } from '@/pages/settings/SettingsPage'

/**
 * LicenseGuard — Semak lesen sebelum benarkan akses ke app.
 * Jika lesen belum diaktifkan atau tamat tempoh → papar LicenseActivationPage.
 */
function LicenseGuard({ children }: { children: React.ReactNode }) {
  const license = useLicenseStore((s) => s.license)
  const isValid = license !== null && !isLicenseExpired(license)
  if (!isValid) return <LicenseActivationPage />
  return <>{children}</>
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

  useEffect(() => {
    initializeDatabase()
    load()
  }, [load])

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
          <Route path="staff"    element={<RoleRoute allowedRoles={['admin']}><StaffPage /></RoleRoute>} />
          <Route path="settings" element={<RoleRoute allowedRoles={['admin']}><SettingsPage /></RoleRoute>} />
          <Route path="unauthorized" element={<UnauthorizedPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </LicenseGuard>
  )
}
