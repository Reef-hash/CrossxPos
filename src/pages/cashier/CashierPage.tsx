import { useLiveQuery } from 'dexie-react-hooks'
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { useCartStore } from '@/store/cartStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useShiftStore } from '@/store/shiftStore'
import { useLicenseStore } from '@/store/licenseStore'
import type { Product, Category, Table, OrderItem, ModifierGroup, ModifierOption, OrderItemModifier } from '@/types'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, Minus, Trash2, Send, CreditCard, ShoppingCart, X, Banknote, Waves, Scissors, Lock, ArrowLeftRight, Merge } from 'lucide-react'
import { printReceipt, printKitchenTicket } from '@/lib/printer'

export function CashierPage() {
  const { currentStaff } = useAuthStore()
  const { currentShift } = useShiftStore()
  const { settings } = useSettingsStore()
  const { activeOrder, startOrder, addItem, updateQuantity, removeItem, sendToKitchen, processPayment, setDiscount, transferTable, mergeFrom } =
    useCartStore()

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [amountPaid, setAmountPaid] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'qr'>('cash')
  const [splitMode, setSplitMode] = useState(false)
  const [splitCount, setSplitCount] = useState(2)
  const [discountRaw, setDiscountRaw] = useState('')
  const [numpadTarget, setNumpadTarget] = useState<'received' | 'discount'>('received')
  const [transferOpen, setTransferOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const features = useLicenseStore((s) => s.getFeatures)()

  // Modifier selection
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({})

  // Order type selection (only when no active order)
  const [orderType, setOrderType] = useState<'takeaway' | 'dine_in'>('takeaway')
  const [tableNum, setTableNum] = useState('')
  const navigate = useNavigate()

  const dineTables = useLiveQuery(() =>
    db.dineTables.toArray().then((ts) =>
      ts.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    )
  )

  const occupiedTableNumbers = useLiveQuery(async () => {
    const activeOrders = await db.orders.where('status').anyOf(['open', 'sent_to_kitchen']).toArray()
    return new Set(activeOrders.filter((o) => o.type === 'dine_in' && o.tableNumber).map((o) => o.tableNumber!))
  })

  // Sync type/table display when an order is loaded from Order Page
  useEffect(() => {
    if (activeOrder) {
      setOrderType(activeOrder.type)
      setTableNum(activeOrder.tableNumber || '')
    } else {
      setOrderType('takeaway')
      setTableNum('')
    }
  }, [activeOrder?.id])

  // Sync discount raw string when order changes
  useEffect(() => {
    const v = activeOrder?.discountValue ?? 0
    setDiscountRaw(v > 0 ? String(v) : '')
  }, [activeOrder?.id])

  const categories = useLiveQuery(() =>
    db.categories.toArray().then((cats) => cats.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder))
  )

  // For handleProductTap: know which categories have modifier groups (sync check)
  const categoryModifierMap = useLiveQuery(async () => {
    const cats = await db.categories.toArray()
    const map = new Map<string, string[]>()
    cats.forEach((c) => { if (c.modifierGroupIds?.length) map.set(c.id, c.modifierGroupIds) })
    return map
  })

  const pendingGroups = useLiveQuery(async () => {
    if (!pendingProduct) return []
    const cat = pendingProduct.categoryId ? await db.categories.get(pendingProduct.categoryId) : null
    const ids = [...new Set([...(pendingProduct.modifierGroupIds ?? []), ...(cat?.modifierGroupIds ?? [])])]
    if (!ids.length) return []
    return db.modifierGroups.where('id').anyOf(ids).toArray()
  }, [pendingProduct?.id])

  const pendingAllOptions = useLiveQuery(async () => {
    if (!pendingProduct) return []
    const cat = pendingProduct.categoryId ? await db.categories.get(pendingProduct.categoryId) : null
    const ids = [...new Set([...(pendingProduct.modifierGroupIds ?? []), ...(cat?.modifierGroupIds ?? [])])]
    if (!ids.length) return []
    return db.modifierOptions.where('groupId').anyOf(ids).toArray()
  }, [pendingProduct?.id])

  const products = useLiveQuery(
    () =>
      activeCategoryId
        ? db.products.where('categoryId').equals(activeCategoryId).filter((p) => p.isActive).sortBy('sortOrder')
        : db.products.filter((p) => p.isActive).sortBy('sortOrder'),
    [activeCategoryId]
  )

  const handleProductTap = (product: Product) => {
    if (!currentStaff) return
    if (!activeOrder) {
      startOrder(
        orderType,
        currentStaff.id,
        currentStaff.name,
        undefined,
        orderType === 'dine_in' ? tableNum || undefined : undefined,
        currentShift?.id
      )
    }
    const catModifierIds = categoryModifierMap?.get(product.categoryId) ?? []
    const allModifierIds = [...new Set([...(product.modifierGroupIds ?? []), ...catModifierIds])]
    if (allModifierIds.length > 0) {
      setPendingProduct(product)
      setSelectedOptions({})
    } else {
      const cat = categories?.find((c) => c.id === product.categoryId)
      addItem({ productId: product.id, productName: product.name, productImage: product.image, price: product.price, quantity: 1, modifiers: [], totalPrice: product.price, kitchenStation: cat?.kitchenStation })
    }
  }

  const toggleOption = (group: ModifierGroup, optionId: string) => {
    const cur = selectedOptions[group.id] || []
    if (group.type === 'single') {
      setSelectedOptions({ ...selectedOptions, [group.id]: [optionId] })
    } else {
      setSelectedOptions({
        ...selectedOptions,
        [group.id]: cur.includes(optionId) ? cur.filter((id) => id !== optionId) : [...cur, optionId],
      })
    }
  }

  const handleConfirmModifiers = () => {
    if (!pendingProduct) return
    const modifiers: OrderItemModifier[] = []
    let extraPrice = 0
    for (const [groupId, optionIds] of Object.entries(selectedOptions)) {
      const group = pendingGroups?.find((g) => g.id === groupId)
      for (const optionId of optionIds) {
        const opt = pendingAllOptions?.find((o) => o.id === optionId)
        if (group && opt) {
          modifiers.push({ modifierGroupId: group.id, modifierGroupName: group.name, optionId: opt.id, optionName: opt.name, price: opt.price })
          extraPrice += opt.price
        }
      }
    }
    const cat = categories?.find((c) => c.id === pendingProduct.categoryId)
    addItem({ productId: pendingProduct.id, productName: pendingProduct.name, productImage: pendingProduct.image, price: pendingProduct.price, quantity: 1, modifiers, totalPrice: pendingProduct.price + extraPrice, kitchenStation: cat?.kitchenStation })
    setPendingProduct(null)
    setSelectedOptions({})
  }

  const canConfirmModifiers = pendingGroups?.every((g) => !g.required || (selectedOptions[g.id]?.length ?? 0) > 0) ?? false

  const modifierExtraPrice = Object.entries(selectedOptions).reduce((total, [, optIds]) =>
    total + optIds.reduce((sum, optId) => sum + (pendingAllOptions?.find((o) => o.id === optId)?.price ?? 0), 0), 0
  )

  const handleKOT = async () => {
    const orderSnapshot = activeOrder
    await sendToKitchen()
    navigate('/orders')
    if (settings.kitchenPrinter.enabled && orderSnapshot) {
      printKitchenTicket(orderSnapshot)
    }
  }

  const handlePayment = async (method: 'cash' | 'card' | 'qr') => {
    const paid = method === 'cash' ? (parseFloat(amountPaid) || total) : total
    const paidOrder = await processPayment(method, paid, settings.taxRate)
    setPaymentOpen(false)
    setAmountPaid('')
    setPaymentMethod('cash')
    printReceipt(paidOrder, settings)
  }

  const handleNumpad = (val: string) => {
    if (numpadTarget === 'discount') {
      const discountType = activeOrder?.discountType ?? 'flat'
      if (val === '⌫') {
        const newRaw = discountRaw.slice(0, -1)
        setDiscountRaw(newRaw)
        setDiscount(discountType, parseFloat(newRaw) || 0)
        return
      }
      if (val === '.') {
        if (discountRaw.includes('.')) return
        setDiscountRaw(discountRaw === '' ? '0.' : discountRaw + '.')
        return
      }
      if (discountRaw.includes('.')) {
        const [, dec] = discountRaw.split('.')
        if (dec.length >= 2) return
      }
      const newRaw = discountRaw === '0' ? val : discountRaw + val
      setDiscountRaw(newRaw)
      setDiscount(discountType, parseFloat(newRaw) || 0)
      return
    }
    // received mode
    if (val === '⌫') {
      setAmountPaid((p) => p.slice(0, -1))
      return
    }
    if (val === '.') {
      if (amountPaid.includes('.')) return
      setAmountPaid((p) => (p === '' ? '0.' : p + '.'))
      return
    }
    if (amountPaid.includes('.')) {
      const [, dec] = amountPaid.split('.')
      if (dec.length >= 2) return
    }
    setAmountPaid((p) => (p === '0' ? val : p + val))
  }

  const subtotal = activeOrder?.items.reduce((s, i) => s + i.totalPrice, 0) ?? 0
  const tax = subtotal * (settings.taxRate / 100)
  const total = subtotal + tax - (activeOrder?.discount ?? 0)

  const quickAmounts = useMemo(() => {
    const result: number[] = [total]
    const r10 = Math.ceil(total / 10) * 10
    if (r10 !== total) result.push(r10)
    const r50 = Math.ceil(total / 50) * 50
    if (r50 !== r10 && r50 !== total) result.push(r50)
    const r100 = Math.ceil(total / 100) * 100
    if (!result.includes(r100)) result.push(r100)
    return result.slice(0, 4)
  }, [total])

  const cardColors = [
    'bg-orange-100 text-orange-600',
    'bg-blue-100 text-blue-600',
    'bg-emerald-100 text-emerald-600',
    'bg-purple-100 text-purple-600',
    'bg-rose-100 text-rose-600',
    'bg-amber-100 text-amber-600',
    'bg-pink-100 text-pink-600',
    'bg-teal-100 text-teal-600',
  ]
  const getColor = (str: string) => cardColors[str.charCodeAt(0) % cardColors.length]

  return (
    <>
    <div className="relative flex h-full flex-col bg-gray-50">
      {/* Shift lock overlay */}
      {!currentShift && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-zinc-900/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-10 py-8 shadow-2xl text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <Lock className="h-7 w-7 text-amber-500" />
            </div>
            <h2 className="text-base font-bold text-zinc-900">Shift Belum Dibuka</h2>
            <p className="text-sm text-zinc-500">Sila buka shift dahulu sebelum<br />memproses sebarang jualan.</p>
            <button
              onClick={() => navigate('/staff')}
              className="mt-1 rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition"
            >
              Pergi ke Halaman Staff
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
      {/* Left — Menu */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Category tabs */}
        <div
          className="flex gap-1.5 overflow-x-auto border-b border-zinc-200/80 bg-white px-4 py-2.5"
          onWheel={(e) => { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY }}
        >
          <button
            onClick={() => setActiveCategoryId(null)}
            className={`flex-none w-[calc(25%_-_4.5px)] rounded-lg px-2 py-2 text-center text-xs font-semibold truncate transition ${
              activeCategoryId === null
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'
            }`}
          >
            All
          </button>
          {categories?.map((cat: Category) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              className={`flex-none w-[calc(25%_-_4.5px)] rounded-lg px-2 py-2 text-center text-xs font-semibold truncate transition ${
                activeCategoryId === cat.id
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
          {products?.map((product: Product) => {
            const color = getColor(product.name)
            return (
              <button
                key={product.id}
                onClick={() => handleProductTap(product)}
                className="flex flex-col overflow-hidden rounded-xl bg-white text-left border border-zinc-200/80 shadow-sm transition hover:shadow-md hover:border-zinc-300 active:scale-[0.98]"
              >
                {/* Image / Placeholder */}
                <div className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden ${color.split(' ')[0]}`}>
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className={`text-3xl font-black uppercase ${color.split(' ')[1]}`}>
                      {product.name.charAt(0)}
                    </span>
                  )}
                </div>
                {/* Info */}
                <div className="p-2.5">
                  <p className="line-clamp-2 text-xs font-semibold text-zinc-900 leading-tight">{product.name}</p>
                  <p className="mt-0.5 text-sm font-bold text-blue-600">{formatCurrency(product.price)}</p>
                </div>
              </button>
            )
          })}
          {products?.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-zinc-400">
              <ShoppingCart className="mb-2 h-10 w-10" />
              <p className="text-sm">No products in this category</p>
            </div>
          )}
        </div>
      </div>

      {/* Right — Cart */}
      <div className="flex w-72 flex-col bg-white border-l border-zinc-200/80 xl:w-80">
        {/* Cart header */}
        <div className="border-b border-zinc-100 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900">Order</h2>
            {activeOrder && (
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                #{activeOrder.orderNumber}
              </span>
            )}
          </div>

          {activeOrder ? (
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs font-medium text-zinc-500">
                {activeOrder.type === 'dine_in' ? `Dine In · Table ${activeOrder.tableNumber}` : 'Take Away'}
              </p>
              {activeOrder.type === 'dine_in' && (
                <button
                  onClick={() => setTransferOpen(true)}
                  className="flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 hover:bg-blue-50 hover:text-blue-600 transition"
                  title="Pindah ke meja lain"
                >
                  <ArrowLeftRight className="h-2.5 w-2.5" />
                  Pindah
                </button>
              )}
              {activeOrder.type === 'dine_in' && (
                <button
                  onClick={() => setMergeOpen(true)}
                  className="flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 hover:bg-amber-50 hover:text-amber-600 transition"
                  title="Gabung dengan meja lain"
                >
                  <Merge className="h-2.5 w-2.5" />
                  Gabung
                </button>
              )}
            </div>
          ) : (
            <div className="mt-2.5 space-y-2">
              <div className="flex rounded-lg bg-zinc-100 p-0.5">
                <button
                  onClick={() => setOrderType('takeaway')}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${orderType === 'takeaway' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  Take Away
                </button>
                <button
                  onClick={() => setOrderType('dine_in')}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${orderType === 'dine_in' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  Dine In
                </button>
              </div>
              {orderType === 'dine_in' && (
                <select
                  value={tableNum}
                  onChange={(e) => setTableNum(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  <option value="">— Select Table —</option>
                  {dineTables?.map((t: Table) => (
                    <option key={t.id} value={t.number}>Table {t.number}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-3">
          {!activeOrder || activeOrder.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-zinc-300">
              <ShoppingCart className="mb-2 h-10 w-10" />
              <p className="text-xs font-medium text-zinc-400">Cart is empty</p>
              <p className="text-[11px] text-zinc-300">Tap a product to add</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {activeOrder.items.map((item: OrderItem) => {
                const color = getColor(item.productName)
                return (
                  <div key={item.id} className="flex items-start gap-2.5">
                    {/* Thumbnail */}
                    {item.productImage ? (
                      <img src={item.productImage} alt={item.productName} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black uppercase ${color}`}>
                        {item.productName.charAt(0)}
                      </div>
                    )}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-900">{item.productName}</p>
                      {item.modifiers.length > 0 && (
                        <p className="truncate text-[11px] text-zinc-400">{item.modifiers.map((m) => m.optionName).join(', ')}</p>
                      )}
                      <p className="text-xs font-bold text-blue-600">{formatCurrency(item.totalPrice)}</p>
                    </div>
                    {/* Qty + Delete */}
                    <div className="flex flex-col items-end gap-1">
                      <button onClick={() => removeItem(item.id)} className="text-zinc-300 hover:text-red-500 transition">
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="flex h-5 w-5 items-center justify-center rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition"
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <span className="w-4 text-center text-xs font-bold text-zinc-900">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800 text-white hover:bg-zinc-700 transition"
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Totals + Buttons */}
        {activeOrder && activeOrder.items.length > 0 && (
          <div className="border-t border-zinc-100 p-4">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-500">
                <span>Subtotal</span>
                <span className="font-medium text-zinc-700">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Tax ({settings.taxRate}%)</span>
                <span className="font-medium text-zinc-700">{formatCurrency(tax)}</span>
              </div>
              {/* Discount input — admin & cashier only */}
              {(currentStaff?.role === 'admin' || currentStaff?.role === 'cashier') && (() => {
                const discountType = activeOrder?.discountType ?? 'flat'
                const discountInputValue = activeOrder?.discountValue ?? 0
                return (
                  <div className="flex items-center justify-between text-zinc-500">
                    <div className="flex items-center gap-1.5">
                      <span>Discount</span>
                      <div className="flex overflow-hidden rounded-md border border-zinc-200 text-xs font-bold">
                        <button
                          onClick={() => { setDiscount('flat', discountInputValue); setDiscountRaw(discountInputValue > 0 ? String(discountInputValue) : '') }}
                          className={`px-2 py-1 transition ${discountType === 'flat' ? 'bg-zinc-800 text-white' : 'bg-white text-zinc-400 hover:bg-zinc-100'}`}
                        >RM</button>
                        <button
                          onClick={() => { setDiscount('percent', discountInputValue); setDiscountRaw(discountInputValue > 0 ? String(discountInputValue) : '') }}
                          className={`px-2 py-1 transition ${discountType === 'percent' ? 'bg-zinc-800 text-white' : 'bg-white text-zinc-400 hover:bg-zinc-100'}`}
                        >%</button>
                      </div>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={discountRaw}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.]/g, '')
                        setDiscountRaw(raw)
                        const parsed = parseFloat(raw)
                        if (!isNaN(parsed)) setDiscount(discountType, parsed)
                        else if (raw === '') setDiscount(discountType, 0)
                      }}
                      onBlur={() => {
                        const parsed = parseFloat(discountRaw) || 0
                        setDiscount(discountType, parsed)
                        setDiscountRaw(parsed > 0 ? String(parsed) : '')
                      }}
                      className="h-8 w-20 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-right text-sm font-medium text-emerald-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                )
              })()}
              {(activeOrder?.discount ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>
                    Discount
                    {activeOrder?.discountType === 'percent' && activeOrder.discountValue
                      ? ` (${activeOrder.discountValue}%)`
                      : ''}
                  </span>
                  <span className="font-medium">-{formatCurrency(activeOrder!.discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-zinc-100 pt-2 text-sm font-bold text-zinc-900">
                <span>Total</span>
                <span className="text-blue-600">{formatCurrency(total)}</span>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={handleKOT}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 py-2.5 text-xs font-bold text-zinc-800 transition hover:bg-zinc-900 hover:text-white hover:border-zinc-900 active:scale-95"
              >
                <Send className="h-3.5 w-3.5" />
                KOT
              </button>
              <button
                onClick={() => { setPaymentOpen(true); setAmountPaid(''); setPaymentMethod('cash'); setSplitMode(false); setSplitCount(2); setNumpadTarget('received') }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 active:scale-95"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Checkout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {paymentOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-zinc-200 sm:rounded-2xl" style={{ maxHeight: '95vh' }}>

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Bayaran</h3>
                <p className="text-xs text-zinc-400">Order #{activeOrder?.orderNumber}</p>
              </div>
              <button
                onClick={() => { setPaymentOpen(false); setAmountPaid(''); setSplitMode(false) }}
                className="rounded-xl p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — 2 columns */}
            <div className="flex min-h-0 flex-1 divide-x divide-zinc-100">

              {/* LEFT: Order summary + totals */}
              <div className="flex w-52 shrink-0 flex-col overflow-hidden">
                {/* Payment method tabs */}
                <div className="shrink-0 border-b border-zinc-100 p-3">
                  <div className="flex gap-1">
                    {([['cash', 'Tunai'], ['card', 'Kad'], ['qr', 'QR']] as const).map(([m, label]) => (
                      <button
                        key={m}
                        onClick={() => { setPaymentMethod(m); setAmountPaid('') }}
                        className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                          paymentMethod === m ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Items list */}
                <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
                  {activeOrder?.items.map((item: OrderItem) => (
                    <div key={item.id} className="flex items-start gap-2">
                      {item.productImage
                        ? <img src={item.productImage} alt={item.productName} className="h-8 w-8 shrink-0 rounded-md object-cover" />
                        : <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-black uppercase ${getColor(item.productName)}`}>{item.productName.charAt(0)}</div>
                      }
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-zinc-800">{item.productName}</p>
                        {item.modifiers.length > 0 && (
                          <p className="truncate text-[10px] text-zinc-400">{item.modifiers.map((m) => m.optionName).join(', ')}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-zinc-700">{formatCurrency(item.totalPrice)}</p>
                        <p className="text-[10px] text-zinc-400">{item.quantity}×</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals + Discount */}
                <div className="shrink-0 space-y-1.5 border-t border-zinc-100 p-3">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>Tax ({settings.taxRate}%)</span>
                    <span>{formatCurrency(tax)}</span>
                  </div>
                  {(currentStaff?.role === 'admin' || currentStaff?.role === 'cashier') && (() => {
                    const discountType = activeOrder?.discountType ?? 'flat'
                    const discountInputValue = activeOrder?.discountValue ?? 0
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <span>Diskaun</span>
                          <div className="flex overflow-hidden rounded-md border border-zinc-200 text-xs font-bold">
                            <button onClick={() => { setDiscount('flat', discountInputValue); setDiscountRaw(discountInputValue > 0 ? String(discountInputValue) : ''); setNumpadTarget('discount') }} className={`px-2.5 py-1.5 transition ${discountType === 'flat' ? 'bg-zinc-800 text-white' : 'bg-white text-zinc-400 hover:bg-zinc-100'}`}>RM</button>
                            <button onClick={() => { setDiscount('percent', discountInputValue); setDiscountRaw(discountInputValue > 0 ? String(discountInputValue) : ''); setNumpadTarget('discount') }} className={`px-2.5 py-1.5 transition ${discountType === 'percent' ? 'bg-zinc-800 text-white' : 'bg-white text-zinc-400 hover:bg-zinc-100'}`}>%</button>
                          </div>
                        </div>
                        <button
                          onClick={() => setNumpadTarget('discount')}
                          className={`h-9 w-20 rounded-md border px-2 text-right text-sm font-semibold transition ${numpadTarget === 'discount' ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20' : 'border-zinc-200 bg-zinc-50 text-emerald-700 hover:border-zinc-300'}`}
                        >
                          {discountRaw || '0'}
                        </button>
                      </div>
                    )
                  })()}
                  {(activeOrder?.discount ?? 0) > 0 && (
                    <div className="flex justify-between text-xs text-emerald-600">
                      <span>Jimat</span>
                      <span className="font-semibold">-{formatCurrency(activeOrder!.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-zinc-200 pt-2">
                    <span className="text-sm font-black text-zinc-900">Total</span>
                    <span className="text-sm font-black text-blue-600">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              {/* RIGHT: Amount + Numpad */}
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
                {paymentMethod === 'cash' ? (
                  <>
                    {/* Amount received + change in one row */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setNumpadTarget('received')}
                        className={`rounded-xl border px-3 py-2.5 text-left transition ${numpadTarget === 'received' ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-500/20' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300'}`}
                      >
                        <p className={`mb-0.5 text-[10px] font-medium uppercase tracking-wide ${numpadTarget === 'received' ? 'text-blue-500' : 'text-zinc-400'}`}>Diterima</p>
                        <p className={`text-xl font-black leading-tight tracking-tight ${amountPaid ? 'text-zinc-900' : 'text-zinc-300'}`}>
                          {amountPaid ? `RM ${parseFloat(amountPaid).toFixed(2)}` : `RM ${total.toFixed(2)}`}
                        </p>
                      </button>
                      <div className={`rounded-xl border px-3 py-2.5 transition-colors ${
                        !amountPaid ? 'border-zinc-200 bg-zinc-50' :
                        parseFloat(amountPaid) >= total ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                      }`}>
                        <p className={`mb-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          !amountPaid ? 'text-zinc-400' :
                          parseFloat(amountPaid) >= total ? 'text-emerald-500' : 'text-red-400'
                        }`}>
                          {!amountPaid ? 'Baki' : parseFloat(amountPaid) >= total ? 'Baki' : 'Kurang'}
                        </p>
                        <p className={`text-xl font-black leading-tight ${
                          !amountPaid ? 'text-zinc-300' :
                          parseFloat(amountPaid) >= total ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          {!amountPaid ? 'RM 0.00' :
                            parseFloat(amountPaid) >= total
                              ? formatCurrency(parseFloat(amountPaid) - total)
                              : formatCurrency(total - parseFloat(amountPaid))
                          }
                        </p>
                      </div>
                    </div>

                    {/* Quick amounts */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {quickAmounts.map((amt) => (
                        <button
                          key={amt}
                          onClick={() => setAmountPaid(amt.toFixed(2))}
                          className={`rounded-xl border py-2.5 text-xs font-bold transition active:scale-95 ${
                            amountPaid === amt.toFixed(2)
                              ? 'border-blue-400 bg-blue-50 text-blue-700'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          {amt === total ? 'Tepat' : `RM ${amt % 1 === 0 ? amt : amt.toFixed(2)}`}
                        </button>
                      ))}
                    </div>

                    {/* Numpad */}
                    <div className="grid flex-1 grid-cols-3 gap-2">
                      {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map((k) => (
                        <button
                          key={k}
                          onClick={() => handleNumpad(k)}
                          className={`rounded-xl py-4 text-xl font-bold transition active:scale-95 select-none ${
                            k === '⌫'
                              ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                              : 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 shadow-sm'
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center">
                      {paymentMethod === 'card'
                        ? <CreditCard className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
                        : <Waves className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
                      }
                      <p className="text-sm font-semibold text-zinc-500">
                        {paymentMethod === 'card' ? 'Proses bayaran melalui mesin kad' : 'Tunjukkan QR kod kepada pelanggan'}
                      </p>
                      <p className="mt-1 text-2xl font-black text-blue-600">{formatCurrency(total)}</p>
                    </div>
                  </div>
                )}

                {/* Split Bill (Pro) */}
                {features.splitBill && (
                  <div className="border-t border-zinc-100 pt-2">
                    <button
                      onClick={() => setSplitMode((s) => !s)}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        splitMode ? 'bg-blue-50 text-blue-700' : 'text-zinc-500 hover:bg-zinc-50'
                      }`}
                    >
                      <Scissors className="h-3.5 w-3.5" />
                      Pisah Bil
                      {splitMode && <span className="ml-auto rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">ON</span>}
                    </button>
                    {splitMode && (
                      <div className="mt-2 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-600">Bahagi kepada</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setSplitCount((c) => Math.max(2, c - 1))} className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-200 text-zinc-700 hover:bg-zinc-300 active:scale-95"><Minus className="h-3 w-3" /></button>
                            <span className="w-8 text-center text-sm font-bold text-zinc-900">{splitCount}</span>
                            <button onClick={() => setSplitCount((c) => Math.min(10, c + 1))} className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-200 text-zinc-700 hover:bg-zinc-300 active:scale-95"><Plus className="h-3 w-3" /></button>
                          </div>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center">
                          <p className="text-[11px] text-zinc-400">Setiap orang bayar</p>
                          <p className="text-xl font-black text-blue-600">{formatCurrency(total / splitCount)}</p>
                        </div>
                        <p className="text-center text-[11px] text-zinc-400">{splitCount} × {formatCurrency(total / splitCount)} = {formatCurrency(total)}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 gap-2.5 border-t border-zinc-100 px-5 py-4">
              <Button
                variant="outline"
                className="w-32 shrink-0"
                onClick={() => { setPaymentOpen(false); setAmountPaid(''); setSplitMode(false) }}
              >
                Batal
              </Button>
              <Button
                variant="success"
                className="h-12 flex-1 text-sm font-bold"
                onClick={() => handlePayment(paymentMethod)}
                disabled={paymentMethod === 'cash' && amountPaid !== '' && parseFloat(amountPaid) < total}
              >
                <Banknote className="mr-2 h-4 w-4" />
                Sahkan Bayaran
              </Button>
            </div>

          </div>
        </div>
      )}
      {/* Modifier Selection Modal */}
      {pendingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <h3 className="mb-0.5 text-sm font-semibold text-zinc-900">{pendingProduct.name}</h3>
            <p className="mb-4 text-xs text-zinc-500">Base: {formatCurrency(pendingProduct.price)}</p>

            <div className="space-y-4">
              {pendingGroups?.map((group: ModifierGroup) => (
                <div key={group.id}>
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-zinc-900">{group.name}</span>
                    {group.required ? (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">Required</span>
                    ) : (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">Optional</span>
                    )}
                    <span className="ml-auto text-[10px] text-zinc-400">{group.type === 'single' ? 'Choose one' : 'Choose any'}</span>
                  </div>
                  <div className="space-y-1">
                    {pendingAllOptions?.filter((o) => o.groupId === group.id).map((opt: ModifierOption) => {
                      const isSelected = (selectedOptions[group.id] || []).includes(opt.id)
                      return (
                        <label
                          key={opt.id}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition ${isSelected ? 'border-blue-300 bg-blue-50' : 'border-zinc-200 hover:border-zinc-300'}`}
                        >
                          <input
                            type={group.type === 'single' ? 'radio' : 'checkbox'}
                            name={`group-${group.id}`}
                            checked={isSelected}
                            onChange={() => toggleOption(group, opt.id)}
                            className="text-blue-600"
                          />
                          <span className="flex-1 text-xs font-medium text-zinc-900">{opt.name}</span>
                          {opt.price > 0 ? (
                            <span className="text-xs font-semibold text-blue-600">+{formatCurrency(opt.price)}</span>
                          ) : (
                            <span className="text-[11px] text-zinc-400">Free</span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-zinc-100 pt-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-zinc-600">Item total</span>
                <span className="text-sm font-bold text-blue-600">
                  {formatCurrency(pendingProduct.price + modifierExtraPrice)}
                  {modifierExtraPrice > 0 && <span className="ml-1 text-[11px] font-normal text-zinc-400">(+{formatCurrency(modifierExtraPrice)})</span>}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setPendingProduct(null)}>Cancel</Button>
                <Button size="sm" className="flex-1" disabled={!canConfirmModifiers} onClick={handleConfirmModifiers}>Add to Order</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>

    {/* Transfer Table Modal */}
    {transferOpen && activeOrder?.type === 'dine_in' && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900">Pindah Meja</h3>
            <button onClick={() => setTransferOpen(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-xs text-zinc-500">Meja semasa: <span className="font-semibold text-zinc-800">Table {activeOrder.tableNumber}</span></p>
          <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {dineTables
              ?.filter((t) => t.number !== activeOrder.tableNumber)
              .map((t) => {
                const occupied = occupiedTableNumbers?.has(t.number) ?? false
                return (
                  <button
                    key={t.id}
                    disabled={occupied}
                    onClick={async () => {
                      await transferTable(t.id, t.number)
                      setTransferOpen(false)
                    }}
                    className={`rounded-xl border p-3 text-center transition ${
                      occupied
                        ? 'border-red-100 bg-red-50 opacity-50 cursor-not-allowed'
                        : 'border-emerald-200 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100 cursor-pointer'
                    }`}
                  >
                    <div className="text-sm font-bold text-zinc-800">{t.number}</div>
                    <div className={`mt-0.5 text-[10px] font-semibold ${occupied ? 'text-red-500' : 'text-emerald-600'}`}>
                      {occupied ? 'Occupied' : 'Available'}
                    </div>
                  </button>
                )
              })}
          </div>
        </div>
      </div>
    )}

    {/* Merge Table Modal */}
    {mergeOpen && activeOrder?.type === 'dine_in' && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900">Gabung Meja</h3>
            <button onClick={() => setMergeOpen(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-xs text-zinc-500">
            Semua item dari meja yang dipilih akan digabung ke <span className="font-semibold text-zinc-800">Table {activeOrder.tableNumber}</span>. Meja sumber akan dibebaskan.
          </p>
          <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {dineTables
              ?.filter((t) => t.number !== activeOrder.tableNumber && (occupiedTableNumbers?.has(t.number) ?? false))
              .map((t) => (
                <button
                  key={t.id}
                  onClick={async () => {
                    const src = await db.orders
                      .where('status').anyOf(['open', 'sent_to_kitchen'])
                      .filter((o) => o.type === 'dine_in' && o.tableNumber === t.number)
                      .first()
                    if (src) { await mergeFrom(src.id, t.id); setMergeOpen(false) }
                  }}
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-center hover:border-amber-400 hover:bg-amber-50 transition cursor-pointer"
                >
                  <div className="text-sm font-bold text-zinc-800">{t.number}</div>
                  <div className="mt-0.5 text-[10px] font-semibold text-red-500">Occupied</div>
                </button>
              ))}
          </div>
          {dineTables?.filter((t) => t.number !== activeOrder.tableNumber && (occupiedTableNumbers?.has(t.number) ?? false)).length === 0 && (
            <p className="py-4 text-center text-xs text-zinc-400">Tiada meja lain yang occupied</p>
          )}
        </div>
      </div>
    )}
    </>
  )
}
