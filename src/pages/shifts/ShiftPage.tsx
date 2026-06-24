import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { useShiftStore } from '@/store/shiftStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Numpad } from '@/components/ui/numpad'
import {
  Clock, Play, Square, History, AlertCircle, TrendingUp, TrendingDown, ChevronDown, Calendar, ArrowLeft,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import type { Shift, Order } from '@/types'
import { differenceInMinutes } from 'date-fns'

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ShiftFinance {
  totalSales: number
  cashSales: number
  expectedCash: number
  actualCash: number | null
  diff: number | null
}

function calcShiftFinance(shift: Shift, orders: Order[]): ShiftFinance {
  const totalSales = orders
    .filter((o) => o.status === 'paid')
    .reduce((s, o) => s + o.total, 0)
  const cashSales = orders
    .filter((o) => o.paymentMethod === 'cash' && o.status === 'paid')
    .reduce((s, o) => s + o.total, 0)
  const expectedCash = shift.cashFloat + cashSales
  const actualCash = shift.closingCash ?? null
  const diff = actualCash != null ? actualCash - expectedCash : null
  return { totalSales, cashSales, expectedCash, actualCash, diff }
}

function fmtTime(d?: Date) {
  if (!d) return '-'
  return new Date(d).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(d?: Date) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(+y, +m - 1, 1).toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' })
}

function shiftDuration(shift: Shift): string {
  const end = shift.closedAt ? new Date(shift.closedAt) : new Date()
  const mins = differenceInMinutes(end, new Date(shift.openedAt))
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ShiftPage() {
  const { currentShift, openShift, closeShift } = useShiftStore()
  const { currentStaff } = useAuthStore()

  const [cashFloat, setCashFloat] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [showOpenConfirm, setShowOpenConfirm] = useState(false)
  const [openError, setOpenError] = useState('')
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())

  // Floating numpad controls
  const [floatPadOpen, setFloatPadOpen] = useState(false)
  const [closePadOpen, setClosePadOpen] = useState(false)

  // ─── Data ───────────────────────────────────────────────────────────────────

  const allShifts = useLiveQuery(() => db.shifts.orderBy('openedAt').reverse().toArray(), [])
  const allOrders = useLiveQuery(() => db.orders.where('status').equals('paid').toArray(), [])

  const financeMap = useMemo(() => {
    if (!allShifts || !allOrders) return new Map<string, ShiftFinance>()
    const map = new Map<string, ShiftFinance>()
    for (const shift of allShifts) {
      map.set(shift.id, calcShiftFinance(shift, allOrders.filter((o) => o.shiftId === shift.id)))
    }
    return map
  }, [allShifts, allOrders])

  const monthGroups = useMemo(() => {
    if (!allShifts) return []
    const groups = new Map<string, Shift[]>()
    for (const shift of allShifts) {
      const key = monthKey(shift.openedAt)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(shift)
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [allShifts])

  const currentFinance = currentShift ? financeMap.get(currentShift.id) : null

  // Real-time stats for current open shift
  const currentShiftStats = useLiveQuery(async () => {
    if (!currentShift) return null
    const orders = await db.orders
      .where('shiftId').equals(currentShift.id)
      .and((o) => o.status === 'paid')
      .toArray()
    return {
      count: orders.length,
      total: orders.reduce((s, o) => s + o.total, 0),
      cashSales: orders.filter((o) => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0),
    }
  }, [currentShift?.id])

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleOpenShift = () => {
    const amount = parseFloat(cashFloat) || 0
    if (amount <= 0) { setOpenError('Sila masukkan cash float (lebih daripada RM 0).'); return }
    setOpenError('')
    setShowOpenConfirm(true)
    setFloatPadOpen(false)
  }

  const handleConfirmOpen = async () => {
    if (!currentStaff) return
    const amount = parseFloat(cashFloat) || 0
    if (amount <= 0) return
    await openShift(amount, currentStaff.id, currentStaff.name)
    setShowOpenConfirm(false)
    setOpenError('')
    setCashFloat('')
  }

  const handleCloseShift = async () => {
    if (!currentStaff || !currentShift) return
    if (!closingCash) return
    const amount = parseFloat(closingCash)
    await closeShift(currentStaff.id, currentStaff.name, amount)
    setClosingCash('')
    setShowCloseForm(false)
    setClosePadOpen(false)
  }

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

    const navigate = useNavigate()

// ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto p-5 max-w-3xl">
      {/* Back */}
      <button
        onClick={() => navigate('/settings')}
        className="mb-4 flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Settings
      </button>

      {/* Header */}
      <div className="mb-5 flex items-center gap-2.5">
        <Clock className="h-5 w-5 text-zinc-500" />
        <h1 className="text-base font-bold text-zinc-900">Shift</h1>
      </div>

      {/* ── Active Shift Card ──────────────────────────────────────────────── */}
      <Card className="mb-5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <div className={`h-2 w-2 rounded-full ${currentShift ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
            {currentShift ? 'Shift Aktif' : 'Tiada Shift Aktif'}
            {currentShift && differenceInMinutes(new Date(), new Date(currentShift.openedAt)) > 720 && (
              <span className="ml-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse">
                ⚠ &gt;12 jam
              </span>
            )}
          </CardTitle>
          <CardDescription>
            {currentShift
              ? `Dibuka oleh ${currentShift.openedBy} pada ${fmtTime(currentShift.openedAt)} · ${shiftDuration(currentShift)}`
              : 'Buka shift untuk mula memproses jualan'}
          </CardDescription>
        </CardHeader>

        {currentShift ? (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-zinc-50 p-3">
              <div><p className="text-[11px] text-zinc-500">Dibuka Oleh</p>
                <p className="text-xs font-semibold text-zinc-800">{currentShift.openedBy}</p></div>
              <div><p className="text-[11px] text-zinc-500">Masa Buka</p>
                <p className="text-xs font-semibold text-zinc-800">{fmtDate(currentShift.openedAt)} {fmtTime(currentShift.openedAt)}</p></div>
              <div><p className="text-[11px] text-zinc-500">Cash Float</p>
                <p className="text-xs font-semibold text-zinc-800">{formatCurrency(currentShift.cashFloat)}</p></div>
              {currentFinance && <div><p className="text-[11px] text-zinc-500">Jualan Tunai</p>
                <p className="text-xs font-semibold text-zinc-800">{formatCurrency(currentFinance.cashSales)}</p></div>}
              {currentFinance && <div className="col-span-2 border-t border-zinc-200 pt-2">
                <p className="text-[11px] text-zinc-500">Jangkaan Tunai Dalam Laci</p>
                <p className="text-sm font-bold text-zinc-900">
                  {formatCurrency(currentFinance.expectedCash)}
                  <span className="ml-1 text-[10px] font-normal text-zinc-400">(float + tunai)</span>
                </p>
              </div>}
            </div>

            {/* Live stats */}
            {currentShiftStats && (
              <div className="flex gap-3">
                <div className="flex-1 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-center">
                  <div className="text-lg font-bold text-emerald-800">{currentShiftStats.count}</div>
                  <div className="text-[10px] text-emerald-600">Order</div>
                </div>
                <div className="flex-1 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-center">
                  <div className="text-lg font-bold text-emerald-800">{formatCurrency(currentShiftStats.total)}</div>
                  <div className="text-[10px] text-emerald-600">Jualan</div>
                </div>
              </div>
            )}

            {!showCloseForm ? (
              <Button onClick={() => setShowCloseForm(true)} className="w-full" variant="outline">
                <Square className="mr-1.5 h-3.5 w-3.5" />Tutup Shift
              </Button>
            ) : (
              <div className="space-y-2.5 rounded-lg border border-zinc-200 p-3">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <p className="text-xs font-semibold text-zinc-800">Tutup Shift</p>
                </div>
                <p className="text-[11px] text-zinc-500">Shift akan ditutup atas nama <strong>{currentStaff?.name}</strong>.</p>

                {/* Sales breakdown */}
                {currentShiftStats && currentFinance && (
                  <div className="rounded-lg bg-zinc-50 p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Jumlah Order</span>
                      <span className="font-semibold text-zinc-800">{currentShiftStats.count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Jualan (Kad/QR)</span>
                      <span className="font-semibold text-zinc-700">{formatCurrency(currentShiftStats.total - currentShiftStats.cashSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Jualan Tunai</span>
                      <span className="font-semibold text-zinc-700">{formatCurrency(currentShiftStats.cashSales)}</span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-200 pt-1 mt-1">
                      <span className="text-zinc-500">Jangkaan Tunai dalam Laci</span>
                      <span className="font-bold text-blue-700">{formatCurrency(currentFinance.expectedCash)}</span>
                    </div>
                  </div>
                )}
                {(!currentShiftStats || !currentFinance) && currentFinance && (
                  <p className="text-[11px] text-zinc-500">Jangkaan tunai: {formatCurrency(currentFinance.expectedCash)}</p>
                )}

                {/* Clickable cash display → opens floating numpad */}
                <button
                  type="button"
                  onClick={() => setClosePadOpen(true)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                >
                  <p className="text-[11px] font-medium text-zinc-400">Tunai Dalam Laci (RM)</p>
                  <p className={`mt-0.5 text-lg font-bold tabular-nums ${closingCash ? 'text-zinc-900' : 'text-zinc-300'}`}>
                    {closingCash ? formatCurrency(parseFloat(closingCash)) : 'Sila masukkan jumlah tunai *'}
                  </p>
                </button>

                {/* Live variance preview */}
                {closingCash && currentFinance && (() => {
                  const actual = parseFloat(closingCash) || 0
                  const variance = actual - currentFinance.expectedCash
                  return (
                    <div className={`flex justify-between rounded-lg px-3 py-2 text-xs font-semibold ${variance === 0 ? 'bg-emerald-50 text-emerald-700' : variance > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'}`}>
                      <span>Varians</span>
                      <span>{variance >= 0 ? '+' : ''}{formatCurrency(variance)}</span>
                    </div>
                  )
                })()}

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={handleCloseShift} disabled={!closingCash}>
                    <Square className="mr-1 h-3 w-3" /> Sahkan Tutup
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowCloseForm(false); setClosePadOpen(false) }}>Batal</Button>
                </div>
                {!closingCash && (
                  <p className="text-[11px] font-medium text-red-500">⚠ Sila kira & masukkan jumlah tunai dalam laci sebelum tutup shift.</p>
                )}
              </div>
            )}
          </CardContent>
        ) : (
          <CardContent className="space-y-3">
            {!showOpenConfirm ? (
              <>
                {/* Clickable cash display → opens floating numpad */}
                <button
                  type="button"
                  onClick={() => setFloatPadOpen(true)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                >
                  <p className="text-[11px] font-medium text-zinc-400">Cash Float (RM)</p>
                  <p className={`mt-0.5 text-lg font-bold tabular-nums ${cashFloat ? 'text-zinc-900' : 'text-zinc-300'}`}>
                    {cashFloat ? formatCurrency(parseFloat(cashFloat)) : '0.00'}
                  </p>
                </button>
                {openError && <p className="text-[11px] font-medium text-red-500">{openError}</p>}
                <Button className="w-full" onClick={handleOpenShift}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />Buka Shift
                </Button>
              </>
            ) : (
              <div className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-800">Sahkan Buka Shift</p>
                </div>
                <p className="text-xs text-amber-700">
                  Cash float: <span className="font-bold">{formatCurrency(parseFloat(cashFloat) || 0)}</span>. Sila pastikan jumlah ini sepadan dengan tunai dalam laci.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={handleConfirmOpen}><Play className="mr-1 h-3 w-3" /> Sahkan & Buka</Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowOpenConfirm(false); setOpenError('') }}>Batal</Button>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── History ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" />Sejarah Shift
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthGroups.length > 0 ? (
            <div className="space-y-1.5">
              {monthGroups.map(([key, shifts]) => {
                const isExpanded = expandedMonths.has(key)
                let monthTotal = 0
                let monthClosed = 0
                for (const s of shifts) {
                  const f = financeMap.get(s.id)
                  if (f && f.actualCash != null) { monthTotal += f.diff ?? 0; monthClosed++ }
                }
                const isOver = monthTotal >= 0

                return (
                  <div key={key} className="rounded-lg border border-zinc-200">
                    {/* Month header */}
                    <button
                      onClick={() => toggleMonth(key)}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                        <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="text-xs font-semibold text-zinc-700">{monthLabel(key)}</span>
                        <span className="text-[10px] text-zinc-400">{shifts.length} shift</span>
                      </div>
                      {monthClosed > 0 && (
                        <span className={`text-[11px] font-semibold ${isOver ? 'text-emerald-600' : 'text-red-500'}`}>
                          {isOver ? <TrendingUp className="mr-0.5 inline h-3 w-3" /> : <TrendingDown className="mr-0.5 inline h-3 w-3" />}
                          {isOver ? '+' : ''}{formatCurrency(monthTotal)}
                        </span>
                      )}
                    </button>

                    {/* Shift rows — detailed table */}
                    {isExpanded && (
                      <div className="border-t border-zinc-100 overflow-x-auto">
                        <table className="w-full text-xs whitespace-nowrap">
                          <thead>
                            <tr className="border-b border-zinc-100 bg-zinc-50/50">
                              <th className="px-3 py-2 text-left font-semibold text-zinc-400">Tarikh</th>
                              <th className="px-3 py-2 text-left font-semibold text-zinc-400">Cashier</th>
                              <th className="px-3 py-2 text-left font-semibold text-zinc-400">Buka</th>
                              <th className="px-3 py-2 text-left font-semibold text-zinc-400">Tutup</th>
                              <th className="px-3 py-2 text-right font-semibold text-zinc-400">Jualan</th>
                              <th className="px-3 py-2 text-right font-semibold text-zinc-400">Jangkaan Tunai</th>
                              <th className="px-3 py-2 text-right font-semibold text-zinc-400">Kiraan Tutup</th>
                              <th className="px-3 py-2 text-right font-semibold text-zinc-400">Varians</th>
                              <th className="px-3 py-2 text-right font-semibold text-zinc-400">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shifts.map((shift) => {
                              const fin = financeMap.get(shift.id)
                              const isActive = shift.status === 'open'
                              return (
                                <tr key={shift.id} className={`border-b border-zinc-50 last:border-0 ${isActive ? 'bg-emerald-50/50' : 'hover:bg-zinc-50'}`}>
                                  <td className="px-3 py-2 text-zinc-700">{fmtDate(shift.openedAt)}</td>
                                  <td className="px-3 py-2 font-medium text-zinc-800">
                                    {shift.openedBy}
                                    {isActive && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Aktif</span>}
                                  </td>
                                  <td className="px-3 py-2 text-zinc-500">{fmtTime(shift.openedAt)}</td>
                                  <td className="px-3 py-2 text-zinc-500">{fmtTime(shift.closedAt)}</td>
                                  <td className="px-3 py-2 text-right text-zinc-700">
                                    {fin ? formatCurrency(fin.totalSales) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-blue-700">
                                    {fin ? formatCurrency(fin.expectedCash) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right text-zinc-700">
                                    {fin?.actualCash != null ? formatCurrency(fin.actualCash) : <span className="text-zinc-300">Tiada kiraan</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {fin?.diff === null ? (
                                      <span className="text-zinc-300">—</span>
                                    ) : fin.diff === 0 ? (
                                      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">✓ Tepat</span>
                                    ) : fin.diff > 0 ? (
                                      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">+{formatCurrency(fin.diff)}</span>
                                    ) : (
                                      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-600">−{formatCurrency(Math.abs(fin.diff))}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {isActive
                                      ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><span className="h-1 w-1 rounded-full bg-emerald-500" />Aktif</span>
                                      : <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">Tutup</span>
                                    }
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-zinc-400">Tiada rekod shift.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Floating Numpads ────────────────────────────────────────────────── */}
      <Numpad
        open={floatPadOpen}
        onClose={() => setFloatPadOpen(false)}
        value={cashFloat}
        onChange={setCashFloat}
        label="Cash Float (RM)"
        confirmLabel="OK"
        placeholder="0.00"
      />
      <Numpad
        open={closePadOpen}
        onClose={() => setClosePadOpen(false)}
        value={closingCash}
        onChange={setClosingCash}
        label="Tunai Dalam Laci (RM)"
        confirmLabel="OK"
        placeholder="Sila masukkan jumlah tunai"
      />
    </div>
  )
}
