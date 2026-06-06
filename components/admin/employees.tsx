'use client'

import { useState } from 'react'
import { Delete, LogIn, ShieldCheck, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { dateLabel, timeOfDay } from '@/lib/ui'

function PinPad() {
  const { clockToggle } = usePlayroom()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(
    null,
  )

  const press = async (d: string) => {
    if (pin.length >= 4 || busy) return
    const next = pin + d
    setPin(next)
    setFeedback(null)
    if (next.length === 4) {
      setBusy(true)
      const res = await clockToggle(next)
      setFeedback(res)
      setBusy(false)
      setTimeout(() => setPin(''), 800)
    }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="nm-raised rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <LogIn className="size-5 text-primary" />
        </div>
        <div>
          <p className="font-extrabold">Clock In / Out</p>
          <p className="text-xs text-muted-foreground">შეიყვანე 4-ნიშნა PIN</p>
        </div>
      </div>

      {/* pin dots */}
      <div className="mt-6 flex justify-center gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'size-4 rounded-full transition-all',
              i < pin.length
                ? 'bg-primary shadow-[0_0_12px_var(--primary)]'
                : 'nm-inset',
            )}
          />
        ))}
      </div>

      {feedback ? (
        <p
          className="mt-4 text-center text-sm font-semibold"
          style={{
            color: feedback.ok ? 'var(--status-free)' : 'var(--status-expired)',
          }}
        >
          {feedback.message}
        </p>
      ) : (
        <p className="mt-4 h-5 text-center text-sm text-muted-foreground">
          {' '}
        </p>
      )}

      <div className="mx-auto mt-6 grid max-w-[260px] grid-cols-3 gap-3">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="nm-btn aspect-square rounded-2xl font-mono text-xl font-bold"
          >
            {k}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => press('0')}
          className="nm-btn aspect-square rounded-2xl font-mono text-xl font-bold"
        >
          0
        </button>
        <button
          type="button"
          aria-label="წაშლა"
          onClick={() => {
            setPin((p) => p.slice(0, -1))
            setFeedback(null)
          }}
          className="nm-btn flex aspect-square items-center justify-center rounded-2xl"
        >
          <Delete className="size-5 text-muted-foreground" />
        </button>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        სადემო PIN-ები: 1234 / 2580
      </p>
    </div>
  )
}

export function Employees() {
  const { employees, shifts } = usePlayroom()

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <PinPad />
      </div>

      <div className="space-y-6 lg:col-span-3">
        {/* roster */}
        <div className="nm-raised rounded-3xl p-6">
          <h3 className="text-base font-extrabold">თანამშრომლები</h3>
          <ul className="mt-4 space-y-3">
            {employees.map((e) => {
              const onShift = shifts.some(
                (s) => s.employee_id === e.id && !s.clock_out,
              )
              return (
                <li
                  key={e.id}
                  className="nm-inset flex items-center justify-between rounded-2xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-2)]">
                      {e.role === 'admin' ? (
                        <ShieldCheck className="size-5 text-primary" />
                      ) : (
                        <User className="size-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold leading-tight">{e.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.role === 'admin' ? 'ადმინი' : 'ოპერატორი'}
                        {!e.is_active ? ' • არააქტიური' : ''}
                      </p>
                    </div>
                  </div>
                  <span
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      color: onShift
                        ? 'var(--status-free)'
                        : 'var(--muted-foreground)',
                      background: onShift
                        ? 'color-mix(in oklch, var(--status-free) 14%, transparent)'
                        : 'transparent',
                    }}
                  >
                    {onShift ? (
                      <span className="size-1.5 rounded-full bg-[var(--status-free)]" />
                    ) : null}
                    {onShift ? 'ცვლაშია' : 'არ არის'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        {/* shift log */}
        <div className="nm-raised rounded-3xl p-6">
          <h3 className="text-base font-extrabold">ცვლების ჟურნალი</h3>
          <ul className="mt-4 space-y-2">
            {shifts.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-semibold">{s.employee_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateLabel(s.clock_in)} • {timeOfDay(s.clock_in)} —{' '}
                    {s.clock_out ? timeOfDay(s.clock_out) : 'მიმდინარე'}
                  </p>
                </div>
                <span className="text-sm font-bold text-primary">
                  {s.hours_worked != null ? (
                    <>
                      <span className="font-mono">
                        {s.hours_worked.toFixed(1)}
                      </span>{' '}
                      სთ
                    </>
                  ) : (
                    '—'
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
