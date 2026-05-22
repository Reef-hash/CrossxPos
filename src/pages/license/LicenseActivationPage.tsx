/**
 * CrossxPOS — Halaman Pengaktifan Lesen
 *
 * Dipaparkan apabila:
 *   - Lesen belum diaktifkan (status: 'not_activated')
 *   - Lesen telah tamat tempoh (status: 'expired')
 *
 * Selepas pengaktifan berjaya, LicenseGuard dalam App.tsx akan re-render
 * dan menghala pengguna ke halaman login secara automatik.
 */

import { useState } from 'react'
import { MonitorSmartphone, KeyRound, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react'
import { useLicenseStore } from '@/store/licenseStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function LicenseActivationPage() {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { activateLicense, status, license } = useLicenseStore()
  const isExpired = status === 'expired'

  const handleActivate = async () => {
    if (!key.trim()) return
    setLoading(true)
    setError('')
    const result = await activateLicense(key.trim())
    setLoading(false)
    if (!result.success) {
      setError(result.error ?? 'Ralat tidak diketahui. Cuba lagi.')
    }
    // Jika berjaya → LicenseGuard di App.tsx mengesan perubahan store
    // dan auto-render BrowserRouter + halaman login.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm">

        {/* Logo & Tajuk */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
            <MonitorSmartphone className="h-5 w-5 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-base font-bold text-zinc-900">CrossxPOS</h1>
            <p className="text-xs text-zinc-500">Sistem POS Restoran</p>
          </div>
        </div>

        {/* Notis tamat tempoh */}
        {isExpired && license && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Lesen <strong>{license.restaurantName}</strong> (Plan {license.plan.toUpperCase()}) telah
              tamat pada <strong>{license.expiresAt}</strong>. Masukkan kunci baharu untuk meneruskan.
            </span>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRound className="h-4 w-4 text-blue-600" />
              {isExpired ? 'Perbaharui Lesen' : 'Aktifkan Lesen'}
            </CardTitle>
            <CardDescription>
              {isExpired
                ? 'Masukkan kunci lesen baharu yang diperoleh daripada pembekal.'
                : 'Masukkan kunci lesen yang diberikan oleh pembekal untuk mengaktifkan sistem.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <Input
              value={key}
              onChange={(e) => { setKey(e.target.value); setError('') }}
              placeholder="CROSSX-xxxxxxxxxx.xxxxxxxx"
              className="font-mono text-xs tracking-tight"
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              autoFocus
            />

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleActivate}
              disabled={loading || !key.trim()}
            >
              {loading
                ? <><RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Mengesahkan...</>
                : isExpired ? 'Perbaharui Sekarang' : 'Aktifkan Sekarang'
              }
            </Button>

            {/* Nota keselamatan */}
            <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
              <div className="flex items-start gap-2 text-[11px] text-zinc-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span>
                  Pengesahan dilakukan secara <strong className="text-zinc-600">offline</strong>.
                  Tiada maklumat dihantar ke internet semasa proses ini.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-[11px] text-zinc-400">
          Hubungi{' '}
          <span className="font-medium text-zinc-600">support@crossxpos.com</span>{' '}
          untuk mendapatkan atau memperbaharui kunci lesen.
        </p>
      </div>
    </div>
  )
}
