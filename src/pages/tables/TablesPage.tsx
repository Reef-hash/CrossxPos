import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/db'
import type { Table } from '@/types'
import { generateId } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useLicenseStore } from '@/store/licenseStore'
import { formatLimit } from '@/lib/license'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import { Plus, Users, Trash2 } from 'lucide-react'

export function TablesPage() {
  const [showAdd, setShowAdd] = useState(false)
  const [newTableNum, setNewTableNum] = useState('')
  const [newCapacity, setNewCapacity] = useState('4')
  const [section, setSection] = useState('Indoor')

  const navigate = useNavigate()
  const { currentStaff } = useAuthStore()
  const { startOrder, loadOrder } = useCartStore()
  const isAdmin = currentStaff?.role === 'admin'

  const tables = useLiveQuery(async () => {
    const all = await db.dineTables.toArray()
    return all.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
  })

  const activeTableNums = useLiveQuery(async () => {
    const activeOrders = await db.orders.where('status').anyOf(['open', 'sent_to_kitchen']).toArray()
    return new Set(activeOrders.filter((o) => o.type === 'dine_in' && o.tableNumber).map((o) => o.tableNumber!))
  })

  const handleDeleteTable = async (e: React.MouseEvent, table: Table) => {
    e.stopPropagation()
    if (!confirm(`Delete table ${table.number}?`)) return
    await db.dineTables.delete(table.id)
  }

  /**
   * Tap pada kad meja:
   * - Meja occupied → muat order yang ada ke cart → navigate ke cashier
   * - Meja available → mulakan order Dine In baru → navigate ke cashier
   */
  const handleTableTap = async (table: Table) => {
    if (!currentStaff) return
    const existingOrder = await db.orders
      .where('status')
      .anyOf(['open', 'sent_to_kitchen'])
      .filter((o) => o.type === 'dine_in' && o.tableNumber === table.number)
      .first()
    if (existingOrder) {
      loadOrder(existingOrder)
    } else {
      startOrder('dine_in', currentStaff.id, currentStaff.name, table.id, table.number)
    }
    navigate('/cashier')
  }

  const canAdd = useLicenseStore((s) => s.canAdd)
  const limits = useLicenseStore((s) => s.getLimits)()

  const handleAddTable = async () => {
    if (!newTableNum.trim()) return
    // Semak had meja plan sebelum tambah
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
    setNewTableNum('')
    setNewCapacity('4')
    setShowAdd(false)
  }

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
      </div>

      {/* Tables grid */}
      {tables && tables.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tables.map((table: Table) => {
            const hasOrder = activeTableNums?.has(table.number) ?? false
            const style = hasOrder
              ? 'border-red-200 bg-red-50 hover:border-red-300'
              : 'border-emerald-200 bg-emerald-50 hover:border-emerald-300'
            return (
              <button
                key={table.id}
                onClick={() => handleTableTap(table)}
                className={`relative flex flex-col items-center rounded-xl border p-4 transition active:scale-[0.97] cursor-pointer ${style}`}
              >
                {isAdmin && (
                  <button
                    onClick={(e) => handleDeleteTable(e, table)}
                    className="absolute right-1.5 top-1.5 rounded p-1 text-zinc-300 hover:bg-red-100 hover:text-red-500 transition"
                    title="Delete table"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <div className="mb-1 text-2xl font-bold text-zinc-800">{table.number}</div>
                <div className="mb-1.5 flex items-center gap-1 text-xs text-zinc-500">
                  <Users className="h-3 w-3" />
                  {table.capacity}
                </div>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${hasOrder ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {hasOrder ? 'Occupied' : 'Available'}
                </span>
                {table.section && (
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

      {/* Add Table Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900">Add Table</h3>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Table Number / Name</label>
                <input
                  value={newTableNum}
                  onChange={(e) => setNewTableNum(e.target.value)}
                  placeholder="e.g. T1, A1, VIP"
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Capacity</label>
                <input
                  type="number"
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Section</label>
                <input
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="Indoor / Outdoor / etc."
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" onClick={handleAddTable}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
