import { create } from 'zustand'
import type { Order, OrderItem, OrderItemModifier, OrderType } from '@/types'
import { generateId, generateOrderNumber } from '@/lib/utils'
import { db } from '@/db'

interface CartState {
  activeOrder: Order | null
  // Start a new order
  startOrder: (
    type: OrderType,
    staffId: string,
    staffName: string,
    tableId?: string,
    tableNumber?: string
  ) => Order
  // Add item to cart
  addItem: (item: Omit<OrderItem, 'id' | 'status'>) => void
  // Update item quantity
  updateQuantity: (itemId: string, quantity: number) => void
  // Remove item
  removeItem: (itemId: string) => void
  // Add note to item
  setItemNote: (itemId: string, note: string) => void
  // Apply discount (flat amount)
  setDiscount: (discount: number) => void
  // Set order note
  setOrderNote: (note: string) => void
  // Send order to kitchen & save to DB
  sendToKitchen: () => Promise<void>
  // Process payment
  processPayment: (
    method: Order['paymentMethod'],
    amountPaid: number,
    taxRate: number
  ) => Promise<Order>
  // Clear active order
  clearOrder: () => void
  // Load existing order (for editing)
  loadOrder: (order: Order) => void
}

function recalcTotals(order: Order, taxRate: number): Order {
  const subtotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0)
  const tax = parseFloat(((subtotal - order.discount) * (taxRate / 100)).toFixed(2))
  const total = parseFloat((subtotal - order.discount + tax).toFixed(2))
  return { ...order, subtotal, tax, total }
}

export const useCartStore = create<CartState>()((set, get) => ({
  activeOrder: null,

  startOrder: (type, staffId, staffName, tableId, tableNumber) => {
    const order: Order = {
      id: generateId(),
      orderNumber: generateOrderNumber(),
      type,
      tableId,
      tableNumber,
      staffId,
      staffName,
      items: [],
      status: 'open',
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    set({ activeOrder: order })
    return order
  },

  addItem: (item) =>
    set((state) => {
      if (!state.activeOrder) return state
      const newItem: OrderItem = { ...item, id: generateId(), status: 'pending' }
      const items = [...state.activeOrder.items, newItem]
      return { activeOrder: { ...state.activeOrder, items, updatedAt: new Date() } }
    }),

  updateQuantity: (itemId, quantity) =>
    set((state) => {
      if (!state.activeOrder) return state
      const items =
        quantity <= 0
          ? state.activeOrder.items.filter((i) => i.id !== itemId)
          : state.activeOrder.items.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    quantity,
                    totalPrice: (i.price + i.modifiers.reduce((s, m) => s + m.price, 0)) * quantity,
                  }
                : i
            )
      return { activeOrder: { ...state.activeOrder, items, updatedAt: new Date() } }
    }),

  removeItem: (itemId) =>
    set((state) => {
      if (!state.activeOrder) return state
      const items = state.activeOrder.items.filter((i) => i.id !== itemId)
      return { activeOrder: { ...state.activeOrder, items, updatedAt: new Date() } }
    }),

  setItemNote: (itemId, note) =>
    set((state) => {
      if (!state.activeOrder) return state
      const items = state.activeOrder.items.map((i) => (i.id === itemId ? { ...i, note } : i))
      return { activeOrder: { ...state.activeOrder, items } }
    }),

  setDiscount: (discount) =>
    set((state) => {
      if (!state.activeOrder) return state
      return { activeOrder: { ...state.activeOrder, discount, updatedAt: new Date() } }
    }),

  setOrderNote: (note) =>
    set((state) => {
      if (!state.activeOrder) return state
      return { activeOrder: { ...state.activeOrder, note } }
    }),

  sendToKitchen: async () => {
    const order = get().activeOrder
    if (!order) return
    // Mark all pending items as sent
    const updatedItems = order.items.map((item) =>
      item.status === 'pending' ? { ...item, status: 'sent' as const } : item
    )
    const updated: Order = {
      ...order,
      items: updatedItems,
      status: 'sent_to_kitchen',
      updatedAt: new Date(),
    }
    await db.orders.put(updated)
    set({ activeOrder: null })
  },

  processPayment: async (method, amountPaid, taxRate) => {
    const order = get().activeOrder
    if (!order) throw new Error('No active order')
    const recalculated = recalcTotals(order, taxRate)
    const paid: Order = {
      ...recalculated,
      status: 'paid',
      paymentMethod: method,
      amountPaid,
      change: parseFloat((amountPaid - recalculated.total).toFixed(2)),
      paidAt: new Date(),
      updatedAt: new Date(),
    }
    await db.orders.put(paid)
    // Free table if dine-in
    if (paid.tableId) {
      await db.dineTables.update(paid.tableId, { status: 'available' })
    }
    set({ activeOrder: null })
    return paid
  },

  clearOrder: () => set({ activeOrder: null }),

  loadOrder: (order) => set({ activeOrder: order }),
}))
