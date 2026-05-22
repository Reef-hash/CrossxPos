import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '@/db'
import type { Staff, StaffRole } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { generateId } from '@/lib/utils'
import { useLicenseStore } from '@/store/licenseStore'
import { formatLimit } from '@/lib/license'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'

const roleColors: Record<StaffRole, 'default' | 'success' | 'warning' | 'secondary'> = {
  admin: 'default',
  cashier: 'success',
  waiter: 'warning',
  kitchen: 'secondary',
}

export function StaffPage() {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [form, setForm] = useState({ name: '', pin: '', role: 'waiter' as StaffRole })

  const staff = useLiveQuery(async () => {
    const all = await db.staff.toArray()
    return all.sort((a, b) => a.name.localeCompare(b.name))
  })

  const canAdd = useLicenseStore((s) => s.canAdd)
  const limits = useLicenseStore((s) => s.getLimits)()

  const handleSave = async () => {
    if (!form.name.trim() || form.pin.length !== 4) return
    // Semak had staff plan sebelum tambah rekod baru
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
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-zinc-900">Staff</h1>
          <p className="text-xs text-zinc-500">{staff?.length ?? 0} members</p>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditing(null); setForm({ name: '', pin: '', role: 'waiter' }); setShowModal(true) }}
          disabled={!canAdd('staff', staff?.length ?? 0)}
          title={!canAdd('staff', staff?.length ?? 0) ? `Had plan: ${formatLimit(limits.maxStaff)} staff` : undefined}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Staff {limits.maxStaff !== -1 && <span className="ml-1 opacity-60">({staff?.length ?? 0}/{limits.maxStaff})</span>}
        </Button>
      </div>

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
                <Input
                  type="password"
                  maxLength={4}
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="4-digit PIN"
                />
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
