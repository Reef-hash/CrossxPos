/**
 * CrossxPOS — Halaman Akses Ditolak
 *
 * Dipaparkan apabila pengguna cuba mengakses halaman yang tidak dibenarkan
 * untuk role mereka. Memaklumkan role semasa dan menghala ke halaman utama role.
 */

import { useNavigate } from 'react-router-dom'
import { ShieldOff, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import type { StaffRole } from '@/types'

/** Halaman utama (home) bagi setiap role */
export const ROLE_HOME: Record<StaffRole, string> = {
  admin:   '/cashier',
  cashier: '/cashier',
  waiter:  '/tables',
  kitchen: '/kitchen',
}

export function UnauthorizedPage() {
  const navigate = useNavigate()
  const currentStaff = useAuthStore((s) => s.currentStaff)
  const home = currentStaff ? ROLE_HOME[currentStaff.role] : '/login'

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <ShieldOff className="h-6 w-6 text-red-500" />
      </div>

      <h1 className="mb-1 text-base font-bold text-zinc-900">Akses Ditolak</h1>
      <p className="mb-1 text-xs text-zinc-500">
        Halaman ini tidak dibenarkan untuk role{' '}
        <span className="font-semibold capitalize text-zinc-700">{currentStaff?.role ?? '—'}</span>.
      </p>
      <p className="mb-5 text-xs text-zinc-400">
        Hubungi Admin jika anda rasa ini satu kesilapan.
      </p>

      <Button size="sm" variant="outline" onClick={() => navigate(home)}>
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        Kembali ke Halaman Utama
      </Button>
    </div>
  )
}
