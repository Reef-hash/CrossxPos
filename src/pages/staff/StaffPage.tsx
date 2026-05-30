import { useLiveQuery } from 'dexie-react-hooks'
import { useState, useRef } from 'react'
import { db } from '@/db'
import type { Staff, StaffRole, Shift } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { generateId } from '@/lib/utils'
import { useLicenseStore } from '@/store/licenseStore'
import { formatLimit } from '@/lib/license'
import { useAuthStore } from '@/store/authStore'
import { useShiftStore } from '@/store/shiftStore'
import { Plus, Pencil, Trash2, Users, Clock, LogIn, LogOut, CalendarDays } from 'lucide-react'
import { format, differenceInMinutes, startOfDay, endOfDay, parseISO } from 'date-fns'

const roleColors: Record<StaffRole, 'default' | 'success' | 'warning' | 'secondary'> = {
  admin: 'default',
  cashier: 'success',
  waiter: 'warning',
  kitchen: 'secondary',
}

// ── Round to nearest 5 sen (Malaysian cash rounding) ────────────────────────
function roundToNearest5Sen(amount: number): number {
  return Math.round(amount * 20) / 20
}

// ── Tablet-friendly numeric keypad ──────────────────────────────────────────
function NumericKeypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const handleKey = (key: string) => {
    if (key === '⌫') { onChange(value.slice(0, -1)); return }
    if (key === '.') {
      if (value.includes('.')) return
      onChange((value || '0') + '.')
      return
    }
    const parts = value.split('.')
    if (parts[1] !== undefined && parts[1].length >= 2) return
    onChange(value === '0' ? key : value + key)
  }
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫']
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => handleKey(k)}
          className={`rounded-xl py-4 text-lg font-semibold transition-colors select-none ${
            k === '⌫'
              ? 'bg-red-50 text-red-500 hover:bg-red-100 active:bg-red-200'
              : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200 active:bg-zinc-300'
          }`}
        >
          {k}
        </button>
      ))}
    </div>
  )
}

