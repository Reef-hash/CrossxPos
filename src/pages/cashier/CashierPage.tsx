import { useLiveQuery } from 'dexie-react-hooks'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { useCartStore } from '@/store/cartStore'
import { useSettingsStore } from '@/store/settingsStore'
import type { Product, Category, Table, OrderItem, ModifierGroup, ModifierOption, OrderItemModifier } from '@/types'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, Minus, Trash2, Send, CreditCard, ShoppingCart } from 'lucide-react'
import { printReceipt, printKitchenTicket } from '@/lib/printer'

export function CashierPage() {
  const { currentStaff } = useAuthStore()
  const { settings } = useSettingsStore()
  const { activeOrder, startOrder, addItem, updateQuantity, removeItem, sendToKitchen, processPayment, setDiscount } =
    useCartStore()

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [amountPaid, setAmountPaid] = useState('')

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
        orderType === 'dine_in' ? tableNum || undefined : undefined
      )
    }
    const catModifierIds = categoryModifierMap?.get(product.categoryId) ?? []
    const allModifierIds = [...new Set([...(product.modifierGroupIds ?? []), ...catModifierIds])]
    if (allModifierIds.length > 0) {
      setPendingProduct(product)
      setSelectedOptions({})
    } else {
      addItem({ productId: product.id, productName: product.name, price: product.price, quantity: 1, modifiers: [], totalPrice: product.price })
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
    addItem({ productId: pendingProduct.id, productName: pendingProduct.name, price: pendingProduct.price, quantity: 1, modifiers, totalPrice: pendingProduct.price + extraPrice })
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
    const paid = parseFloat(amountPaid) || activeOrder?.total || 0
    const paidOrder = await processPayment(method, paid, settings.taxRate)
    setPaymentOpen(false)
    setAmountPaid('')
    if (settings.receiptPrinter.enabled) {
      printReceipt(paidOrder, settings)
    }
  }

  const subtotal = activeOrder?.items.reduce((s, i) => s + i.totalPrice, 0) ?? 0
  const tax = subtotal * (settings.taxRate / 100)
  const total = subtotal + tax - (activeOrder?.discount ?? 0)

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
    <div className="flex h-full bg-gray-50">
      {/* Left — Menu */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Category tabs */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-200/80 bg-white px-4 py-2.5">
          <button
            onClick={() => setActiveCategoryId(null)}
            className={`shrink-0 rounded-lg px-3.5 py-1.5 text-center text-xs font-semibold transition ${
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
              className={`shrink-0 rounded-lg px-3.5 py-1.5 text-center text-xs font-semibold transition ${
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
            <p className="mt-1 text-xs font-medium text-zinc-500">
              {activeOrder.type === 'dine_in' ? `Dine In · Table ${activeOrder.tableNumber}` : 'Take Away'}
            </p>
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
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black uppercase ${color}`}>
                      {item.productName.charAt(0)}
                    </div>
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
              {(currentStaff?.role === 'admin' || currentStaff?.role === 'cashier') && (
                <div className="flex items-center justify-between text-zinc-500">
                  <span>Discount (RM)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activeOrder?.discount || ''}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-20 rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-right text-xs font-medium text-emerald-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              )}
              {(activeOrder?.discount ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Diskaun</span>
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
                onClick={() => setPaymentOpen(true)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900">Payment</h3>
            <p className="mb-4 text-2xl font-bold text-blue-600">{formatCurrency(total)}</p>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-zinc-600">Amount Paid (Cash)</label>
              <input
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder={total.toFixed(2)}
                className="w-full rounded-lg border border-zinc-200 p-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              {amountPaid && parseFloat(amountPaid) >= total && (
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  Change: {formatCurrency(parseFloat(amountPaid) - total)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <Button onClick={() => handlePayment('cash')} variant="success" size="sm">
                Cash
              </Button>
              <Button onClick={() => handlePayment('card')} variant="secondary" size="sm">
                Card
              </Button>
              <Button onClick={() => handlePayment('qr')} variant="secondary" size="sm">
                QR
              </Button>
            </div>
            <Button variant="outline" className="mt-2.5 w-full" size="sm" onClick={() => setPaymentOpen(false)}>
              Cancel
            </Button>
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
  )
}
