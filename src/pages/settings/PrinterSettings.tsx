/**
 * Printer Management Sub-page
 *
 * Manages printer configuration:
 * - Add/remove network & Bluetooth printers
 * - Assign receipt printer
 * - Map kitchen stations to printers
 * - Test print
 */

import { useState } from 'react'
import { usePrinterStore } from '@/services/printer/usePrinterStore'
import { useSettingsStore } from '@/store/settingsStore'
import BluetoothScanner, { type BluetoothDevice } from '@/services/printer/connections/BluetoothScanner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft,
  Printer,
  Plus,
  Trash2,
  Wifi,
  Bluetooth,
  Play,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Search,
  Loader2,
} from 'lucide-react'
import type { PrinterConnectionType } from '@/types'

interface Props {
  onBack: () => void
}

export function PrinterSettings({ onBack }: Props) {
  const {
    printers,
    receiptPrinterId,
    stationPrinters,
    printerStatus,
    addPrinter,
    updatePrinter,
    removePrinter,
    setReceiptPrinter,
    setStationPrinter,
    testPrinter,
  } = usePrinterStore()

  const { settings } = useSettingsStore()

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<PrinterConnectionType>('network')
  const [newIp, setNewIp] = useState('')
  const [newPort, setNewPort] = useState('9100')
  const [newMac, setNewMac] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [foundDevices, setFoundDevices] = useState<BluetoothDevice[]>([])
  const [scanError, setScanError] = useState('')
  const [showDevicePicker, setShowDevicePicker] = useState(false)
  const [testResult, setTestResult] = useState<Record<string, 'ok' | 'fail' | 'testing'>>({})

  const handleScan = async () => {
    setIsScanning(true)
    setScanError('')
    setFoundDevices([])
    setShowDevicePicker(true)

    try {
      // Listen for live device discovery events
      const listener = await BluetoothScanner.addListener('onDeviceFound', (event) => {
        if (event.type === 'device_found' && event.device) {
          setFoundDevices((prev) => {
            // deduplicate
            if (prev.some((d) => d.address === event.device!.address)) return prev
            return [...prev, event.device!]
          })
        }
      })

      const result = await BluetoothScanner.scan()

      // Merge paired + discovered devices, deduplicated
      const allDevices = result.devices
      try {
        const paired = await BluetoothScanner.getPairedDevices()
        for (const d of paired.devices) {
          if (!allDevices.some((ad) => ad.address === d.address)) {
            allDevices.unshift(d) // paired first
          }
        }
      } catch {
        // getPairedDevices may not be available — ignore
      }

      setFoundDevices(allDevices)
      await listener.remove()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      setScanError(msg)
      console.warn('[BluetoothScanner]', msg)
    } finally {
      setIsScanning(false)
    }
  }

  const selectDevice = (device: BluetoothDevice) => {
    setNewMac(device.address)
    setShowDevicePicker(false)
    setFoundDevices([])
  }

  const handleAdd = () => {
    if (!newName.trim()) return
    const id = addPrinter({
      name: newName.trim(),
      type: newType,
      ipAddress: newType === 'network' ? newIp.trim() : undefined,
      port: newType === 'network' ? parseInt(newPort, 10) : undefined,
      macAddress: newType === 'bluetooth' ? newMac.trim() : undefined,
      isActive: true,
      paperWidth: 58,
    })
    setShowAdd(false)
    setNewName('')
    setNewIp('')
    setNewPort('9100')
    setNewMac('')
    // Default to receipt printer if first one
    if (!receiptPrinterId) {
      setReceiptPrinter(id)
    }
  }

  const handleTest = async (id: string) => {
    setTestResult((r) => ({ ...r, [id]: 'testing' }))
    try {
      await testPrinter(id)
      setTestResult((r) => ({ ...r, [id]: 'ok' }))
    } catch {
      setTestResult((r) => ({ ...r, [id]: 'fail' }))
    }
    setTimeout(() => {
      setTestResult((r) => {
        const { [id]: _, ...rest } = r
        return rest
      })
    }, 3000)
  }

  const typeIcon = (type: PrinterConnectionType) => {
    switch (type) {
      case 'network': return <Wifi className="h-3.5 w-3.5" />
      case 'bluetooth': return <Bluetooth className="h-3.5 w-3.5" />
      default: return <Printer className="h-3.5 w-3.5" />
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Settings
      </button>

      {/* Printer list */}
      <div className="space-y-3">
        {printers.length === 0 && !showAdd && (
          <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
            <Printer className="h-10 w-10" />
            <p className="text-sm">No printers configured</p>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Printer
            </Button>
          </div>
        )}

        {printers.map((printer) => (
          <Card key={printer.id} className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100">
                    {typeIcon(printer.type)}
                  </div>
                  <div>
                    <CardTitle className="text-sm">{printer.name}</CardTitle>
                    <p className="text-[11px] text-zinc-400">
                      {printer.type === 'network'
                        ? `${printer.ipAddress}:${printer.port ?? 9100}`
                        : printer.macAddress}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Printer type label */}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    printer.type === 'network'
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-green-50 text-green-600'
                  }`}>
                    {printer.type === 'network' ? 'LAN/WiFi' : 'Bluetooth'}
                  </span>
                  {/* Status */}
                  {printerStatus[printer.id] === 'online' && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                  {printerStatus[printer.id] === 'offline' && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Row 1: Receipt + Test */}
              <div className="flex items-center gap-2 mb-2">
                <Button
                  variant={receiptPrinterId === printer.id ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-[11px]"
                  onClick={() => setReceiptPrinter(printer.id)}
                >
                  {receiptPrinterId === printer.id ? '✓ Receipt Printer' : 'Set as Receipt'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px]"
                  onClick={() => handleTest(printer.id)}
                  disabled={testResult[printer.id] === 'testing'}
                >
                  {testResult[printer.id] === 'testing' ? (
                    '...'
                  ) : testResult[printer.id] === 'ok' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : testResult[printer.id] === 'fail' ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1">Test</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => removePrinter(printer.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Kitchen station mapping */}
              <details className="group">
                <summary className="flex items-center gap-1 text-[11px] text-zinc-400 cursor-pointer hover:text-zinc-600">
                  <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
                  Kitchen station mapping
                </summary>
                <div className="mt-2 space-y-1.5">
                  {settings.kitchenStations.map((station) => {
                    const mapping = stationPrinters.find((sp) => sp.station === station)
                    const isMapped = mapping?.printerId === printer.id
                    return (
                      <button
                        key={station}
                        onClick={() => setStationPrinter(station, printer.id)}
                        className={`w-full rounded-md px-3 py-1.5 text-left text-[11px] font-medium transition ${
                          isMapped
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
                        }`}
                      >
                        {station} {isMapped ? '✓' : ''}
                      </button>
                    )
                  })}
                </div>
              </details>
            </CardContent>
          </Card>
        ))}

        {/* Add new printer form */}
        {showAdd && (
          <Card className="border-blue-200 bg-blue-50/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Plus className="h-4 w-4 text-blue-500" />
                New Printer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Printer Name</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. Receipt Printer"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Connection Type</Label>
                <div className="mt-1 flex rounded-lg bg-zinc-100 p-0.5">
                  {(['network', 'bluetooth'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setNewType(t)}
                      className={`flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition ${
                        newType === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {newType === 'network' && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Label className="text-xs">IP Address</Label>
                    <Input
                      className="mt-1"
                      placeholder="192.168.1.100"
                      value={newIp}
                      onChange={(e) => setNewIp(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Port</Label>
                    <Input
                      className="mt-1"
                      value={newPort}
                      onChange={(e) => setNewPort(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {newType === 'bluetooth' && (
                <div>
                  <Label className="text-xs">MAC Address</Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      className="flex-1 font-mono text-xs"
                      placeholder="00:11:22:33:44:55"
                      value={newMac}
                      onChange={(e) => setNewMac(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleScan}
                      disabled={isScanning}
                      className="shrink-0 gap-1 text-xs"
                    >
                      {isScanning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="h-3.5 w-3.5" />
                      )}
                      Scan
                    </Button>
                  </div>

                  {/* Device picker popup */}
                  {showDevicePicker && (
                    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/30 p-2">
                      <p className="text-[11px] font-medium text-blue-700 mb-1.5">
                        {isScanning ? 'Scanning...' : foundDevices.length > 0 ? 'Found devices — tap to select:' : 'No devices found'}
                      </p>
                      {scanError && (
                        <p className="text-[11px] text-red-500 mb-1.5">{scanError}</p>
                      )}
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {foundDevices.map((d) => (
                          <button
                            key={d.address}
                            onClick={() => selectDevice(d)}
                            className="flex w-full items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-left text-xs hover:bg-blue-50 border border-zinc-100 transition"
                          >
                            <Bluetooth className="h-3 w-3 shrink-0 text-blue-500" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-zinc-800 truncate">{d.name}</p>
                              <p className="text-[10px] text-zinc-400 font-mono">{d.address}</p>
                            </div>
                            {d.paired && (
                              <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">
                                PAIRED
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => { setShowDevicePicker(false); setFoundDevices([]); }}
                        className="mt-1.5 w-full rounded-md py-1 text-center text-[10px] text-zinc-400 hover:text-zinc-600"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button className="flex-1" onClick={handleAdd} disabled={!newName.trim()}>
                  Add Printer
                </Button>
                <Button variant="outline" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add button — shown when printers exist and form is hidden */}
        {printers.length > 0 && !showAdd && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Printer
          </Button>
        )}

        {/* Network printer note */}
        <p className="text-[11px] text-zinc-400 text-center">
          For network printers, make sure the{' '}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-[10px]">print-bridge</code>{' '}
          is running (<code className="rounded bg-zinc-100 px-1 py-0.5 text-[10px]">npm run bridge</code>).
          <br />
          Bluetooth requires the native Capacitor plugin to be installed.
        </p>
      </div>
    </div>
  )
}
