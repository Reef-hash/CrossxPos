import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import type { Order, OrderItem } from '@/types'
import { ChefHat } from 'lucide-react'

export function KitchenPage() {
  const orders = useLiveQuery(() =>
    db.orders.where('status').equals('sent_to_kitchen').reverse().sortBy('createdAt')
  )

  return (
    <div className="p-5">
      <div className="mb-5 flex items-center gap-2.5">
        <ChefHat className="h-5 w-5 text-orange-500" />
        <div>
          <h1 className="text-base font-bold text-zinc-900">Kitchen Display</h1>
          <p className="text-xs text-zinc-500">{orders?.length ?? 0} pending</p>
        </div>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <ChefHat className="mb-2 h-12 w-12" />
          <p className="text-sm font-medium">No pending orders</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {orders.map((order: Order) => (
            <div
              key={order.id}
              className="rounded-xl border border-orange-200 bg-white p-3.5 shadow-sm"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-zinc-900">#{order.orderNumber}</span>
                  <span className="ml-1.5 text-xs text-zinc-500">
                    {order.type === 'dine_in' ? `Table ${order.tableNumber}` : 'Takeaway'}
                  </span>
                </div>
                <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                  Preparing
                </span>
              </div>

              <div className="space-y-1.5">
                {order.items.map((item: OrderItem) => (
                  <div
                    key={item.id}
                    className="rounded-lg bg-orange-50 px-2.5 py-2 text-xs text-orange-800"
                  >
                    <span className="font-semibold">
                      {item.quantity}&times; {item.productName}
                    </span>
                    {item.modifiers.length > 0 && (
                      <p className="mt-0.5 text-[11px] opacity-75">
                        {item.modifiers.map((m) => m.optionName).join(', ')}
                      </p>
                    )}
                    {item.note && <p className="mt-0.5 text-[11px] opacity-75">Note: {item.note}</p>}
                  </div>
                ))}
              </div>

              {order.note && (
                <p className="mt-2 rounded-lg bg-yellow-50 px-2.5 py-1.5 text-[11px] text-yellow-700">
                  {order.note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

