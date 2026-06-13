'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCountUp, use3dTilt } from '@/lib/hooks'
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  CircleDot,
  Clock,
  Coins,
  CreditCard,
  Gamepad2,
  Landmark,
  Play,
  Plus,
  Square,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { formatClock, gel, openBillableMinutes, paymentMethodLabel, statusMeta } from '@/lib/ui'
import type { Bank, ConsoleUnit, PaymentMethod } from '@/lib/types'
import { Modal } from './modal'
import { Analytics } from './analytics'
import { useFiscal } from '@/lib/fiscal'

const METHOD_ICON: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  transfer: ArrowLeftRight,
}
const BANKS: Bank[] = ['TBC', 'BOG']

/* live clock for the countdown display. `now` is null until mounted to avoid
   SSR/client hydration mismatch. The status/notification heartbeat lives in
   AdminShell so it keeps running on every tab. */
function useNow() {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  countup,
  formatCountup,
}: {
  icon: typeof Activity
  label: string
  value: string
  hint?: string
  countup?: number
  formatCountup?: (n: number) => string
}) {
  const { style, onMouseMove, onMouseLeave } = use3dTilt(5)
  const animated = useCountUp(countup ?? 0)
  const displayValue =
    countup !== undefined
      ? formatCountup
        ? formatCountup(animated)
        : String(Math.round(animated))
      : value

  return (
    <div
      className="nm-raised cursor-default rounded-3xl p-5"
      style={style}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <Icon className="size-5 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="mt-4 font-mono text-3xl font-extrabold tracking-tight">
        {displayValue}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function ConsoleCard({ unit, now }: { unit: ConsoleUnit; now: number | null }) {
  const { extendSession } = usePlayroom()
  const tilt = use3dTilt(4)
  const [startOpen, setStartOpen] = useState(false)
  const [extendOpen, setExtendOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)

  const meta = statusMeta[unit.status]
  const s = unit.active_session
  const isFree = unit.status === 'free' || !s
  const isOpen = !!s?.is_open

  const clock = now ?? new Date(s?.started_at ?? Date.now()).getTime()
  const remainingMs = s && s.ends_at ? new Date(s.ends_at).getTime() - clock : 0
  const totalMs = s && s.duration_min ? s.duration_min * 60_000 : 0
  const elapsed = s && !isOpen
    ? Math.min(100, Math.max(0, (1 - remainingMs / totalMs) * 100))
    : 0
  // open (pay-as-you-go): count UP from start, live cost rounded up to 5 min
  const elapsedMs = s ? clock - new Date(s.started_at).getTime() : 0
  const openMinutes = openBillableMinutes(elapsedMs)
  const openCost = s ? (openMinutes / 60) * s.price_per_hour : 0
  const isWarning =
    unit.status === 'expired' ||
    unit.status === 'warning_5' ||
    unit.status === 'warning_10'

  const neonClass =
    unit.status === 'warning_10' ? 'nm-neon-orange' :
    unit.status === 'warning_5' || unit.status === 'expired' ? 'nm-neon-red' :
    'nm-neon-blue'

  return (
    <>
      <div
        className={cn('rounded-3xl p-5', neonClass)}
        style={tilt.style}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
              <Gamepad2 className="size-5 text-primary" />
            </div>
            <div>
              <p className="font-bold leading-tight">{unit.name}</p>
              <p className="text-xs text-muted-foreground">
                სლოტი #{unit.slot_number}
              </p>
            </div>
          </div>
          <span
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              color: meta.color,
              background: `color-mix(in oklch, ${meta.color} 14%, transparent)`,
            }}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                isWarning && 'animate-pulse',
              )}
              style={{ background: meta.color }}
            />
            {meta.label}
          </span>
        </div>

        {isFree ? (
          <div className="mt-6">
            <p className="text-sm text-muted-foreground">
              კონსოლი თავისუფალია — დაიწყე ახალი სესია.
            </p>
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="nm-btn mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-primary"
            >
              <Play className="size-4" />
              სესიის დაწყება
            </button>
          </div>
        ) : isOpen ? (
          <div className="mt-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="size-1.5 animate-pulse rounded-full"
                    style={{ background: meta.color }}
                  />
                  გასული დრო • მიმდინარე
                </p>
                <p
                  className="font-mono text-3xl font-extrabold tabular-nums"
                  style={{ color: meta.color }}
                >
                  {formatClock(Math.max(0, elapsedMs))}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">მომხმარებელი</p>
                <p className="font-semibold">{s.customer_name ?? '—'}</p>
              </div>
            </div>

            {/* live running cost */}
            <div className="nm-inset mt-4 flex items-center justify-between rounded-2xl px-4 py-3">
              <span className="text-xs text-muted-foreground">
                მიმდინარე თანხა • {gel(s.price_per_hour)}/სთ
              </span>
              <span className="font-mono text-xl font-extrabold text-primary">
                {gel(openCost)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setEndOpen(true)}
              className="nm-btn mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-bold text-[var(--status-expired)]"
            >
              <Square className="size-4" />
              დასრულება და გადახდა
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">დარჩენილი დრო</p>
                <p
                  className="font-mono text-3xl font-extrabold tabular-nums"
                  style={{ color: isWarning ? meta.color : undefined }}
                >
                  {formatClock(Math.max(0, remainingMs))}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">მომხმარებელი</p>
                <p className="font-semibold">{s.customer_name ?? '—'}</p>
              </div>
            </div>

            {/* progress */}
            <div className="nm-inset mt-4 h-2.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                style={{
                  width: `${elapsed}%`,
                  background: meta.color,
                  boxShadow: `0 0 12px ${meta.color}`,
                }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{gel(s.price_total)}</span>
              <span>{s.duration_min} წთ • {gel(s.price_per_hour)}/სთ</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExtendOpen(true)}
                className="nm-btn flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-bold"
              >
                <Plus className="size-4 text-primary" />
                გაგრძელება
              </button>
              <button
                type="button"
                onClick={() => setEndOpen(true)}
                className="nm-btn flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-bold text-[var(--status-expired)]"
              >
                <Square className="size-4" />
                დასრულება
              </button>
            </div>
          </div>
        )}
      </div>

      <StartSessionModal
        open={startOpen}
        onClose={() => setStartOpen(false)}
        consoleId={unit.id}
      />
      <ExtendModal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        onConfirm={(min) => {
          extendSession(unit.id, min)
          setExtendOpen(false)
        }}
      />
      <EndSessionModal
        open={endOpen}
        onClose={() => setEndOpen(false)}
        unit={unit}
      />
    </>
  )
}

