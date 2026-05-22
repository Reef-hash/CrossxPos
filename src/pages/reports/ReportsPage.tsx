import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, TrendingUp, ShoppingBag, Banknote, Download, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns'

// ─── Date Range Helpers ───────────────────────────────────────────────────────

type DateRange = 'today' | 'week' | 'month' | 'custom'

const RANGE_LABELS: Record<DateRange, string> = {
  today: 'Hari Ini',
  week: 'Minggu Ini',
  month: 'Bulan Ini',
  custom: 'Tersuai',
}

function computeRange(range: DateRange, from: string, to: string): { from: Date; to: Date } {
  const now = new Date()
  if (range === 'today') return { from: startOfDay(now), to: endOfDay(now) }
  if (range === 'week') return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) }
  if (range === 'month') return { from: startOfMonth(now), to: endOfMonth(now) }
  return { from: startOfDay(parseISO(from)), to: endOfDay(parseISO(to)) }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [range, setRange] = useState<DateRange>('today')
  const [dateFrom, setDateFrom] = useState(todayStr)
  const [dateTo, setDateTo] = useState(todayStr)

  const { from, to } = useMemo(() => computeRange(range, dateFrom, dateTo), [range, dateFrom, dateTo])

  // Filtered orders for selected range
  const rangeOrders = useLiveQuery(
    async () =>
      db.orders
        .where('createdAt')
        .between(from, to)
        .and((o) => o.status === 'paid')
        .toArray(),
    [from, to]
  )

  // All-time total (always unfiltered)
  const allTimeSales = useLiveQuery(async () => {
    const all = await db.orders.where('status').equals('paid').toArray()
    return all.reduce((s, o) => s + o.total, 0)
  }) ?? 0

  // Products + Categories for category breakdown
  const allProducts = useLiveQuery(() => db.products.toArray())
  const allCategories = useLiveQuery(() => db.categories.toArray())

  // ─── Derived stats ───────────────────────────────────────────────────────

  const orders = rangeOrders ?? []
  const rangeSales = orders.reduce((s, o) => s + o.total, 0)
  const rangeCount = orders.length
  const rangeAvg = rangeCount > 0 ? rangeSales / rangeCount : 0

  // Top products
  const productAgg: Record<string, { name: string; qty: number; revenue: number }> = {}
  orders.forEach((o) => {
    o.items.forEach((item) => {
      if (!productAgg[item.productId])
        productAgg[item.productId] = { name: item.productName, qty: 0, revenue: 0 }
      productAgg[item.productId].qty += item.quantity
      productAgg[item.productId].revenue += item.totalPrice
    })
  })
  const topList = Object.values(productAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // Payment breakdown
  const paymentAgg: Record<string, number> = {}
  orders.forEach((o) => {
    const m = o.paymentMethod ?? 'unknown'
    paymentAgg[m] = (paymentAgg[m] ?? 0) + o.total
  })

  // Sales by category
  const prodCatMap = new Map(allProducts?.map((p) => [p.id, p.categoryId]) ?? [])
  const catNameMap = new Map(allCategories?.map((c) => [c.id, c.name]) ?? [])
  const catAgg: Record<string, { name: string; qty: number; revenue: number }> = {}
  orders.forEach((o) => {
    o.items.forEach((item) => {
      const catId = prodCatMap.get(item.productId)
      const catName = catId ? (catNameMap.get(catId) ?? 'Lain-lain') : 'Lain-lain'
      if (!catAgg[catName]) catAgg[catName] = { name: catName, qty: 0, revenue: 0 }
      catAgg[catName].qty += item.quantity
      catAgg[catName].revenue += item.totalPrice
    })
  })
  const catList = Object.values(catAgg).sort((a, b) => b.revenue - a.revenue)

  // Hourly sales chart data
  const hourlySales = Array(24).fill(0) as number[]
  orders.forEach((o) => {
    hourlySales[new Date(o.createdAt).getHours()] += o.total
  })
  const maxHourlySale = Math.max(...hourlySales, 1)

  // ─── CSV Export ──────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    const header = ['Order#', 'Tarikh', 'Masa', 'Jenis', 'Meja', 'Kakitangan', 'Item', 'Subtotal', 'Tax', 'Diskaun', 'Jumlah', 'Bayaran']
    const rows = orders.map((o) => [
      o.orderNumber,
      format(new Date(o.createdAt), 'yyyy-MM-dd'),
      format(new Date(o.createdAt), 'HH:mm'),
      o.type,
      o.tableNumber ?? '',
      o.staffName,
      o.items.map((i) => `${i.quantity}x ${i.productName}`).join('; '),
      o.subtotal.toFixed(2),
      o.tax.toFixed(2),
      o.discount.toFixed(2),
      o.total.toFixed(2),
      o.paymentMethod ?? '',
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jualan-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-5 space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-zinc-500" />
          <h1 className="text-base font-bold text-zinc-900">Laporan Jualan</h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={orders.length === 0}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardContent className="pt-3 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            {(['today', 'week', 'month', 'custom'] as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  range === r
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
            {range === 'custom' && (
              <div className="flex items-center gap-2 ml-1">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                <span className="text-xs text-zinc-400">→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <Banknote className="h-3.5 w-3.5" />
              {RANGE_LABELS[range]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-zinc-900">{formatCurrency(rangeSales)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <ShoppingBag className="h-3.5 w-3.5" />
              Bil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-zinc-900">{rangeCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <TrendingUp className="h-3.5 w-3.5" />
              Purata Order
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-zinc-900">{formatCurrency(rangeAvg)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <BarChart3 className="h-3.5 w-3.5" />
              Semua Masa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-zinc-900">{formatCurrency(allTimeSales)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Hourly Sales Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Carta Jualan Mengikut Waktu</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-px h-16 rounded-sm bg-zinc-50 px-1 pt-2 pb-1">
            {hourlySales.map((val, h) => {
              const pct = (val / maxHourlySale) * 100
              return (
                <div
                  key={h}
                  className="flex-1 flex items-end justify-center"
                  title={`${String(h).padStart(2, '0')}:00 — ${formatCurrency(val)}`}
                >
                  <div
                    className="w-full rounded-sm transition-all duration-300"
                    style={{
                      height: pct > 0 ? `${Math.max(pct, 8)}%` : '2px',
                      backgroundColor: pct > 0 ? '#3b82f6' : '#e4e4e7',
                    }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between px-1 mt-1 text-[9px] text-zinc-400 select-none">
            {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
              <span key={h}>{String(h).padStart(2, '0')}</span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bottom Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Produk Terlaris</CardTitle>
          </CardHeader>
          <CardContent>
            {topList.length === 0 ? (
              <p className="text-xs text-zinc-400">Tiada jualan dalam tempoh ini</p>
            ) : (
              <div className="space-y-1.5">
                {topList.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-[11px] font-bold text-zinc-400">{i + 1}</span>
                      <span className="text-zinc-700">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-zinc-900">{formatCurrency(item.revenue)}</span>
                      <span className="ml-1.5 text-[11px] text-zinc-400">×{item.qty}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Jualan Mengikut Kategori</CardTitle>
          </CardHeader>
          <CardContent>
            {catList.length === 0 ? (
              <p className="text-xs text-zinc-400">Tiada jualan dalam tempoh ini</p>
            ) : (
              <div className="space-y-1.5">
                {catList.map((cat, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-[11px] font-bold text-zinc-400">{i + 1}</span>
                      <span className="text-zinc-700">{cat.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-zinc-900">{formatCurrency(cat.revenue)}</span>
                      <span className="ml-1.5 text-[11px] text-zinc-400">×{cat.qty}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kaedah Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(paymentAgg).length === 0 ? (
              <p className="text-xs text-zinc-400">Tiada transaksi dalam tempoh ini</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(paymentAgg).map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-zinc-600">{method}</span>
                    <span className="font-semibold text-zinc-900">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