export function StaffPage() {
  const { currentStaff } = useAuthStore()
  const { currentShift, openShift, closeShift } = useShiftStore()
  const isAdmin = currentStaff?.role === 'admin'

  const [activeTab, setActiveTab] = useState<'staff' | 'shift'>(
    currentStaff?.role === 'admin' ? 'staff' : 'shift'
  )

  // ── Staff state ──────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [form, setForm] = useState({ name: '', pin: '', role: 'waiter' as StaffRole })
  const pinRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null])

  const staff = useLiveQuery(async () => {
    const all = await db.staff.toArray()
    return all.sort((a, b) => a.name.localeCompare(b.name))
  })

  const canAdd = useLicenseStore((s) => s.canAdd)
  const limits = useLicenseStore((s) => s.getLimits)()

  // ── Shift state ──────────────────────────────────────────────────────────
  const [cashFloat, setCashFloat] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [closingCash, setClosingCash] = useState('')
  const [keypadTarget, setKeypadTarget] = useState<'cashFloat' | 'closingCash' | null>(null)
  const [shiftDateFrom, setShiftDateFrom] = useState('')
  const [shiftDateTo, setShiftDateTo] = useState('')

  const shifts = useLiveQuery(async () => {
    const all = await db.shifts.orderBy('openedAt').reverse().limit(200).toArray()
    return all.filter((s) => {
      if (!isAdmin && s.openedById !== currentStaff?.id) return false
      if (shiftDateFrom) {
        const from = startOfDay(parseISO(shiftDateFrom))
        const to = shiftDateTo ? endOfDay(parseISO(shiftDateTo)) : endOfDay(parseISO(shiftDateFrom))
        const openedAt = new Date(s.openedAt)
        if (openedAt < from || openedAt > to) return false
      }
      return true
    })
  }, [isAdmin, currentStaff?.id, shiftDateFrom, shiftDateTo])

  // Per-shift cash sales totals (for variance report)
  const shiftSales = useLiveQuery(async () => {
    const paid = await db.orders.where('status').equals('paid').toArray()
    const map: Record<string, { total: number; cashSales: number }> = {}
    for (const o of paid) {
      if (!o.shiftId) continue
      if (!map[o.shiftId]) map[o.shiftId] = { total: 0, cashSales: 0 }
      map[o.shiftId].total += o.total
      if (o.paymentMethod === 'cash') map[o.shiftId].cashSales += o.total
    }
    return map
  })

  // Sales totals for current open shift
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

  const handleOpenShift = async () => {
    if (!currentStaff) return
    const float = parseFloat(cashFloat) || 0
    await openShift(float, currentStaff.id, currentStaff.name)
    setCashFloat('')
  }

  const handleCloseShift = async () => {
    if (!currentStaff) return
    const closing = closingCash !== ''
      ? roundToNearest5Sen(parseFloat(closingCash))
      : undefined
    await closeShift(currentStaff.id, currentStaff.name, closing)
    setConfirmClose(false)
    setClosingCash('')
  }

  const shiftDuration = (s: Shift) => {
    const end = s.closedAt ? new Date(s.closedAt) : new Date()
    const mins = differenceInMinutes(end, new Date(s.openedAt))
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  // ── Staff handlers ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || form.pin.length !== 4) return
    if (!editing && !canAdd('staff', staff?.length ?? 0)) {
      alert(`Had plan anda: ${formatLimit(limits.maxStaff)} staff. Naik taraf ke Pro untuk menambah lebih ramai ahli kakitangan.`)
      return
    }
    const data: Staff = {
      id: editing?.id ?? generateId(),
      name: form.name.trim(),
      pin: form.pin,
      role: form.role,
      isActive: true,
      createdAt: editing?.createdAt ?? new Date(),
    }
    if (editing) {
      await db.staff.put(data)
    } else {
      await db.staff.add(data)
    }
    setShowModal(false)
    setEditing(null)
    setForm({ name: '', pin: '', role: 'waiter' })
  }

  const handleDelete = async (id: string) => {
    if (confirm('Remove this staff?')) await db.staff.delete(id)
  }

  const openEdit = (s: Staff) => {
    setEditing(s)
    setForm({ name: s.name, pin: s.pin, role: s.role })
    setShowModal(true)
  }

  return (
    <div className="p-5">
      {/* Tabs */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex rounded-xl bg-zinc-100 p-1 gap-1">
          {isAdmin && (
          <button
            onClick={() => setActiveTab('staff')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${activeTab === 'staff' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            <Users className="h-3.5 w-3.5" /> Staff
          </button>
          )}
          <button
            onClick={() => setActiveTab('shift')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${activeTab === 'shift' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            <Clock className="h-3.5 w-3.5" /> Shift
            {currentShift && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          </button>
        </div>
        {activeTab === 'staff' && (
          <Button
            size="sm"
            onClick={() => { setEditing(null); setForm({ name: '', pin: '', role: 'waiter' }); setShowModal(true) }}
            disabled={!canAdd('staff', staff?.length ?? 0)}
            title={!canAdd('staff', staff?.length ?? 0) ? `Had plan: ${formatLimit(limits.maxStaff)} staff` : undefined}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Staff {limits.maxStaff !== -1 && <span className="ml-1 opacity-60">({staff?.length ?? 0}/{limits.maxStaff})</span>}
          </Button>
        )}
      </div>

      {/* ── STAFF TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'staff' && (
        <>
          {staff && staff.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {staff.map((s: Staff) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-zinc-200/80 bg-white p-3 shadow-sm">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{s.name}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant={roleColors[s.role]} className="capitalize">{s.role}</Badge>
                      <span className="text-[11px] text-zinc-400">PIN: {'●'.repeat(4)}</span>
                    </div>
                  </div>
                  <div className="flex gap-0.5">
                    <button onClick={() => openEdit(s)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-blue-600">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
              <Users className="mb-2 h-12 w-12" />
              <p className="text-sm font-medium">No staff members</p>
            </div>
          )}
        </>
      )}

      {/* ── SHIFT TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'shift' && (
        <div className="space-y-4">
          {/* Current Shift Card */}
          {currentShift ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-bold text-emerald-800">Shift Aktif</span>
                    {differenceInMinutes(new Date(), new Date(currentShift.openedAt)) > 720 && (
                      <span className="ml-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white animate-pulse">
                        ⚠ &gt;12 jam
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-emerald-900">
                    <div><span className="text-emerald-600 text-xs">Dibuka oleh:</span> <strong>{currentShift.openedBy}</strong></div>
                    <div><span className="text-emerald-600 text-xs">Masa buka:</span> <strong>{format(new Date(currentShift.openedAt), 'dd/MM/yyyy HH:mm')}</strong></div>
                    <div><span className="text-emerald-600 text-xs">Tempoh:</span> <strong>{shiftDuration(currentShift)}</strong></div>
                    <div><span className="text-emerald-600 text-xs">Modal tunai:</span> <strong>RM {currentShift.cashFloat.toFixed(2)}</strong></div>
                  </div>
                  {currentShiftStats && (
                    <div className="mt-3 flex gap-4">
                      <div className="rounded-lg bg-white/70 px-3 py-2 text-center">
                        <div className="text-lg font-bold text-emerald-800">{currentShiftStats.count}</div>
                        <div className="text-[10px] text-emerald-600">Order</div>
                      </div>
                      <div className="rounded-lg bg-white/70 px-3 py-2 text-center">
                        <div className="text-lg font-bold text-emerald-800">RM {currentShiftStats.total.toFixed(2)}</div>
                        <div className="text-[10px] text-emerald-600">Jualan</div>
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => setConfirmClose(true)}
                  className="bg-red-500 hover:bg-red-600 text-white shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1" /> Tutup Shift
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <LogIn className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-semibold text-zinc-700">Tiada shift aktif</span>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Modal Tunai Awal (RM)</label>
                  <button
                    type="button"
                    onClick={() => setKeypadTarget('cashFloat')}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-xl font-bold text-zinc-800 hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
                  >
                    {cashFloat || '0.00'}
                  </button>
                </div>
                <Button onClick={handleOpenShift} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <LogIn className="h-3.5 w-3.5 mr-1" /> Buka Shift
                </Button>
              </div>
            </div>
          )}

          {/* Shift History */}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-semibold text-zinc-700">Sejarah Shift</span>
              {!isAdmin && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">Shift anda sahaja</span>}
              <div className="ml-auto flex items-center gap-1.5">
                <input
                  type="date"
                  value={shiftDateFrom}
                  onChange={(e) => setShiftDateFrom(e.target.value)}
                  className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                <span className="text-xs text-zinc-400">→</span>
                <input
                  type="date"
                  value={shiftDateTo}
                  onChange={(e) => setShiftDateTo(e.target.value)}
                  className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                {(shiftDateFrom || shiftDateTo) && (
                  <button
                    onClick={() => { setShiftDateFrom(''); setShiftDateTo('') }}
                    className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100"
                  >✕</button>
                )}
              </div>
            </div>
            {shifts && shifts.length > 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50">
                      <th className="px-3 py-2.5 text-left font-semibold text-zinc-500">Tarikh</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-zinc-500">Cashier</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-zinc-500">Buka</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-zinc-500">Tutup</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-zinc-500">Jualan</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-zinc-500">Jangkaan Tunai</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-zinc-500">Kiraan Tutup</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-zinc-500">Varians</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-zinc-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.map((s: Shift) => {
                      const sales = shiftSales?.[s.id] ?? { total: 0, cashSales: 0 }
                      const expectedCash = Math.round(s.cashFloat + sales.cashSales)
                      const hasCounting = s.closingCash !== undefined && s.closingCash !== null
                      const variance = hasCounting
                        ? roundToNearest5Sen(s.closingCash!) - expectedCash
                        : null
                      return (
                        <tr key={s.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50">
                          <td className="px-3 py-2.5 text-zinc-700">{format(new Date(s.openedAt), 'dd/MM/yy')}</td>
                          <td className="px-3 py-2.5 font-medium text-zinc-800">{s.openedBy}</td>
                          <td className="px-3 py-2.5 text-zinc-500">{format(new Date(s.openedAt), 'HH:mm')}</td>
                          <td className="px-3 py-2.5 text-zinc-500">{s.closedAt ? format(new Date(s.closedAt), 'HH:mm') : '—'}</td>
                          <td className="px-3 py-2.5 text-right text-zinc-700">
                            {sales.total > 0 ? `RM ${sales.total.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-blue-700">
                            {s.status === 'closed' ? `RM ${expectedCash.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-zinc-700">
                            {hasCounting ? `RM ${s.closingCash!.toFixed(2)}` : <span className="text-zinc-300">Tiada kiraan</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {variance === null ? (
                              <span className="text-zinc-300">—</span>
                            ) : variance === 0 ? (
                              <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">✓ Tepat</span>
                            ) : variance > 0 ? (
                              <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">+RM {variance.toFixed(2)}</span>
                            ) : (
                              <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-600">−RM {Math.abs(variance).toFixed(2)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {s.status === 'open'
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
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-400 rounded-xl border border-zinc-100">
                <Clock className="mb-2 h-8 w-8" />
                <p className="text-sm">Belum ada shift</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Close Modal */}
      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-2 text-sm font-bold text-zinc-900">Tutup Shift?</h3>
            <p className="mb-3 text-xs text-zinc-500">Shift akan ditutup atas nama <strong>{currentStaff?.name}</strong>.</p>
            {currentShiftStats && (
              <div className="mb-3 rounded-lg bg-zinc-50 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-zinc-500">Jumlah Order</span><span className="font-semibold">{currentShiftStats.count}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Jumlah Jualan (Kad/QR)</span><span className="font-semibold text-zinc-700">RM {(currentShiftStats.total - currentShiftStats.cashSales).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Jualan Tunai</span><span className="font-semibold text-zinc-700">RM {currentShiftStats.cashSales.toFixed(2)}</span></div>
                <div className="flex justify-between border-t border-zinc-200 pt-1 mt-1"><span className="text-zinc-500">Jangkaan Tunai dalam Laci</span><span className="font-bold text-blue-700">RM {Math.round((currentShift?.cashFloat ?? 0) + currentShiftStats.cashSales).toFixed(2)}</span></div>
              </div>
            )}
            {/* Closing cash input */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold text-zinc-700">Kiraan Tunai Sebenar (RM)</label>
              <button
                type="button"
                onClick={() => setKeypadTarget('closingCash')}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-xl font-bold text-zinc-800 hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
              >
                {closingCash || '0.00'}
              </button>
              {closingCash !== '' && currentShiftStats && (() => {
                const expected = Math.round((currentShift?.cashFloat ?? 0) + currentShiftStats.cashSales)
                const actual = roundToNearest5Sen(parseFloat(closingCash))
                const variance = actual - expected
                return (
                  <div className={`mt-2 flex justify-between rounded-lg px-3 py-2 text-xs font-semibold ${variance === 0 ? 'bg-emerald-50 text-emerald-700' : variance > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'}`}>
                    <span>Varians</span>
                    <span>{variance >= 0 ? '+' : ''}RM {variance.toFixed(2)}</span>
                  </div>
                )
              })()}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setConfirmClose(false); setClosingCash('') }}>Batal</Button>
              <Button size="sm" className="flex-1 bg-red-500 hover:bg-red-600 text-white" onClick={handleCloseShift}>Tutup Shift</Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Numeric Keypad */}
      {keypadTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/30 p-4"
          onClick={() => setKeypadTarget(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 rounded-xl bg-zinc-50 px-4 py-3 text-center">
              <div className="text-xs text-zinc-400 mb-1">
                {keypadTarget === 'cashFloat' ? 'Modal Tunai Awal (RM)' : 'Kiraan Tunai Sebenar (RM)'}
              </div>
              <div className="text-3xl font-bold text-zinc-800 tracking-tight">
                {(keypadTarget === 'cashFloat' ? cashFloat : closingCash) || '0.00'}
              </div>
              {keypadTarget === 'closingCash' && closingCash !== '' && (() => {
                const raw = parseFloat(closingCash)
                const rounded = roundToNearest5Sen(raw)
                if (Math.abs(rounded - raw) > 0.001) return (
                  <div className="text-[10px] text-zinc-400 mt-0.5">Dibulatkan → RM {rounded.toFixed(2)}</div>
                )
                return null
              })()}
            </div>
            <NumericKeypad
              value={keypadTarget === 'cashFloat' ? cashFloat : closingCash}
              onChange={keypadTarget === 'cashFloat' ? setCashFloat : setClosingCash}
            />
            <button
              type="button"
              className="mt-3 w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
              onClick={() => setKeypadTarget(null)}
            >
              Selesai
            </button>
          </div>
        </div>
      )}

      {/* Staff Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <h3 className="mb-3.5 text-sm font-semibold text-zinc-900">{editing ? 'Edit Staff' : 'Add Staff'}</h3>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">PIN (4 digits) *</label>
                <div className="flex justify-center gap-2 py-1">
                  {[0, 1, 2, 3].map((i) => (
                    <input
                      key={i}
                      ref={(el) => { pinRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={form.pin[i] ?? ''}
                      onChange={(e) => {
                        const digit = e.target.value.replace(/\D/g, '').slice(-1)
                        if (!digit) return
                        const newPin = (form.pin.substring(0, i) + digit + form.pin.substring(i + 1)).slice(0, 4)
                        setForm({ ...form, pin: newPin })
                        if (i < 3) pinRefs.current[i + 1]?.focus()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace') {
                          e.preventDefault()
                          if (form.pin[i]) {
                            setForm({ ...form, pin: form.pin.substring(0, i) + form.pin.substring(i + 1) })
                          } else if (i > 0) {
                            setForm({ ...form, pin: form.pin.substring(0, i - 1) + form.pin.substring(i) })
                            pinRefs.current[i - 1]?.focus()
                          }
                        } else if (e.key === 'ArrowLeft' && i > 0) {
                          pinRefs.current[i - 1]?.focus()
                        } else if (e.key === 'ArrowRight' && i < 3) {
                          pinRefs.current[i + 1]?.focus()
                        }
                      }}
                      onPaste={(e) => {
                        const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
                        if (paste) {
                          setForm({ ...form, pin: paste })
                          pinRefs.current[Math.min(paste.length, 3)]?.focus()
                          e.preventDefault()
                        }
                      }}
                      className={`h-12 w-12 rounded-xl border-2 text-center text-lg font-bold text-zinc-900 outline-none transition-all ${
                        form.pin[i]
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-zinc-200 bg-white text-zinc-300'
                      } focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}
                  className="w-full rounded-lg border border-zinc-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  <option value="admin">Admin</option>
                  <option value="cashier">Cashier</option>
                  <option value="waiter">Waiter</option>
                  <option value="kitchen">Kitchen</option>
                </select>
              </div>
            </div>
            <div className="mt-3.5 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button size="sm" className="flex-1" onClick={handleSave}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
