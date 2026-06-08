/**
 * CrossxPOS — Halaman Pengaktifan Lesen
 *
 * Dipaparkan apabila lesen belum aktif, tamat, atau terdapat isu server.
 * Menggunakan V1 server-authoritative flow melalui licenseStore.
 */

import { useState } from 'react'
import { MonitorSmartphone, KeyRound, ShieldCheck, AlertCircle, RefreshCw, WifiOff } from 'lucide-react'
import { useLicenseStore } from '@/store/licenseStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const STATUS_CONFIG = {
  expired:          { color: 'amber',  title: 'Perbaharui Lesen',      desc: 'Lesen anda telah tamat tempoh.' },
  grace_expired:    { color: 'red',    title: 'Tempoh Luar Talian Tamat', desc: 'Sambungkan internet dan masukkan kunci untuk meneruskan.' },
  device_mismatch:  { color: 'red',    title: 'Peranti Tidak Sepadan',  desc: 'Kunci ini terikat pada peranti lain. Hubungi sokongan untuk pindahan.' },
  seat_exceeded:    { color: 'red',    title: 'Had Peranti Dicapai',    desc: 'Lepaskan peranti lain atau naik taraf pelan.' },
  revoked:          { color: 'red',    title: 'Lesen Dibatalkan',       desc: 'Lesen ini telah dibatalkan. Hubungi sokongan.' },
  product_mismatch: { color: 'red',    title: 'Produk Tidak Sepadan',   desc: 'Kunci ini bukan untuk CrossxPOS.' },
  invalid:          { color: 'red',    title: 'Kunci Tidak Sah',        desc: 'Semak semula kunci yang diberikan oleh pembekal.' },
  not_activated:    { color: 'blue',   title: 'Aktifkan Lesen',         desc: 'Masukkan kunci lesen untuk mengaktifkan sistem.' },
} as const

export function LicenseActivationPage() {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { activateLicense, status, statusMessage } = useLicenseStore()

  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG['not_activated']
  const isBlocking = status === 'grace_expired' || status === 'device_mismatch' || status === 'seat_exceeded' || status === 'revoked'

  const handleActivate = async () => {
    if (!key.trim()) return
    setLoading(true)
    setError('')
    const result = await activateLicense(key.trim())
    setLoading(false)
    if (!result.success) {
      setError(result.error ?? 'Ralat tidak diketahui. Cuba lagi.')
    }
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

        {/* Status banner */}
        {status !== 'not_activated' && (
          <div className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs
            ${cfg.color === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-700' : ''}
            ${cfg.color === 'red'   ? 'border-red-200 bg-red-50 text-red-700' : ''}
            ${cfg.color === 'blue'  ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}
          `}>
            {status === 'grace_expired' ? <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>{statusMessage || cfg.desc}</span>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRound className="h-4 w-4 text-blue-600" />
              {cfg.title}
            </CardTitle>
            <CardDescription>
              {isBlocking
                ? cfg.desc
                : status === 'expired'
                  ? 'Masukkan kunci lesen baharu yang diperoleh daripada pembekal.'
                  : 'Masukkan kunci lesen yang diberikan oleh pembekal untuk mengaktifkan sistem.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <Input
              value={key}
              onChange={(e) => { setKey(e.target.value); setError('') }}
              placeholder="EZP-XXX-XXXX-XXXX-XXXX"
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
                : status === 'expired' ? 'Perbaharui Sekarang' : 'Aktifkan Sekarang'
              }
            </Button>

            {/* Online verification note */}
            <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
              <div className="flex items-start gap-2 text-[11px] text-zinc-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span>
                  Pengesahan dilakukan melalui <strong className="text-zinc-600">server</strong>.
                  Sambungan internet diperlukan semasa pengaktifan.
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
