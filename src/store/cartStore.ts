import { create } from 'zustand'
import type { Order, OrderItem, OrderType } from '@/types'
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
    tableNumber?: string,
    shiftId?: string
  ) => Order
  // Add item to cart
  addItem: (item: Omit<OrderItem, 'id' | 'status'>) => void
  // Update item quantity
  updateQuantity: (itemId: string, quantity: number) => void
  // Remove item
  removeItem: (itemId: string) => void
  // Add note to item
  setItemNote: (itemId: string, note: string) => void
  // Apply discount — flat RM or percentage
  setDiscount: (type: 'flat' | 'percent', value: number) => void
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
  // Transfer active dine-in order to another table
  transferTable: (newTableId: string, newTableNumber: string) => Promise<void>
  // Merge another occupied table's order into the active order
  mergeFrom: (sourceOrderId: string, sourceTableId: string) => Promise<void>
}

function recalcTotals(order: Order, taxRate: number): Order {
  const subtotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0)
  const tax = parseFloat(((subtotal - order.discount) * (taxRate / 100)).toFixed(2))
  const total = parseFloat((subtotal - order.discount + tax).toFixed(2))
  return { ...order, subtotal, tax, total }
}

export const useCartStore = create<CartState>()((set, get) => ({
  activeOrder: null,

  startOrder: (type, staffId, staffName, tableId, tableNumber, shiftId) => {
    const order: Order = {
      id: generateId(),
      orderNumber: generateOrderNumber(),
      type,
      tableId,
      tableNumber,
      staffId,
      staffName,
      shiftId,
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
      // Merge with existing item if same product + same modifier selection
      const itemKey = item.modifiers.map((m) => m.optionId).sort().join(',')
      const existing = state.activeOrder.items.find(
        (i) => i.productId === item.productId &&
          i.modifiers.map((m) => m.optionId).sort().join(',') === itemKey
      )
      if (existing) {
        const items = state.activeOrder.items.map((i) =>
          i.id === existing.id
            ? { ...i, quantity: i.quantity + 1, totalPrice: i.totalPrice + item.totalPrice }
            : i
        )
        return { activeOrder: { ...state.activeOrder, items, updatedAt: new Date() } }
      }
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
      if (items.length === 0) return { activeOrder: null }
      return { activeOrder: { ...state.activeOrder, items, updatedAt: new Date() } }
    }),

  removeItem: (itemId) =>
    set((state) => {
      if (!state.activeOrder) return state
      const items = state.activeOrder.items.filter((i) => i.id !== itemId)
      if (items.length === 0) return { activeOrder: null }
      return { activeOrder: { ...state.activeOrder, items, updatedAt: new Date() } }
    }),

  setItemNote: (itemId, note) =>
    set((state) => {
      if (!state.activeOrder) return state
      const items = state.activeOrder.items.map((i) => (i.id === itemId ? { ...i, note } : i))
      return { activeOrder: { ...state.activeOrder, items } }
    }),

  setDiscount: (type, value) =>
    set((state) => {
      if (!state.activeOrder) return state
      const subtotal = state.activeOrder.items.reduce((sum, item) => sum + item.totalPrice, 0)
      const clampedValue = type === 'percent' ? Math.min(Math.max(value, 0), 100) : Math.max(value, 0)
      const discount =
        type === 'percent'
          ? parseFloat(((clampedValue / 100) * subtotal).toFixed(2))
          : parseFloat(Math.min(clampedValue, subtotal).toFixed(2))
      return {
        activeOrder: {
          ...state.activeOrder,
          discount,
          discountType: type,
          discountValue: clampedValue,
          updatedAt: new Date(),
        },
      }
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

  transferTable: async (newTableId, newTableNumber) => {
    const order = get().activeOrder
    if (!order || order.type !== 'dine_in') return
    const oldTableId = order.tableId
    await db.orders.update(order.id, { tableId: newTableId, tableNumber: newTableNumber, updatedAt: new Date() })
    if (oldTableId) await db.dineTables.update(oldTableId, { status: 'available' })
    await db.dineTables.update(newTableId, { status: 'occupied' })
    set((state) => ({
      activeOrder: state.activeOrder
        ? { ...state.activeOrder, tableId: newTableId, tableNumber: newTableNumber, updatedAt: new Date() }
        : null,
    }))
  },

  mergeFrom: async (sourceOrderId, sourceTableId) => {
    const order = get().activeOrder
    if (!order) return
    const source = await db.orders.get(sourceOrderId)
    if (!source) return
    // Append source items into active order
    const merged = { ...order, items: [...order.items, ...source.items], updatedAt: new Date() }
    await db.orders.put(merged)
    // Void source order and free its table
    await db.orders.update(sourceOrderId, { status: 'voided', voidReason: `Digabung ke Order #${order.orderNumber}`, updatedAt: new Date() })
    await db.dineTables.update(sourceTableId, { status: 'available' })
    set({ activeOrder: merged })
  },
}))
