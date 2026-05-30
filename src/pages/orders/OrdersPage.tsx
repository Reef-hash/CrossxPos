import { useLiveQuery } from 'dexie-react-hooks'
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/db'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import type { Order, OrderItem } from '@/types'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { ClipboardList, Plus, CreditCard, XCircle } from 'lucide-react'

export function OrdersPage() {
  const [tab, setTab] = useState<'takeaway' | 'dine_in'>('takeaway')
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidLoading, setVoidLoading] = useState(false)
  const touchStartX = useRef(0)
  const navigate = useNavigate()
  const { loadOrder } = useCartStore()
  const { currentStaff } = useAuthStore()
  const canVoid = currentStaff?.role === 'admin' || currentStaff?.role === 'cashier'

  const activeOrders = useLiveQuery(() =>
    db.orders.where('status').anyOf(['open', 'sent_to_kitchen']).reverse().sortBy('createdAt')
  )

  const takeawayOrders = activeOrders?.filter((o) => o.type === 'takeaway') ?? []
  const dineInOrders = activeOrders?.filter((o) => o.type === 'dine_in') ?? []
  const displayed = tab === 'takeaway' ? takeawayOrders : dineInOrders

  const handleAddOrder = (order: Order) => {
    loadOrder(order)
    navigate('/cashier')
  }

  const handleCheckout = (order: Order) => {
    loadOrder(order)
    navigate('/cashier')
  }

  const handleVoid = async () => {
    if (!voidTargetId) return
    setVoidLoading(true)
    try {
      const order = await db.orders.get(voidTargetId)
      if (order) {
        await db.orders.update(voidTargetId, {
          status: 'voided',
          voidReason: voidReason.trim() || 'Tiada sebab diberikan',
          updatedAt: new Date(),
        })
        // Bebaskan meja jika dine-in
        if (order.tableId) {
          await db.dineTables.update(order.tableId, { status: 'available' })
        }
      }
    } finally {
      setVoidLoading(false)
      setVoidTargetId(null)
      setVoidReason('')
    }
  }

  return (
    <div className="flex h-full flex-col p-5">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ClipboardList className="h-5 w-5 text-blue-600" />
          <div>
            <h1 className="text-base font-bold text-zinc-900">Orders</h1>
            <p className="text-xs text-zinc-500">{activeOrders?.length ?? 0} active</p>
          </div>
        </div>
      </div>

      {/* Tabs — centered segmented control */}
      <div className="mb-5 flex justify-center">
        <div className="flex w-full max-w-sm rounded-xl bg-zinc-100 p-1">
          <button
            onClick={() => setTab('takeaway')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-all ${
              tab === 'takeaway' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 active:bg-zinc-200'
            }`}
          >
            Take Away
            {takeawayOrders.length > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                tab === 'takeaway' ? 'bg-blue-600 text-white' : 'bg-zinc-300 text-zinc-600'
              }`}>
                {takeawayOrders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('dine_in')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-all ${
              tab === 'dine_in' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 active:bg-zinc-200'
            }`}
          >
            Dine In
            {dineInOrders.length > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                tab === 'dine_in' ? 'bg-blue-600 text-white' : 'bg-zinc-300 text-zinc-600'
              }`}>
                {dineInOrders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Orders grid — swipeable */}
      <div
        className="flex-1 overflow-y-auto"
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          const diff = touchStartX.current - e.changedTouches[0].clientX
          if (Math.abs(diff) > 50) setTab(diff > 0 ? 'dine_in' : 'takeaway')
        }}
      >
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <ClipboardList className="mb-2 h-12 w-12" />
          <p className="text-sm font-medium">
            No active {tab === 'takeaway' ? 'takeaway' : 'dine-in'} orders
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayed.map((order: Order) => {
            const itemTotal = order.items.reduce((s, i) => s + i.totalPrice, 0)
            return (
              <div key={order.id} className="flex flex-col rounded-xl border border-blue-200/80 bg-white p-3.5 shadow-sm">
                {/* Header */}
                <div className="mb-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-zinc-900">#{order.orderNumber}</span>
                    {order.type === 'dine_in' && order.tableNumber && (
                      <span className="ml-1.5 text-xs font-medium text-zinc-500">Table {order.tableNumber}</span>
                    )}
                  </div>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${order.status === 'sent_to_kitchen' ? 'bg-orange-100 text-orange-700' : 'bg-zinc-100 text-zinc-600'}`}>
                    {order.status === 'sent_to_kitchen' ? 'In Kitchen' : 'Open'}
                  </span>
                </div>

                {/* Items */}
                <div className="mb-2.5 flex-1 space-y-1">
                  {order.items.map((item: OrderItem) => (
                    <div key={item.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-zinc-600">{item.quantity}× {item.productName}</span>
                      <span className="shrink-0 font-medium text-zinc-900">{formatCurrency(item.totalPrice)}</span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="mb-2.5 flex justify-between border-t border-zinc-100 pt-2 text-xs font-bold">
                  <span className="text-zinc-600">Total</span>
                  <span className="text-blue-600">{formatCurrency(order.total || itemTotal)}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleAddOrder(order)}>
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                  <Button size="sm" className="flex-1" onClick={() => handleCheckout(order)}>
                    <CreditCard className="h-3 w-3" />
                    Checkout
                  </Button>
                  {canVoid && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() => { setVoidTargetId(order.id); setVoidReason('') }}
                      title="Void order"
                    >
                      <XCircle className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>

      {/* Void Confirmation Modal */}
      {voidTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <div className="mb-3 flex items-center gap-2.5">
              <XCircle className="h-5 w-5 shrink-0 text-red-500" />
              <h3 className="text-sm font-semibold text-zinc-900">Void Order</h3>
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              Tindakan ini tidak boleh dibatalkan. Nyatakan sebab void:
            </p>
            <input
              autoFocus
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Contoh: Pelanggan batalkan, salah order..."
              className="w-full rounded-lg border border-zinc-200 p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
            />
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => { setVoidTargetId(null); setVoidReason('') }}
                disabled={voidLoading}
              >
                Batal
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={handleVoid}
                disabled={voidLoading}
              >
                {voidLoading ? 'Memproses...' : 'Void Order'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