function EndSessionModal({
  open,
  onClose,
  unit,
}: {
  open: boolean
  onClose: () => void
  unit: ConsoleUnit
}) {
  const { endSession } = usePlayroom()
  const { fiscalEnabled, issueReceipt } = useFiscal()
  const [tip, setTip] = useState(0)
  const now = useNow()

  const s = unit.active_session
  if (!s) return null

  // Open sessions are billed by elapsed time (rounded up to 5 min); the stored
  // price_total is 0 until close, so compute the live amount here.
  const elapsedMs = (now ?? Date.now()) - new Date(s.started_at).getTime()
  const openMinutes = openBillableMinutes(elapsedMs)
  const base = s.is_open ? (openMinutes / 60) * s.price_per_hour : s.price_total

  return (
    <Modal open={open} onClose={onClose} title="სესიის დასრულება">
      <div className="space-y-4">
        {s.is_open && (
          <div className="nm-inset flex items-center justify-between rounded-2xl px-4 py-3">
            <span className="text-sm font-semibold text-muted-foreground">ნათამაშები დრო</span>
            <span className="font-mono text-sm font-bold">
              {formatClock(Math.max(0, elapsedMs))} → {openMinutes} წთ
            </span>
          </div>
        )}

        <div className="nm-inset flex items-center justify-between rounded-2xl px-4 py-3">
          <span className="text-sm font-semibold text-muted-foreground">ძირითადი თანხა</span>
          <span className="font-mono text-xl font-extrabold text-primary">
            {gel(base)}
          </span>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-muted-foreground">ჩაიანი (₾)</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={tip || ''}
            onChange={(e) => setTip(Number(e.target.value))}
            className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none text-primary"
          />
        </label>

        <p className="text-sm text-center font-bold">
          სულ: <span className="text-primary">{gel(base)}</span>
          {tip > 0 && <span className="text-amber-400"> + ჩაიანი {gel(tip)}</span>}
        </p>

        <button
          type="button"
          onClick={async () => {
            if (fiscalEnabled && s) {
              await issueReceipt(
                [{ name: `${unit.name} — სესია`, qty: 1, unitPrice: base }],
                base,
                paymentMethodLabel[s.payment_method],
              )
            }
            endSession(unit.id, tip)
            setTip(0)
            onClose()
          }}
          className="nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold text-[var(--status-expired)]"
        >
          <Square className="size-4" />
          დადასტურება
        </button>
      </div>
    </Modal>
  )
}

