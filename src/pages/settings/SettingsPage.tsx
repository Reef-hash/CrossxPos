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
import { Settings, Printer, Store, Wifi, KeyRound, AlertTriangle, CheckCircle2, UtensilsCrossed, X } from 'lucide-react'
import type { AppSettings, PrinterProfile } from '@/types'
import { testPrintReceipt, testPrintKitchen } from '@/lib/printer'
import { generateId } from '@/lib/utils'

type SettingsTab = 'profile' | 'printer' | 'license'

export function SettingsPage() {
  const { settings, save, load } = useSettingsStore()
  const [form, setForm] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)
  const [newStation, setNewStation] = useState('')
  const [newPrinterName, setNewPrinterName] = useState('')
  const [newPrinterIP, setNewPrinterIP] = useState('')
  const [newPrinterPort, setNewPrinterPort] = useState('9100')
  const [newPrinterRole, setNewPrinterRole] = useState<'cashier' | 'kitchen'>('kitchen')
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [showAdvancedPrinter, setShowAdvancedPrinter] = useState(false)
  const [testedPrinterSignature, setTestedPrinterSignature] = useState<string | null>(null)

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

  const applyKitchenStations = async (stations: string[]) => {
    const normalized = Array.from(new Set(stations.map((s) => s.trim()).filter(Boolean)))
    const currentMap = form.stationPrinterMap ?? {}
    const nextMap: Record<string, string> = {}
    normalized.forEach((station) => {
      if (currentMap[station]) nextMap[station] = currentMap[station]
    })
    setForm((prev) => ({ ...prev, kitchenStations: normalized, stationPrinterMap: nextMap }))
    await save({ kitchenStations: normalized, stationPrinterMap: nextMap })
  }

  const handleAddStation = async () => {
    const trimmed = newStation.trim()
    if (!trimmed) return
    const current = form.kitchenStations ?? []
    const exists = current.some((s) => s.toLowerCase() === trimmed.toLowerCase())
    if (!exists) {
      await applyKitchenStations([...current, trimmed])
    }
    setNewStation('')
  }

  const handleRemoveStation = async (station: string) => {
    const current = form.kitchenStations ?? []
    await applyKitchenStations(current.filter((s) => s !== station))
  }

  const handleAddPrinterProfile = () => {
    const name = newPrinterName.trim()
    const ip = newPrinterIP.trim()
    const port = parseInt(newPrinterPort, 10) || 9100
    if (!name || !ip) return

    const signature = `${name}|${ip}|${port}|${newPrinterRole}`
    if (testedPrinterSignature !== signature) {
      alert('Sila tekan "Test Profile" dahulu sebelum simpan printer profile.')
      return
    }

    const profile: PrinterProfile = {
      id: generateId(),
      name,
      role: newPrinterRole,
      ip,
      port,
      enabled: true,
    }

    setForm((prev) => ({ ...prev, printerProfiles: [...(prev.printerProfiles ?? []), profile] }))
    setNewPrinterName('')
    setNewPrinterIP('')
    setNewPrinterPort('9100')
    setNewPrinterRole('kitchen')
    setTestedPrinterSignature(null)
  }

  const handleTestPrinterProfile = () => {
    const name = newPrinterName.trim()
    const ip = newPrinterIP.trim()
    const port = parseInt(newPrinterPort, 10) || 9100
    if (!name || !ip) {
      alert('Isi nama printer dan IP dahulu sebelum test.')
      return
    }

    if (newPrinterRole === 'cashier') testPrintReceipt(form)
    else testPrintKitchen(form)

    setTestedPrinterSignature(`${name}|${ip}|${port}|${newPrinterRole}`)
  }

  const handleRemovePrinterProfile = (profileId: string) => {
    setForm((prev) => {
      const nextProfiles = (prev.printerProfiles ?? []).filter((p) => p.id !== profileId)
      const nextMap: Record<string, string> = {}
      Object.entries(prev.stationPrinterMap ?? {}).forEach(([station, mappedId]) => {
        if (mappedId !== profileId) nextMap[station] = mappedId
      })
      return { ...prev, printerProfiles: nextProfiles, stationPrinterMap: nextMap }
    })
  }

  const kitchenPrinterProfiles = (form.printerProfiles ?? []).filter((p) => p.role === 'kitchen')
  const pendingProfileSignature = `${newPrinterName.trim()}|${newPrinterIP.trim()}|${parseInt(newPrinterPort, 10) || 9100}|${newPrinterRole}`
  const profileTestPassed = testedPrinterSignature === pendingProfileSignature && !!newPrinterName.trim() && !!newPrinterIP.trim()

  return (
    <div className="max-w-xl p-5">
      <div className="mb-5 flex items-center gap-2.5">
        <Settings className="h-5 w-5 text-zinc-500" />
        <h1 className="text-base font-bold text-zinc-900">Settings</h1>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <button
          onClick={() => setActiveTab('profile')}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${activeTab === 'profile' ? 'bg-blue-600 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200'}`}
        >
          Profile
        </button>
        <button
          onClick={() => setActiveTab('printer')}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${activeTab === 'printer' ? 'bg-blue-600 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200'}`}
        >
          Printer
        </button>
        <button
          onClick={() => setActiveTab('license')}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${activeTab === 'license' ? 'bg-blue-600 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200'}`}
        >
          License
        </button>
      </div>

      <div className="space-y-4">
        {/* Lesen & Plan */}
        {activeTab === 'license' && license && (
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
        {activeTab === 'profile' && (
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
        )}

        {/* Printer Center */}
        {activeTab === 'printer' && (
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3">
          <div className="px-1">
            <h2 className="text-sm font-semibold text-zinc-900">Printer Center</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Semua tetapan berkaitan printer dikumpulkan di sini. Tetapan lama Receipt/Kitchen masih digunakan untuk flow print semasa.
            </p>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Setup Flow (Disarankan)</CardTitle>
              <CardDescription>Ikut urutan ini supaya setup cepat dan kurang error.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-zinc-600">
              <p>1. Isi Printer Profile (nama, role, IP, port).</p>
              <p>2. Tekan <span className="font-semibold">Test Profile</span> dan pastikan sample print keluar.</p>
              <p>3. Simpan profile, kemudian set mapping pada Routing Stesen → Printer.</p>
            </CardContent>
          </Card>

          <div className="px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Basic</p>
          </div>

        {/* Receipt Printer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Receipt Printer (LAN/TCP)
            </CardTitle>
            <CardDescription>Legacy aktif: digunakan sekarang untuk cetak resit pelanggan</CardDescription>
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
            <CardDescription>Legacy aktif: digunakan sekarang untuk cetak KOT dapur</CardDescription>
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
              onClick={() => testPrintKitchen(form)}
            >
              <Printer className="mr-1.5 h-3 w-3" /> Test Print Tiket Dapur
            </Button>
          </CardContent>
        </Card>

        {/* Kitchen Stations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4" />
              Stesen Dapur
            </CardTitle>
            <CardDescription>Pecahkan slip KOT mengikut stesen (e.g. Kitchen, Bar)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {(form.kitchenStations ?? []).map((s) => (
                <span key={s} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  {s}
                  <button
                    onClick={() => { void handleRemoveStation(s) }}
                    className="ml-0.5 text-zinc-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nama stesen baru"
                value={newStation}
                onChange={(e) => setNewStation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleAddStation()
                  }
                }}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => { void handleAddStation() }}
              >
                Tambah
              </Button>
            </div>
            <p className="text-[10px] text-zinc-400">Stesen disimpan automatik apabila tambah atau padam.</p>
          </CardContent>
        </Card>

        {/* Printer Profiles */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Printer Profiles
            </CardTitle>
            <CardDescription>Untuk routing direct TCP (Capacitor) bagi cashier/kitchen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="space-y-1.5">
              {(form.printerProfiles ?? []).map((p) => (
                <div key={p.id} className="rounded-lg border border-zinc-200 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-800">{p.name}</p>
                      <p className="text-[11px] text-zinc-500">{p.ip}:{p.port} · {p.role}</p>
                    </div>
                    <button
                      onClick={() => handleRemovePrinterProfile(p.id)}
                      className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              {(form.printerProfiles ?? []).length === 0 && (
                <p className="text-[11px] text-zinc-400">Belum ada printer profile.</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                placeholder="Nama printer (contoh: Kitchen Hot)"
                value={newPrinterName}
                onChange={(e) => { setNewPrinterName(e.target.value); setTestedPrinterSignature(null) }}
                className="h-8 text-xs"
              />
              <select
                value={newPrinterRole}
                onChange={(e) => { setNewPrinterRole(e.target.value as 'cashier' | 'kitchen'); setTestedPrinterSignature(null) }}
                className="h-8 rounded border border-zinc-200 px-2 text-xs"
              >
                <option value="kitchen">Kitchen</option>
                <option value="cashier">Cashier</option>
              </select>
              <Input
                placeholder="IP printer"
                value={newPrinterIP}
                onChange={(e) => { setNewPrinterIP(e.target.value); setTestedPrinterSignature(null) }}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Port"
                value={newPrinterPort}
                onChange={(e) => { setNewPrinterPort(e.target.value); setTestedPrinterSignature(null) }}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={handleTestPrinterProfile}>Test Profile</Button>
              <Button size="sm" variant="outline" onClick={handleAddPrinterProfile}>Tambah Printer Profile</Button>
            </div>
            <p className={`text-[11px] ${profileTestPassed ? 'text-emerald-600' : 'text-zinc-400'}`}>
              {profileTestPassed ? 'Profile lulus test dan boleh disimpan.' : 'Wajib test profile dahulu sebelum simpan.'}
            </p>
          </CardContent>
        </Card>

          <div className="px-1">
            <Button size="sm" variant="outline" className="w-full" onClick={() => setShowAdvancedPrinter((v) => !v)}>
              {showAdvancedPrinter ? 'Sembunyi Advanced' : 'Tunjuk Advanced'}
            </Button>
          </div>

        {/* Station to Printer Routing */}
        {showAdvancedPrinter && (
        <>
        {/* Kitchen Stations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4" />
              Stesen Dapur
            </CardTitle>
            <CardDescription>Pecahkan slip KOT mengikut stesen (e.g. Kitchen, Bar)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {(form.kitchenStations ?? []).map((s) => (
                <span key={s} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  {s}
                  <button
                    onClick={() => { void handleRemoveStation(s) }}
                    className="ml-0.5 text-zinc-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nama stesen baru"
                value={newStation}
                onChange={(e) => setNewStation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleAddStation()
                  }
                }}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => { void handleAddStation() }}
              >
                Tambah
              </Button>
            </div>
            <p className="text-[10px] text-zinc-400">Stesen disimpan automatik apabila tambah atau padam.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Routing Stesen → Printer
            </CardTitle>
            <CardDescription>Set setiap stesen dapur untuk cetak ke printer profile tertentu</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(form.kitchenStations ?? []).map((station) => (
              <div key={station} className="grid grid-cols-2 items-center gap-2">
                <p className="text-xs font-medium text-zinc-700">{station}</p>
                <select
                  value={(form.stationPrinterMap ?? {})[station] ?? ''}
                  onChange={(e) => {
                    const printerId = e.target.value
                    setForm((prev) => ({
                      ...prev,
                      stationPrinterMap: {
                        ...(prev.stationPrinterMap ?? {}),
                        [station]: printerId,
                      },
                    }))
                  }}
                  className="h-8 rounded border border-zinc-200 px-2 text-xs"
                >
                  <option value="">Tiada mapping</option>
                  {kitchenPrinterProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            ))}
            {(form.kitchenStations ?? []).length === 0 && (
              <p className="text-[11px] text-zinc-400">Tambah stesen dapur dahulu untuk set routing printer.</p>
            )}
            <p className="text-[10px] text-zinc-400">Mapping ini digunakan untuk routing print direct TCP semasa mode Capacitor.</p>
          </CardContent>
        </Card>
        </>
        )}

        </section>
        )}

        {activeTab !== 'license' && (
        <Button className="w-full" onClick={handleSave}>
          {saved ? '✓ Saved!' : 'Save Settings'}
        </Button>
        )}
      </div>
    </div>
  )
}
