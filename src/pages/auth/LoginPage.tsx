import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MonitorSmartphone, Lock } from 'lucide-react'
import { db } from '@/db'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function LoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) setPin((p) => p + digit)
  }

  const handleClear = () => {
    setPin('')
    setError('')
  }

  const handleLogin = async () => {
    if (pin.length !== 4) {
      setError('Sila masukkan PIN 4 digit')
      return
    }
    setLoading(true)
    setError('')
    try {
      const staff = await db.staff.filter((s) => s.pin === pin && s.isActive).first()
      if (!staff) {
        setError('PIN tidak sah')
        setPin('')
      } else {
        login(staff)
        const roleHome: Record<string, string> = {
          admin:   '/cashier',
          cashier: '/cashier',
          waiter:  '/tables',
          kitchen: '/kitchen',
        }
        navigate(roleHome[staff.role] ?? '/cashier')
      }
    } finally {
      setLoading(false)
    }
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-xs">
        <CardHeader className="items-center text-center pb-3">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <MonitorSmartphone className="h-5 w-5 text-white" />
          </div>
          <CardTitle className="text-base font-bold text-zinc-900">CrossxPOS</CardTitle>
          <CardDescription>Enter your PIN to sign in</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {/* PIN display */}
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-bold transition-colors ${pin[i] ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-zinc-200 bg-white text-zinc-300'}`}
              >
                {pin[i] ? '●' : '–'}
              </div>
            ))}
          </div>

          {error && <p className="text-xs font-medium text-red-500">{error}</p>}

          {/* Numpad */}
          <div className="grid w-full grid-cols-3 gap-1.5">
            {digits.map((d, i) => (
              <button
                key={i}
                disabled={d === '' || loading}
                onClick={() => {
                  if (d === '⌫') setPin((p) => p.slice(0, -1))
                  else if (d !== '') handlePinInput(d)
                }}
                className="flex h-12 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base font-semibold text-zinc-800 transition hover:bg-zinc-50 hover:border-zinc-300 disabled:invisible active:scale-95"
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={handleClear}>
              Clear
            </Button>
            <Button className="flex-1" onClick={handleLogin} disabled={loading}>
              <Lock className="h-3.5 w-3.5" />
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