function StartSessionModal({
  open,
  onClose,
  consoleId,
}: {
  open: boolean
  onClose: () => void
  consoleId: number
}) {
  const { plans, startSession, startOpenSession } = usePlayroom()
  const activePlans = plans.filter((p) => p.is_active)
  const [planId, setPlanId] = useState(activePlans[0]?.id ?? 1)
  const [mode, setMode] = useState<'fixed' | 'open'>('fixed')
  const [duration, setDuration] = useState(60)
  const [name, setName] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [bank, setBank] = useState<Bank>('TBC')

  const plan = plans.find((p) => p.id === planId)
  const total = plan ? (duration / 60) * plan.price_per_hour : 0

  const durations = [30, 60, 90, 120]

  return (
    <Modal open={open} onClose={onClose} title="ახალი სესია">
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">
            ტარიფი
          </p>
          <div className="grid grid-cols-2 gap-3">
            {activePlans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlanId(p.id)}
                className={cn(
                  'rounded-2xl px-4 py-3 text-left text-sm font-bold',
                  p.id === planId ? 'nm-daylight text-primary' : 'nm-btn',
                )}
              >
                {p.name}
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  {gel(p.price_per_hour)}/სთ • {p.controllers} ჯოისტიკი
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">
            სესიის ტიპი
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('fixed')}
              className={cn(
                'rounded-xl py-2.5 text-sm font-bold',
                mode === 'fixed' ? 'nm-daylight text-primary' : 'nm-btn',
              )}
            >
              ფიქსირებული დრო
            </button>
            <button
              type="button"
              onClick={() => setMode('open')}
              className={cn(
                'rounded-xl py-2.5 text-sm font-bold',
                mode === 'open' ? 'nm-daylight text-primary' : 'nm-btn',
              )}
            >
              მიმდინარე (ღია)
            </button>
          </div>
        </div>

        {mode === 'fixed' ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">
              ხანგრძლივობა
            </p>
            <div className="grid grid-cols-4 gap-2">
              {durations.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={cn(
                    'rounded-xl py-2.5 font-mono text-sm font-bold',
                    d === duration ? 'nm-daylight text-primary' : 'nm-btn',
                  )}
                >
                  {d}წთ
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="nm-inset rounded-2xl px-4 py-3 text-xs text-muted-foreground text-pretty">
            მომხმარებელი გადაიხდის ნათამაშებ დროზე — თანხა დაითვლება დასრულებისას,
            5 წუთამდე დამრგვალებით ({plan ? gel(plan.price_per_hour) : '—'}/სთ).
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">
            მომხმარებელი (არასავალდებულო)
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="სახელი"
            className="nm-inset w-full rounded-2xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">
            გადახდის მეთოდი
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((m) => {
              const Icon = METHOD_ICON[m]
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-bold',
                    m === method ? 'nm-daylight text-primary' : 'nm-btn',
                  )}
                >
                  <Icon className="size-4" />
                  {paymentMethodLabel[m]}
                </button>
              )
            })}
          </div>
          {method !== 'cash' ? (
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">ბანკი</p>
              <div className="grid grid-cols-2 gap-2">
                {BANKS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBank(b)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold',
                      b === bank ? 'nm-daylight text-primary' : 'nm-btn',
                    )}
                  >
                    <Landmark className="size-4" />
                    {b}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="nm-inset flex items-center justify-between rounded-2xl px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {mode === 'fixed' ? 'სულ ღირებულება' : 'სავარაუდო ფასი'}
          </span>
          <span className="font-mono text-xl font-extrabold text-primary">
            {mode === 'fixed' ? gel(total) : `${plan ? gel(plan.price_per_hour) : '—'}/სთ`}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            if (mode === 'fixed') {
              startSession({
                console_id: consoleId,
                pricing_plan_id: planId,
                duration_min: duration,
                customer_name: name.trim() || undefined,
                payment_method: method,
                bank: method === 'cash' ? null : bank,
              })
            } else {
              startOpenSession({
                console_id: consoleId,
                pricing_plan_id: planId,
                customer_name: name.trim() || undefined,
                payment_method: method,
                bank: method === 'cash' ? null : bank,
              })
            }
            setName('')
            setMethod('cash')
            setMode('fixed')
            onClose()
          }}
          className="nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold text-primary"
        >
          <Play className="size-4" />
          {mode === 'fixed' ? 'სესიის დაწყება' : 'მიმდინარე სესიის დაწყება'}
        </button>
      </div>
    </Modal>
  )
}

function ExtendModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (min: number) => void
}) {
  const options = [15, 30, 45, 60]
  return (
    <Modal open={open} onClose={onClose} title="დროის გაგრძელება">
      <p className="mb-4 text-sm text-muted-foreground">
        აირჩიე დამატებითი დრო. ფასი დაემატება მიმდინარე ტარიფით.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onConfirm(m)}
            className="nm-btn rounded-2xl py-4 font-mono text-base font-bold text-primary"
          >
            +{m} წთ
          </button>
        ))}
      </div>
    </Modal>
  )
}

