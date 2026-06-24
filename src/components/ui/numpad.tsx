import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Delete, X } from 'lucide-react'

interface NumpadProps {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
  placeholder?: string
  label?: string
  maxDecimals?: number
  maxDigits?: number
  showConfirm?: boolean
  confirmLabel?: string
  className?: string
  open?: boolean
  onClose?: () => void
}

export function Numpad({
  value,
  onChange,
  onEnter,
  placeholder = '0.00',
  label,
  maxDecimals = 2,
  maxDigits = 9,
  showConfirm = false,
  confirmLabel = 'OK',
  className,
  open: controlledOpen,
  onClose,
}: NumpadProps) {
  const isFloating = controlledOpen !== undefined

  const hasDecimal = value.includes('.')
  const decimalPart = hasDecimal ? value.split('.')[1] : ''
  const integerPart = hasDecimal ? value.split('.')[0] : value
  const canAddDigit = integerPart.replace('-', '').length < maxDigits
  const canAddDecimal = !hasDecimal && value.length > 0 && !value.endsWith('.')
  const canAddDecimalDigit = hasDecimal && decimalPart.length < maxDecimals

  const handleDigit = (digit: string) => {
    if (digit === '.') { if (canAddDecimal) onChange(value + '.'); return }
    if (hasDecimal) { if (canAddDecimalDigit) onChange(value + digit); return }
    if (!canAddDigit) return
    if (value === '0' && digit !== '0') { onChange(digit); return }
    if (value === '0' && digit === '0') return
    onChange(value + digit)
  }

  const handleBackspace = () => onChange(value.length <= 1 ? '' : value.slice(0, -1))
  const handleClear = () => onChange('')

  const [draft, setDraft] = useState(value)
  useEffect(() => { if (controlledOpen) setDraft(value) }, [controlledOpen, value])

  const floatDigit = useCallback((d: string) => {
    setDraft((prev) => {
      const hd = prev.includes('.')
      const dp = hd ? prev.split('.')[1] : ''
      const ip = hd ? prev.split('.')[0] : prev
      if (d === '.') { if (hd || prev.length === 0 || prev.endsWith('.')) return prev; return prev + '.' }
      if (hd) return dp.length >= maxDecimals ? prev : prev + d
      if (ip.replace('-', '').length >= maxDigits) return prev
      if (prev === '0' && d !== '0') return d
      if (prev === '0' && d === '0') return prev
      return prev + d
    })
  }, [maxDecimals, maxDigits])

  const floatBS = useCallback(() => setDraft((prev) => (prev.length <= 1 ? '' : prev.slice(0, -1))), [])
  const floatClear = useCallback(() => setDraft(''), [])

  const handleConfirm = () => { onChange(draft); onClose?.() }
  const handleCancel = () => onClose?.()

  if (isFloating && !controlledOpen) return null

  const dv = isFloating ? draft : value
  const dOnChange = isFloating ? floatDigit : handleDigit
  const dBackspace = isFloating ? floatBS : handleBackspace
  const dClear = isFloating ? floatClear : handleClear

  const buttons = [
    { label: '1', action: () => dOnChange('1'), variant: 'digit' as const },
    { label: '2', action: () => dOnChange('2'), variant: 'digit' as const },
    { label: '3', action: () => dOnChange('3'), variant: 'digit' as const },
    { label: '4', action: () => dOnChange('4'), variant: 'digit' as const },
    { label: '5', action: () => dOnChange('5'), variant: 'digit' as const },
    { label: '6', action: () => dOnChange('6'), variant: 'digit' as const },
    { label: '7', action: () => dOnChange('7'), variant: 'digit' as const },
    { label: '8', action: () => dOnChange('8'), variant: 'digit' as const },
    { label: '9', action: () => dOnChange('9'), variant: 'digit' as const },
    { label: '.', action: () => dOnChange('.'), variant: 'action' as const },
    { label: '0', action: () => dOnChange('0'), variant: 'digit' as const },
    { label: '', action: dBackspace, variant: 'action' as const },
  ]

  const pad = (
    <>
      <div className="mb-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-center">
        {label && <p className="mb-0.5 text-[11px] font-medium text-zinc-400">{label}</p>}
        <p className={cn('text-2xl font-bold tabular-nums tracking-tight', dv ? 'text-zinc-900' : 'text-zinc-300')}>
          RM {dv || placeholder}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {buttons.map((b, i) =>
          b.label === '' ? (
            <button key={`bs-${i}`} type="button" onClick={b.action}
              className="flex h-12 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 active:bg-zinc-200 active:scale-95 transition-transform" aria-label="Backspace">
              <Delete className="h-5 w-5" />
            </button>
          ) : (
            <button key={`${b.label}-${i}`} type="button" onClick={b.action}
              className={cn('h-12 rounded-lg text-lg font-semibold active:scale-95 transition-transform',
                b.variant === 'digit' && 'bg-white border border-zinc-200 text-zinc-800 active:bg-zinc-100',
                b.variant === 'action' && 'bg-zinc-100 text-zinc-600 active:bg-zinc-200')}>
              {b.label}
            </button>
          ))}
        <button type="button" onClick={dClear}
          className="col-span-1 h-12 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-600 active:bg-red-100 active:scale-95 transition-transform">Clear</button>
        {isFloating ? (
          <button type="button" onClick={handleConfirm}
            className="col-span-2 h-12 rounded-lg bg-emerald-600 text-sm font-bold text-white active:bg-emerald-700 active:scale-95 transition-transform">{confirmLabel}</button>
        ) : showConfirm && onEnter ? (
          <button type="button" onClick={onEnter}
            className="col-span-2 h-12 rounded-lg bg-emerald-600 text-sm font-bold text-white active:bg-emerald-700 active:scale-95 transition-transform">{confirmLabel}</button>
        ) : (<div className="col-span-2" />)}
      </div>
    </>
  )

  if (isFloating) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />
        <div className="relative rounded-t-2xl bg-white p-4 pb-6 shadow-2xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300" />
          <button type="button" onClick={handleCancel}
            className="absolute right-3 top-3 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-4 w-4" />
          </button>
          {pad}
        </div>
      </div>
    )
  }

  return <div className={cn('select-none', className)}>{pad}</div>
}
