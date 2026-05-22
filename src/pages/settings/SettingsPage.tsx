import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSettingsStore } from '@/store/settingsStore'
import { useLicenseStore } from '@/store/licenseStore'
import { daysUntilExpiry, formatLimit } from '@/lib/license'
import { db } from '@/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Settings, Printer, Store, Wifi, KeyRound, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { AppSettings } from '@/types'
import { testPrintReceipt, testPrintKitchen } from '@/lib/printer'

export function SettingsPage() {
  const { settings, save, load } = useSettingsStore()
  const [form, setForm] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)

  // License
  const { license, activateLicense } = useLicenseStore()
  const [renewKey, setRenewKey] = useState('')
  const [renewError, setRenewError] = useState('')
  const [renewSuccess, setRenewSuccess] = useState(false)
  const daysLeft = license ? daysUntilExpiry(license) : 0

  // Kiraan semasa untuk paparan had
  const staffCount = useLiveQuery(() => db.staff.count(), []) ?? 0
  const tableCount = useLiveQuery(() => db.dineTables.count(), []) ?? 0
  const productCount = useLiveQuery(() => db.products.count(), []) ?? 0

  const handleRenew = async () => {
    if (!renewKey.trim()) return
    setRenewError('')
    setRenewSuccess(false)
    const result = await activateLicense(renewKey)
    if (result.success) {
      setRenewSuccess(true)
      setRenewKey('')
      setTimeout(() => setRenewSuccess(false), 3000)
    } else {
      setRenewError(result.error ?? 'Kunci tidak sah.')
    }
  }

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setForm(settings)
  }, [settings])

  const handleSave = async () => {
    await save(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-xl p-5">
      <div className="mb-5 flex items-center gap-2.5">
        <Settings className="h-5 w-5 text-zinc-500" />
        <h1 className="text-base font-bold text-zinc-900">Settings</h1>
      </div>

      <div className="space-y-4">
        {/* Lesen & Plan */}
        {license && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4 text-blue-600" />
                Lesen & Plan
              </CardTitle>
              {daysLeft <= 30 && (
                <CardDescription className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  Lesen tamat dalam {daysLeft} hari
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Info plan */}
              <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2.5">
                <div>
                  <p className="text-[11px] text-zinc-500">Plan Aktif</p>
                  <p className="text-sm font-semibold text-zinc-900">{license.restaurantName}</p>
                </div>
                <span className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  license.plan === 'pro'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-zinc-100 text-zinc-600'
                }`}>
                  {license.plan}
                </span>
              </div>

              {/* Had penggunaan */}
              <div className="space-y-1.5">
                {[
                  { label: 'Staff', current: staffCount, max: license.limits.maxStaff },
                  { label: 'Meja', current: tableCount, max: license.limits.maxTables },
                  { label: 'Produk', current: productCount, max: license.limits.maxProducts },
                ].map(({ label, current, max }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{label}</span>
                    <span className={`font-medium ${
                      max !== -1 && current >= max ? 'text-red-600' : 'text-zinc-700'
                    }`}>
                      {current} / {formatLimit(max)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Tarikh tamat */}
              <div className="flex items-center justify-between border-t border-zinc-100 pt-2.5 text-xs">
                <span className="text-zinc-500">Tarikh Tamat</span>
                <span className={`font-medium ${daysLeft <= 30 ? 'text-amber-600' : 'text-zinc-700'}`}>
                  {license.expiresAt}
                  <span className="ml-1 text-[11px] opacity-70">({daysLeft} hari lagi)</span>
                </span>
              </div>

              {/* Renew / naik taraf */}
              <div className="border-t border-zinc-100 pt-2.5">
                <Label className="text-xs">Naik Taraf / Perbaharui Kunci Lesen</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={renewKey}
                    onChange={(e) => { setRenewKey(e.target.value); setRenewError(''); setRenewSuccess(false) }}
                    placeholder="CROSSX-xxxx.xxxx"
                    className="font-mono text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && handleRenew()}
                  />
                  <Button size="sm" onClick={handleRenew} disabled={!renewKey.trim()}>
                    Aktif
                  </Button>
                </div>
                {renewError && (
                  <p className="mt-1 text-[11px] text-red-600">{renewError}</p>
                )}
                {renewSuccess && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" /> Lesen berjaya dikemaskini!
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Restaurant */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              Restaurant Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Restaurant Name</Label>
              <Input
                className="mt-1"
                value={form.restaurantName}
                onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Currency</Label>
                <Input
                  className="mt-1"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Tax Rate (%)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.1"
                  value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Receipt Footer</Label>
              <Input
                className="mt-1"
                value={form.receiptFooter}
                onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
                placeholder="Thank you for dining with us!"
              />
            </div>
          </CardContent>
        </Card>

        {/* Receipt Printer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Receipt Printer (LAN/TCP)
            </CardTitle>
            <CardDescription>ESC/POS printer connected via IP</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Label className="text-xs">Enabled</Label>
              <input
                type="checkbox"
                checked={form.receiptPrinter.enabled}
                onChange={(e) =>
                  setForm({ ...form, receiptPrinter: { ...form.receiptPrinter, enabled: e.target.checked } })
                }
                className="h-3.5 w-3.5 rounded border-zinc-300"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">IP Address</Label>
                <Input
                  className="mt-1"
                  value={form.receiptPrinter.ip}
                  onChange={(e) =>
                    setForm({ ...form, receiptPrinter: { ...form.receiptPrinter, ip: e.target.value } })
                  }
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <Label className="text-xs">Port</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={form.receiptPrinter.port}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      receiptPrinter: { ...form.receiptPrinter, port: parseInt(e.target.value) || 9100 },
                    })
                  }
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-1 text-xs"
              onClick={() => testPrintReceipt(form)}
            >
              <Printer className="mr-1.5 h-3 w-3" /> Test Print Resit
            </Button>
          </CardContent>
        </Card>

        {/* Kitchen Printer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Kitchen Printer (LAN/TCP)
            </CardTitle>
            <CardDescription>Orders printed to kitchen via IP</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Label className="text-xs">Enabled</Label>
              <input
                type="checkbox"
                checked={form.kitchenPrinter.enabled}
                onChange={(e) =>
                  setForm({ ...form, kitchenPrinter: { ...form.kitchenPrinter, enabled: e.target.checked } })
                }
                className="h-3.5 w-3.5 rounded border-zinc-300"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">IP Address</Label>
                <Input
                  className="mt-1"
                  value={form.kitchenPrinter.ip}
                  onChange={(e) =>
                    setForm({ ...form, kitchenPrinter: { ...form.kitchenPrinter, ip: e.target.value } })
                  }
                  placeholder="192.168.1.101"
                />
              </div>
              <div>
                <Label className="text-xs">Port</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={form.kitchenPrinter.port}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      kitchenPrinter: { ...form.kitchenPrinter, port: parseInt(e.target.value) || 9100 },
                    })
                  }
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-1 text-xs"
              onClick={() => testPrintKitchen()}
            >
              <Printer className="mr-1.5 h-3 w-3" /> Test Print Tiket Dapur
            </Button>
          </CardContent>
        </Card>

        <Button className="w-full" onClick={handleSave}>
          {saved ? '✓ Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
