import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { formatCurrency } from '@/lib/utils'
import { useSettingsStore } from '@/store/settingsStore'
import { useAuthStore } from '@/store/authStore'
import { BarChart3, TrendingUp, ShoppingBag, Banknote, Download, Calendar, Printer, Trash2, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
  const { settings } = useSettingsStore()
  const { currentStaff } = useAuthStore()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [range, setRange] = useState<DateRange>('today')
  const [dateFrom, setDateFrom] = useState(todayStr)
  const [dateTo, setDateTo] = useState(todayStr)

  const { from, to } = useMemo(() => computeRange(range, dateFrom, dateTo), [range, dateFrom, dateTo])

  const [selectedShiftId, setSelectedShiftId] = useState<string>('all')
  const allShifts = useLiveQuery(() => db.shifts.orderBy('openedAt').reverse().limit(100).toArray())

  // Void state
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidLoading, setVoidLoading] = useState(false)
  const canVoid = currentStaff?.role === 'admin' || currentStaff?.role === 'cashier'

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
        if (order.tableId) await db.dineTables.update(order.tableId, { status: 'available' })
      }
    } finally {
      setVoidLoading(false)
      setVoidTargetId(null)
      setVoidReason('')
    }
  }

  // Monthly archive — group paid orders by month
  const monthlyArchive = useLiveQuery(async () => {
    const all = await db.orders.where('status').equals('paid').toArray()
    const map: Record<string, { label: string; count: number; total: number; monthKey: string }> = {}
    all.forEach((o) => {
      const key = format(new Date(o.createdAt), 'yyyy-MM')
      if (!map[key]) map[key] = { label: format(new Date(o.createdAt), 'MMMM yyyy'), count: 0, total: 0, monthKey: key }
      map[key].count += 1
      map[key].total += o.total
    })
    return Object.values(map).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
  })

  // Filtered orders for selected range
  const rangeOrders = useLiveQuery(
    async () =>
      db.orders
        .where('createdAt')
        .between(from, to)
        .and((o) => o.status === 'paid' && (selectedShiftId === 'all' || o.shiftId === selectedShiftId))
        .toArray(),
    [from, to, selectedShiftId]
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
  const topList = Object.values(productAgg).sort((a, b) => b.qty - a.qty).slice(0, 10)

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

  // ─── HTML Report Export ───────────────────────────────────────────────────

  const handleExportHTML = () => {
    const restaurantName = settings.restaurantName || 'Restaurant'
    const generatedBy = currentStaff?.name ?? 'Admin'
    const periodLabel =
      range === 'today' ? `Today — ${format(from, 'd MMMM yyyy')}`
      : range === 'week' ? `This Week — ${format(from, 'd MMM')} to ${format(to, 'd MMM yyyy')}`
      : range === 'month' ? format(from, 'MMMM yyyy')
      : `${format(from, 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`
    const printedAt = format(new Date(), 'dd/MM/yyyy HH:mm')

    // Core financials
    const grossSales = orders.reduce((s, o) => s + (o.subtotal ?? o.total), 0)
    const totalTax = orders.reduce((s, o) => s + (o.tax ?? 0), 0)
    const totalDiscount = orders.reduce((s, o) => s + (o.discount ?? 0), 0)
    const totalItemsSold = orders.reduce((s, o) => s + o.items.reduce((si, i) => si + i.quantity, 0), 0)

    // Daily aggregation for insights
    const dailyAgg: Record<string, { count: number; total: number }> = {}
    orders.forEach((o) => {
      const day = format(new Date(o.createdAt), 'yyyy-MM-dd')
      if (!dailyAgg[day]) dailyAgg[day] = { count: 0, total: 0 }
      dailyAgg[day].count += 1
      dailyAgg[day].total += o.total
    })
    const dailyEntries = Object.entries(dailyAgg).sort(([, a], [, b]) => b.total - a.total)
    const bestDay = dailyEntries[0]
    const worstDay = dailyEntries[dailyEntries.length - 1]

    // Payment counts
    const paymentCount: Record<string, number> = {}
    orders.forEach((o) => { const m = o.paymentMethod ?? 'other'; paymentCount[m] = (paymentCount[m] ?? 0) + 1 })
    const bestPaymentEntry = Object.entries(paymentCount).sort(([, a], [, b]) => b - a)[0]

    // Top 5 products
    const top5 = topList.slice(0, 5)

    // ── Insight sentences ──
    const insights: string[] = []
    if (bestDay && dailyEntries.length > 1) {
      insights.push(`<strong>${format(new Date(bestDay[0]), 'EEEE, d MMM')}</strong> recorded the highest sales at <strong>RM ${bestDay[1].total.toFixed(2)}</strong>.`)
      if (worstDay && worstDay[0] !== bestDay[0])
        insights.push(`Lowest sales day was <strong>${format(new Date(worstDay[0]), 'EEEE, d MMM')}</strong> with <strong>RM ${worstDay[1].total.toFixed(2)}</strong>.`)
    }
    if (top5[0]) {
      const pct = rangeSales > 0 ? ((top5[0].revenue / rangeSales) * 100).toFixed(1) : '0'
      insights.push(`<strong>${top5[0].name}</strong> was the top product, contributing <strong>${pct}%</strong> of total revenue.`)
    }
    if (bestPaymentEntry) {
      const lbl = bestPaymentEntry[0] === 'cash' ? 'Cash' : bestPaymentEntry[0] === 'card' ? 'Card' : bestPaymentEntry[0] === 'qr' ? 'QR / e-Wallet' : bestPaymentEntry[0]
      const pct = rangeCount > 0 ? ((bestPaymentEntry[1] / rangeCount) * 100).toFixed(1) : '0'
      insights.push(`<strong>${lbl}</strong> is the most preferred payment method at <strong>${pct}%</strong> of transactions.`)
    }
    if (rangeAvg > 0)
      insights.push(`Average order value for this period is <strong>RM ${rangeAvg.toFixed(2)}</strong>.`)

    // ── Top 5 product rows with inline bar ──
    const top5Rows = top5.map((item, i) => {
      const pct = rangeSales > 0 ? ((item.revenue / rangeSales) * 100).toFixed(1) : '0'
      const barW = rangeSales > 0 ? Math.round((item.revenue / rangeSales) * 100) : 0
      return `<tr>
        <td style="color:#94a3b8;font-size:11px;width:20px">${i + 1}</td>
        <td>
          <div style="font-weight:600;font-size:12.5px;color:#1e293b">${item.name}</div>
          <div style="height:3px;background:#e2e8f0;border-radius:2px;margin-top:5px">
            <div style="height:3px;background:#2563eb;border-radius:2px;width:${barW}%"></div>
          </div>
        </td>
        <td style="text-align:center;font-size:12px;color:#475569">${item.qty}</td>
        <td style="text-align:right">
          <div style="font-weight:700;color:#1e40af;font-size:12.5px">RM ${item.revenue.toFixed(2)}</div>
          <div style="font-size:10px;color:#94a3b8">${pct}%</div>
        </td>
      </tr>`
    }).join('')

    // ── Category rows with progress bars ──
    const catMaxRev = catList[0]?.revenue ?? 1
    const catRowsHTML = catList.map((cat) => {
      const pct = rangeSales > 0 ? ((cat.revenue / rangeSales) * 100).toFixed(1) : '0'
      const barW = Math.round((cat.revenue / catMaxRev) * 100)
      return `<tr>
        <td>
          <div style="font-weight:600;font-size:12.5px;color:#1e293b">${cat.name}</div>
          <div style="height:3px;background:#e2e8f0;border-radius:2px;margin-top:5px">
            <div style="height:3px;background:#7c3aed;border-radius:2px;width:${barW}%"></div>
          </div>
        </td>
        <td style="text-align:center;font-size:12px;color:#475569">${cat.qty}</td>
        <td style="text-align:right">
          <div style="font-weight:700;color:#7c3aed;font-size:12.5px">RM ${cat.revenue.toFixed(2)}</div>
          <div style="font-size:10px;color:#94a3b8">${pct}%</div>
        </td>
      </tr>`
    }).join('')

    // ── Payment method cards ──
    const payMethodCards = Object.entries(paymentAgg).map(([method, amount]) => {
      const count = paymentCount[method] ?? 0
      const pct = rangeCount > 0 ? ((count / rangeCount) * 100).toFixed(1) : '0'
      const barW = rangeCount > 0 ? Math.round((count / rangeCount) * 100) : 0
      const label = method === 'cash' ? 'Cash' : method === 'card' ? 'Card / Debit' : method === 'qr' ? 'QR / e-Wallet' : method
      const color = method === 'cash' ? '#059669' : method === 'card' ? '#2563eb' : '#d97706'
      const bg = method === 'cash' ? '#f0fdf4' : method === 'card' ? '#eff6ff' : '#fffbeb'
      return `<div style="display:flex;align-items:center;gap:16px;padding:14px 18px;background:${bg};border-radius:10px;margin-bottom:8px">
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px;color:${color}">${label}</div>
          <div style="height:5px;background:rgba(0,0,0,.07);border-radius:3px;margin-top:7px">
            <div style="height:5px;background:${color};border-radius:3px;width:${barW}%"></div>
          </div>
        </div>
        <div style="text-align:center;min-width:56px">
          <div style="font-size:20px;font-weight:800;color:${color}">${pct}%</div>
          <div style="font-size:10px;color:#6b7280">${count} orders</div>
        </div>
        <div style="text-align:right;min-width:90px">
          <div style="font-size:14px;font-weight:700;color:${color}">RM ${amount.toFixed(2)}</div>
        </div>
      </div>`
    }).join('')

    // ── Business insights ──
    const bizInsights: string[] = []
    if (top5[0]) bizInsights.push(`🏆 <strong>${top5[0].name}</strong> is your best-selling product. Consider ensuring it is always available.`)
    if (catList.length > 1 && catList[catList.length - 1])
      bizInsights.push(`📉 <strong>${catList[catList.length - 1].name}</strong> is the slowest-moving category. Consider a promotion or menu review.`)
    if (bestPaymentEntry) {
      const lbl = bestPaymentEntry[0] === 'cash' ? 'Cash' : bestPaymentEntry[0] === 'card' ? 'Card' : bestPaymentEntry[0] === 'qr' ? 'QR / e-Wallet' : bestPaymentEntry[0]
      const pct = rangeCount > 0 ? ((bestPaymentEntry[1] / rangeCount) * 100).toFixed(1) : '0'
      bizInsights.push(`💳 <strong>${lbl}</strong> payments are dominant at <strong>${pct}%</strong> of all transactions.`)
    }
    if (rangeAvg > 0) bizInsights.push(`💰 Average ticket size is <strong>RM ${rangeAvg.toFixed(2)}</strong> — consider upselling bundles to increase this.`)

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sales Report — ${restaurantName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f8fafc;color:#1e293b}
  .page{max-width:900px;margin:0 auto;background:#fff;padding:48px}
  .no-print{text-align:right;margin-bottom:32px}
  .btn-print{background:#1e40af;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:.01em}
  .btn-print:hover{background:#1d4ed8}
  /* Header */
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:28px;border-bottom:1px solid #e2e8f0}
  .biz-badge{font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
  .biz-name{font-size:28px;font-weight:800;color:#0f172a;letter-spacing:-.03em;line-height:1.1}
  .report-subtitle{font-size:13px;color:#64748b;margin-top:4px}
  .period-chip{background:#1e40af;color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:700;display:inline-block;margin-bottom:8px}
  .meta-text{font-size:11px;color:#94a3b8;line-height:1.7;text-align:right}
  /* KPI Grid */
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:36px}
  .kpi{border:1px solid #e2e8f0;border-radius:12px;padding:20px;position:relative;overflow:hidden}
  .kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--c,#2563eb)}
  .kpi.g::before{--c:#059669}.kpi.p::before{--c:#7c3aed}.kpi.o::before{--c:#d97706}.kpi.r::before{--c:#e11d48}.kpi.t::before{--c:#0891b2}
  .kpi-lbl{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
  .kpi-val{font-size:26px;font-weight:800;color:#0f172a;letter-spacing:-.02em;line-height:1}
  .kpi-sub{font-size:11px;color:#94a3b8;margin-top:5px}
  /* Section */
  .section{margin-bottom:36px}
  .sec-head{display:flex;align-items:center;gap:10px;margin-bottom:16px}
  .sec-icon{font-size:15px}
  .sec-title{font-size:12px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:.07em}
  .sec-line{flex:1;height:1px;background:#e2e8f0}
  /* Insights */
  .insights{background:#f8fafc;border-radius:10px;padding:16px 20px}
  .ins-item{display:flex;gap:10px;align-items:flex-start;padding:7px 0;font-size:12.5px;color:#475569;line-height:1.55;border-bottom:1px solid #f1f5f9}
  .ins-item:last-child{border-bottom:none}
  .ins-dot{width:6px;height:6px;border-radius:50%;background:var(--d,#2563eb);margin-top:6px;flex-shrink:0}
  /* Comparison table */
  .comp{width:100%;border-collapse:collapse}
  .comp tr{border-bottom:1px solid #f1f5f9}
  .comp tr:last-child{border-bottom:none}
  .comp td{padding:10px 0;font-size:13px}
  .comp .lbl{color:#64748b}
  .comp .val{text-align:right;font-weight:700;color:#0f172a}
  .comp .net td{color:#1e40af;font-size:14px;padding-top:14px;border-top:2px solid #dbeafe;font-weight:700}
  /* Data table */
  .dt{width:100%;border-collapse:collapse}
  .dt th{background:#f8fafc;color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;padding:10px 12px;border-bottom:2px solid #e2e8f0;text-align:left}
  .dt th:last-child{text-align:right}
  .dt td{padding:12px;border-bottom:1px solid #f8fafc;vertical-align:top}
  .dt tr:last-child td{border-bottom:none}
  /* Two col */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:36px}
  /* Footer */
  .footer{border-top:1px solid #e2e8f0;padding-top:20px;display:flex;justify-content:space-between;align-items:center;margin-top:8px}
  .footer-l{font-size:11px;color:#94a3b8;line-height:1.7}
  .footer-r{font-size:11px;color:#cbd5e1;font-style:italic}
  @media print{
    body{background:#fff}
    .page{padding:24px}
    .no-print{display:none}
  }
</style>
</head>
<body>
<div class="page">
  <div class="no-print"><button class="btn-print" onclick="window.print()">🖨&nbsp; Print / Save as PDF</button></div>

  <!-- HEADER -->
  <div class="header">
    <div>
      <div class="biz-badge">Sales Report</div>
      <div class="biz-name">${restaurantName}</div>
      <div class="report-subtitle">Business Performance Summary</div>
    </div>
    <div>
      <div class="period-chip">${periodLabel}</div>
      <div class="meta-text">Generated: ${printedAt}<br>Prepared by: ${generatedBy}<br>Confidential Business Report</div>
    </div>
  </div>

  <!-- KPI CARDS -->
  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-lbl">Net Sales</div>
      <div class="kpi-val">RM ${rangeSales.toFixed(2)}</div>
      <div class="kpi-sub">After discounts</div>
    </div>
    <div class="kpi g">
      <div class="kpi-lbl">Total Orders</div>
      <div class="kpi-val">${rangeCount}</div>
      <div class="kpi-sub">Completed transactions</div>
    </div>
    <div class="kpi p">
      <div class="kpi-lbl">Avg Order Value</div>
      <div class="kpi-val">RM ${rangeAvg.toFixed(2)}</div>
      <div class="kpi-sub">Per transaction</div>
    </div>
    <div class="kpi o">
      <div class="kpi-lbl">Tax Collected</div>
      <div class="kpi-val">RM ${totalTax.toFixed(2)}</div>
      <div class="kpi-sub">SST / service charge</div>
    </div>
    <div class="kpi r">
      <div class="kpi-lbl">Total Discount</div>
      <div class="kpi-val">RM ${totalDiscount.toFixed(2)}</div>
      <div class="kpi-sub">Across all orders</div>
    </div>
    <div class="kpi t">
      <div class="kpi-lbl">Items Sold</div>
      <div class="kpi-val">${totalItemsSold}</div>
      <div class="kpi-sub">Individual units</div>
    </div>
  </div>

  <!-- SALES OVERVIEW -->
  <div class="section">
    <div class="sec-head"><span class="sec-icon">📊</span><span class="sec-title">Sales Overview</span><div class="sec-line"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div>
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">Key Highlights</div>
        <div class="insights">
          ${insights.length > 0
            ? insights.map((s) => `<div class="ins-item"><div class="ins-dot"></div><div>${s}</div></div>`).join('')
            : '<div class="ins-item"><div class="ins-dot"></div><div>No data available for this period.</div></div>'}
        </div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">Financial Breakdown</div>
        <table class="comp">
          <tr><td class="lbl">Gross Sales</td><td class="val">RM ${grossSales.toFixed(2)}</td></tr>
          <tr><td class="lbl">Discounts Applied</td><td class="val" style="color:#e11d48">− RM ${totalDiscount.toFixed(2)}</td></tr>
          <tr><td class="lbl">Tax Collected</td><td class="val" style="color:#059669">+ RM ${totalTax.toFixed(2)}</td></tr>
          <tr class="net"><td class="lbl">Net Sales</td><td class="val">RM ${rangeSales.toFixed(2)}</td></tr>
        </table>
      </div>
    </div>
  </div>

  <!-- TOP PRODUCTS + CATEGORIES -->
  <div class="two-col">
    <div class="section">
      <div class="sec-head"><span class="sec-icon">🏆</span><span class="sec-title">Top Products</span><div class="sec-line"></div></div>
      <table class="dt">
        <thead><tr><th></th><th>Product</th><th style="text-align:center">Qty</th><th>Revenue</th></tr></thead>
        <tbody>${top5Rows}</tbody>
      </table>
    </div>
    <div class="section">
      <div class="sec-head"><span class="sec-icon">📂</span><span class="sec-title">Category Performance</span><div class="sec-line"></div></div>
      <table class="dt">
        <thead><tr><th>Category</th><th style="text-align:center">Items</th><th>Revenue</th></tr></thead>
        <tbody>${catRowsHTML}</tbody>
      </table>
    </div>
  </div>

  <!-- PAYMENT METHODS -->
  <div class="section">
    <div class="sec-head"><span class="sec-icon">💳</span><span class="sec-title">Payment Methods</span><div class="sec-line"></div></div>
    ${payMethodCards || '<p style="color:#94a3b8;font-size:12px;padding:12px 0">No payment data for this period.</p>'}
  </div>

  <!-- BUSINESS INSIGHTS -->
  <div class="section">
    <div class="sec-head"><span class="sec-icon">💡</span><span class="sec-title">Business Insights</span><div class="sec-line"></div></div>
    <div class="insights">
      ${bizInsights.map((s) => `<div class="ins-item"><div class="ins-dot" style="--d:#f59e0b"></div><div>${s}</div></div>`).join('')}
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-l"><strong>CrossxPOS</strong> — Automated Sales Report<br>${restaurantName} &nbsp;•&nbsp; ${periodLabel}</div>
    <div class="footer-r">Confidential &nbsp;•&nbsp; For internal use only</div>
  </div>
</div>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (!w) {
      alert('Pop-up disekat oleh pelayar. Sila benarkan pop-up untuk fungsi cetak / laporan PDF.')
      URL.revokeObjectURL(url)
      return
    }
    w.addEventListener('load', () => {
      URL.revokeObjectURL(url)
      setTimeout(() => w.print(), 400)
    })
  }

  // ─── CSV Export ───────────────────────────────────────────────────────────

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

  const navigate = useNavigate()

  return (
    <>
    <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5 items-start">
      {/* ── Main column ────────────────────────────────────────────────────── */}
      <div className="space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-zinc-500" />
          <h1 className="text-base font-bold text-zinc-900">Laporan Jualan</h1>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Settings
        </button>
      </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={orders.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button size="sm" onClick={handleExportHTML} disabled={orders.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Laporan PDF
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
          {/* Shift filter */}
          {allShifts && allShifts.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-zinc-500 shrink-0">Shift:</span>
              <select
                value={selectedShiftId}
                onChange={(e) => setSelectedShiftId(e.target.value)}
                className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="all">Semua Shift</option>
                {allShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {format(new Date(s.openedAt), 'dd/MM HH:mm')} — {s.openedBy}
                    {s.status === 'open' ? ' (Aktif)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
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

      {/* Transactions Table */}
      {orders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Transaksi ({orders.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50">
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Order#</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Masa</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Cashier</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Jenis</th>
                    <th className="px-3 py-2 text-right font-semibold text-zinc-500">Jumlah</th>
                    <th className="px-3 py-2 text-left font-semibold text-zinc-500">Bayaran</th>
                    {canVoid && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {orders.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((o) => (
                    <tr key={o.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50">
                      <td className="px-3 py-2 font-medium text-zinc-800">#{o.orderNumber}</td>
                      <td className="px-3 py-2 text-zinc-500">{format(new Date(o.createdAt), 'dd/MM HH:mm')}</td>
                      <td className="px-3 py-2 text-zinc-600">{o.staffName}</td>
                      <td className="px-3 py-2 text-zinc-500">{o.type === 'dine_in' ? `Dine In${o.tableNumber ? ` · ${o.tableNumber}` : ''}` : 'Take Away'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-zinc-900">{formatCurrency(o.total)}</td>
                      <td className="px-3 py-2 capitalize text-zinc-500">{o.paymentMethod ?? '—'}</td>
                      {canVoid && (
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => { setVoidTargetId(o.id); setVoidReason('') }}
                            className="rounded p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-500 transition"
                            title="Void order"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
      {/* ── Monthly Archive sidebar ──────────────────────────────────────── */}
      <div className="sticky top-4">
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="px-3 py-2.5 border-b border-zinc-100 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-xs font-semibold text-zinc-700">Arkib Bulanan</span>
          </div>
          {monthlyArchive && monthlyArchive.length > 0 ? (
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-zinc-50">
              {monthlyArchive.map((m) => (
                <button
                  key={m.monthKey}
                  onClick={() => {
                    const d = new Date(m.monthKey + '-01')
                    setRange('custom')
                    setDateFrom(format(startOfMonth(d), 'yyyy-MM-dd'))
                    setDateTo(format(endOfMonth(d), 'yyyy-MM-dd'))
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 transition-colors"
                >
                  <div className="text-xs font-semibold text-zinc-800">{m.label}</div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
                    <span>{m.count} bil</span>
                    <span className="font-medium text-zinc-700">RM {m.total.toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-6 text-center text-xs text-zinc-400">Belum ada data</div>
          )}
        </div>
      </div>
    </div>

    {/* Void Confirmation Modal */}
    {voidTargetId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
          <h3 className="mb-1 text-sm font-bold text-zinc-900">Void Order?</h3>
          <p className="mb-3 text-xs text-zinc-500">Order #{orders.find((o) => o.id === voidTargetId)?.orderNumber} akan divoid. Tindakan ini tidak boleh dibatalkan.</p>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-zinc-700">Sebab Void</label>
            <input
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="cth: silap order, pelanggan cancel..."
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setVoidTargetId(null); setVoidReason('') }}
              className="flex-1 rounded-lg border border-zinc-200 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Batal
            </button>
            <button
              onClick={handleVoid}
              disabled={voidLoading}
              className="flex-1 rounded-lg bg-red-500 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            >
              {voidLoading ? 'Memproses...' : 'Ya, Void'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}
