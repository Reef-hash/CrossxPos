import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/db'
import type { Table, Reservation } from '@/types'
import { generateId } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useLicenseStore } from '@/store/licenseStore'
import { formatLimit } from '@/lib/license'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import { useShiftStore } from '@/store/shiftStore'
import { Plus, Users, Trash2, CalendarClock, X } from 'lucide-react'

export function TablesPage() {
  // ── Add Table form ──────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false)
  const [newTableNum, setNewTableNum] = useState('')
  const [newCapacity, setNewCapacity] = useState('4')
  const [section, setSection] = useState('Indoor')

  // ── Reservation form ────────────────────────────────────────────────────
  const [reserveTarget, setReserveTarget] = useState<Table | null>(null)
  const [resName, setResName] = useState('')
  const [resPhone, setResPhone] = useState('')
  const [resDatetime, setResDatetime] = useState('')
  const [resPax, setResPax] = useState('2')
  const [resNotes, setResNotes] = useState('')

  // ── Reservation detail modal ────────────────────────────────────────────
  const [resvDetail, setResvDetail] = useState<Reservation | null>(null)

  const navigate = useNavigate()
  const { currentStaff } = useAuthStore()
  const { startOrder, loadOrder } = useCartStore()
  const { currentShift } = useShiftStore()
  const isAdmin = currentStaff?.role === 'admin'

  const tables = useLiveQuery(async () => {
    const all = await db.dineTables.toArray()
    return all.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
  })

  const activeTableNums = useLiveQuery(async () => {
    const activeOrders = await db.orders.where('status').anyOf(['open', 'sent_to_kitchen']).toArray()
    return new Set(activeOrders.filter((o) => o.type === 'dine_in' && o.tableNumber).map((o) => o.tableNumber!))
  })

  // Map: tableId → pending Reservation
  const reservationMap = useLiveQuery(async () => {
    const all = await db.reservations.where('status').equals('pending').toArray()
    const map = new Map<string, Reservation>()
    all.forEach((r) => map.set(r.tableId, r))
    return map
  })

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleDeleteTable = async (e: React.MouseEvent, table: Table) => {
    e.stopPropagation()
    if (!confirm(`Delete table ${table.number}?`)) return
    // Cancel any pending reservation
    const res = reservationMap?.get(table.id)
    if (res) await db.reservations.update(res.id, { status: 'cancelled' })
    await db.dineTables.delete(table.id)
  }

  const handleTableTap = async (table: Table) => {
    if (!currentStaff) return
    // Reserved → show detail
    const res = reservationMap?.get(table.id)
    if (res) { setResvDetail(res); return }
    // Occupied → load existing order
    const existingOrder = await db.orders
      .where('status').anyOf(['open', 'sent_to_kitchen'])
      .filter((o) => o.type === 'dine_in' && o.tableNumber === table.number)
      .first()
    if (existingOrder) {
      loadOrder(existingOrder)
    } else {
      startOrder('dine_in', currentStaff.id, currentStaff.name, table.id, table.number, currentShift?.id)
    }
    navigate('/cashier')
  }

  const handleOpenReserve = (e: React.MouseEvent, table: Table) => {
    e.stopPropagation()
    setReserveTarget(table)
    // pre-fill datetime to next hour
    const next = new Date(); next.setHours(next.getHours() + 1, 0, 0, 0)
    setResDatetime(next.toISOString().slice(0, 16))
    setResName(''); setResPhone(''); setResPax('2'); setResNotes('')
  }

  const handleSaveReservation = async () => {
    if (!reserveTarget || !resName.trim() || !resDatetime) return
    await db.reservations.add({
      id: generateId(),
      tableId: reserveTarget.id,
      tableNumber: reserveTarget.number,
      customerName: resName.trim(),
      phone: resPhone.trim() || undefined,
      datetime: resDatetime,
      pax: parseInt(resPax) || 2,
      notes: resNotes.trim() || undefined,
      status: 'pending',
      createdAt: new Date(),
    })
    await db.dineTables.update(reserveTarget.id, { status: 'reserved' })
    setReserveTarget(null)
  }

  const handleSeatCustomer = async (res: Reservation) => {
    if (!currentStaff) return
    await db.reservations.update(res.id, { status: 'seated' })
    await db.dineTables.update(res.tableId, { status: 'occupied' })
    startOrder('dine_in', currentStaff.id, currentStaff.name, res.tableId, res.tableNumber, currentShift?.id)
    setResvDetail(null)
    navigate('/cashier')
  }

  const handleCancelReservation = async (res: Reservation) => {
    await db.reservations.update(res.id, { status: 'cancelled' })
    await db.dineTables.update(res.tableId, { status: 'available' })
    setResvDetail(null)
  }

  const canAdd = useLicenseStore((s) => s.canAdd)
  const limits = useLicenseStore((s) => s.getLimits)()

  const handleAddTable = async () => {
    if (!newTableNum.trim()) return
    if (!canAdd('tables', tables?.length ?? 0)) {
      alert(`Had plan anda: ${formatLimit(limits.maxTables)} meja. Naik taraf ke Pro untuk meja tanpa had.`)
      return
    }
    await db.dineTables.add({
      id: generateId(),
      number: newTableNum.trim(),
      capacity: parseInt(newCapacity) || 4,
      status: 'available',
      section: section || undefined,
    })
    setNewTableNum(''); setNewCapacity('4'); setShowAdd(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-zinc-900">Table Management</h1>
          <p className="text-xs text-zinc-500">{tables?.length ?? 0} tables</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAdd(true)}
          disabled={!canAdd('tables', tables?.length ?? 0)}
          title={!canAdd('tables', tables?.length ?? 0) ? `Had plan: ${formatLimit(limits.maxTables)} meja` : undefined}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Table {limits.maxTables !== -1 && <span className="ml-1 opacity-60">({tables?.length ?? 0}/{limits.maxTables})</span>}
        </Button>
      </div>

      {/* Legend */}
      <div className="mb-3 flex gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Occupied</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Available</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" />Reserved</span>
      </div>

      {/* Tables grid */}
      {tables && tables.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tables.map((table: Table) => {
            const hasOrder = activeTableNums?.has(table.number) ?? false
            const reservation = reservationMap?.get(table.id)
            const isReserved = !!reservation && !hasOrder

            const cardStyle = hasOrder
              ? 'border-red-200 bg-red-50 hover:border-red-300'
              : isReserved
              ? 'border-violet-200 bg-violet-50 hover:border-violet-300'
              : 'border-emerald-200 bg-emerald-50 hover:border-emerald-300'

            return (
              <button
                key={table.id}
                onClick={() => handleTableTap(table)}
                className={`relative flex flex-col items-center rounded-xl border p-4 transition active:scale-[0.97] cursor-pointer ${cardStyle}`}
              >
                {/* Delete button (admin) */}
                {isAdmin && (
                  <button
                    onClick={(e) => handleDeleteTable(e, table)}
                    className="absolute right-1.5 top-1.5 rounded p-1 text-zinc-300 hover:bg-red-100 hover:text-red-500 transition"
                    title="Delete table"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Reserve button — only on available tables */}
                {!hasOrder && !isReserved && (
                  <button
                    onClick={(e) => handleOpenReserve(e, table)}
                    className="absolute left-1.5 top-1.5 rounded p-1 text-zinc-300 hover:bg-violet-100 hover:text-violet-500 transition"
                    title="Tempah meja"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                  </button>
                )}

                <div className="mb-1 text-2xl font-bold text-zinc-800">{table.number}</div>
                <div className="mb-1.5 flex items-center gap-1 text-xs text-zinc-500">
                  <Users className="h-3 w-3" />
                  {table.capacity}
                </div>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                  hasOrder ? 'bg-red-100 text-red-700'
                  : isReserved ? 'bg-violet-100 text-violet-700'
                  : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {hasOrder ? 'Occupied' : isReserved ? 'Reserved' : 'Available'}
                </span>

                {/* Reservation name + time */}
                {isReserved && reservation && (
                  <div className="mt-1.5 text-center">
                    <div className="text-[11px] font-semibold text-violet-700 truncate max-w-[90px]">{reservation.customerName}</div>
                    <div className="text-[10px] text-violet-500">
                      {new Date(reservation.datetime).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{reservation.pax} pax
                    </div>
                  </div>
                )}

                {table.section && !isReserved && (
                  <span className="mt-1 text-[11px] text-zinc-400">{table.section}</span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <Users className="mb-2 h-12 w-12" />
          <p className="text-sm font-medium">No tables yet</p>
          <p className="mt-0.5 text-xs">Add your first table to get started</p>
        </div>
      )}

      {/* ── Add Table Modal ─────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900">Add Table</h3>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Table Number / Name</label>
                <input value={newTableNum} onChange={(e) => setNewTableNum(e.target.value)} placeholder="e.g. T1, A1, VIP"
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Capacity</label>
                <input type="number" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Section</label>
                <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Indoor / Outdoor / etc."
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="flex-1" onClick={handleAddTable}>Add</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reserve Table Modal ─────────────────────────────────────────────── */}
      {reserveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900">Tempah Meja {reserveTarget.number}</h3>
              <button onClick={() => setReserveTarget(null)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Nama Customer <span className="text-red-400">*</span></label>
                <input value={resName} onChange={(e) => setResName(e.target.value)} placeholder="cth: Ahmad"
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">No. Telefon</label>
                <input value={resPhone} onChange={(e) => setResPhone(e.target.value)} placeholder="cth: 0123456789" type="tel"
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Tarikh & Masa <span className="text-red-400">*</span></label>
                  <input type="datetime-local" value={resDatetime} onChange={(e) => setResDatetime(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400" />
                </div>
                <div className="w-20">
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Pax</label>
                  <input type="number" min="1" value={resPax} onChange={(e) => setResPax(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Nota</label>
                <input value={resNotes} onChange={(e) => setResNotes(e.target.value)} placeholder="cth: kerusi khas, alahan makanan..."
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setReserveTarget(null)}>Batal</Button>
              <Button size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700" onClick={handleSaveReservation} disabled={!resName.trim() || !resDatetime}>
                Simpan Tempahan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reservation Detail Modal ────────────────────────────────────────── */}
      {resvDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900">Tempahan — Meja {resvDetail.tableNumber}</h3>
              <button onClick={() => setResvDetail(null)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="mb-4 space-y-2 rounded-xl bg-violet-50 p-3">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Nama</span>
                <span className="font-semibold text-zinc-800">{resvDetail.customerName}</span>
              </div>
              {resvDetail.phone && (
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Telefon</span>
                  <span className="font-semibold text-zinc-800">{resvDetail.phone}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Masa</span>
                <span className="font-semibold text-zinc-800">
                  {new Date(resvDetail.datetime).toLocaleString('ms-MY', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Pax</span>
                <span className="font-semibold text-zinc-800">{resvDetail.pax} orang</span>
              </div>
              {resvDetail.notes && (
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Nota</span>
                  <span className="font-semibold text-zinc-800 text-right max-w-[160px]">{resvDetail.notes}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCancelReservation(resvDetail)}
                className="flex-1 rounded-lg border border-zinc-200 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                Batal Tempahan
              </button>
              <button
                onClick={() => handleSeatCustomer(resvDetail)}
                className="flex-1 rounded-lg bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-700"
              >
                Dudukkan Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