export function Dashboard() {
  const now = useNow()
  const { consoles, addConsole } = usePlayroom()
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')

  const stats = useMemo(() => {
    const active = consoles.filter((c) => c.active_session).length
    const free = consoles.filter((c) => !c.active_session).length
    const liveRevenue = consoles.reduce(
      (sum, c) => sum + (c.active_session?.price_total ?? 0),
      0,
    )
    const expiring = consoles.filter(
      (c) => c.status === 'warning_5' || c.status === 'expired',
    ).length
    return { active, free, liveRevenue, expiring }
  }, [consoles])

  // Sessions open way too long (≥ 8h) — likely "forgot to end". Warn before the
  // 24h auto-abandon (migration 0055) silently zeroes them out.
  const staleOpen = useMemo(() => {
    if (now === null) return [] as { name: string; hours: number }[]
    const EIGHT_H = 8 * 3600_000
    return consoles
      .filter((c) => c.active_session && now - new Date(c.active_session.started_at).getTime() > EIGHT_H)
      .map((c) => ({
        name: c.name,
        hours: Math.floor((now - new Date(c.active_session!.started_at).getTime()) / 3600_000),
      }))
  }, [consoles, now])

  return (
    <div className="space-y-6">
      {staleOpen.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-2xl px-4 py-3"
          style={{
            background: 'color-mix(in oklch, var(--status-warning5) 12%, transparent)',
            boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--status-warning5) 35%, transparent)',
          }}
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" style={{ color: 'var(--status-warning5)' }} />
          <div className="text-sm">
            <p className="font-bold" style={{ color: 'var(--status-warning5)' }}>
              დიდი ხანია ღია სესია — დახურვა ხომ არ დაგავიწყდათ?
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {staleOpen.map((s) => `${s.name} (${s.hours}სთ)`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div style={{ animation: 'slide-in-up 0.4s ease-out 0s both' }}>
          <StatCard icon={Activity} label="აქტიური სესია" value={String(stats.active)} countup={stats.active} hint={`${consoles.length} კონსოლიდან`} />
        </div>
        <div style={{ animation: 'slide-in-up 0.4s ease-out 0.09s both' }}>
          <StatCard icon={CircleDot} label="თავისუფალი" value={String(stats.free)} countup={stats.free} hint="მზადაა ახალი სესიისთვის" />
        </div>
        <div style={{ animation: 'slide-in-up 0.4s ease-out 0.18s both' }}>
          <StatCard icon={Coins} label="მიმდინარე შემოსავალი" value={gel(stats.liveRevenue)} countup={stats.liveRevenue} formatCountup={gel} hint="აქტიური სესიები" />
        </div>
        <div style={{ animation: 'slide-in-up 0.4s ease-out 0.27s both' }}>
          <StatCard icon={Clock} label="იწურება" value={String(stats.expiring)} countup={stats.expiring} hint="≤ 5 წუთი ან ამოწურული" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <Gamepad2 className="size-5 text-primary" />
          კონსოლები
        </h2>
        <button
          type="button"
          onClick={() => {
            setNewName('')
            setAddOpen(true)
          }}
          className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary"
        >
          <Plus className="size-4" />
          კონსოლის დამატება
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {consoles.map((unit, i) => (
          <div key={unit.id} style={{ animation: `slide-in-up 0.45s ease-out ${i * 0.07}s both` }}>
            <ConsoleCard unit={unit} now={now} />
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setNewName('')
            setAddOpen(true)
          }}
          className="nm-btn flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-3xl text-muted-foreground"
          style={{ animation: `slide-in-up 0.45s ease-out ${consoles.length * 0.07}s both` }}
        >
          <span className="nm-inset flex size-14 items-center justify-center rounded-2xl">
            <Plus className="size-6 text-primary" />
          </span>
          <span className="text-sm font-bold">ახალი კონსოლი</span>
        </button>
      </div>

      <Analytics />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="ახალი კონსოლი">
        <div className="space-y-5">
          <label className="block">
            <span className="text-sm text-muted-foreground">კონსოლის სახელი</span>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`PS5 - ${consoles.length + 1}`}
              className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="nm-btn flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-muted-foreground"
            >
              გაუქმება
            </button>
            <button
              type="button"
              onClick={() => {
                addConsole(newName)
                setAddOpen(false)
              }}
              className="nm-daylight flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-primary"
            >
              დამატება
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
