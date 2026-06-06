'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
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
import { formatClock, gel, paymentMethodLabel, statusMeta } from '@/lib/ui'
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
}: {
  icon: typeof Activity
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="nm-raised rounded-3xl p-5">
      <div className="flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <Icon className="size-5 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="mt-4 font-mono text-3xl font-extrabold tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function ConsoleCard({ unit, now }: { unit: ConsoleUnit; now: number | null }) {
  const { extendSession } = usePlayroom()
  const [startOpen, setStartOpen] = useState(false)
  const [extendOpen, setExtendOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)

  const meta = statusMeta[unit.status]
  const s = unit.active_session
  const isFree = unit.status === 'free' || !s

  const clock = now ?? new Date(s?.started_at ?? Date.now()).getTime()
  const remainingMs = s ? new Date(s.ends_at).getTime() - clock : 0
  const totalMs = s ? s.duration_min * 60_000 : 0
  const elapsed = s
    ? Math.min(100, Math.max(0, (1 - remainingMs / totalMs) * 100))
    : 0
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
      <div className={cn('rounded-3xl p-5', neonClass)}>
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

  const s = unit.active_session
  if (!s) return null

  return (
    <Modal open={open} onClose={onClose} title="სესიის დასრულება">
      <div className="space-y-4">
        <div className="nm-inset flex items-center justify-between rounded-2xl px-4 py-3">
          <span className="text-sm font-semibold text-muted-foreground">ძირითადი თანხა</span>
          <span className="font-mono text-xl font-extrabold text-primary">
            {gel(s.price_total)}
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
          სულ: <span className="text-primary">{gel(s.price_total)}</span>
          {tip > 0 && <span className="text-amber-400"> + ჩაიანი {gel(tip)}</span>}
        </p>

        <button
          type="button"
          onClick={async () => {
            if (fiscalEnabled && s) {
              await issueReceipt(
                [{ name: `${unit.name} — სესია`, qty: 1, unitPrice: s.price_total }],
                s.price_total,
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
  const { plans, startSession } = usePlayroom()
  const activePlans = plans.filter((p) => p.is_active)
  const [planId, setPlanId] = useState(activePlans[0]?.id ?? 1)
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
          <span className="text-sm text-muted-foreground">სულ ღირებულება</span>
          <span className="font-mono text-xl font-extrabold text-primary">
            {gel(total)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            startSession({
              console_id: consoleId,
              pricing_plan_id: planId,
              duration_min: duration,
              customer_name: name.trim() || undefined,
              payment_method: method,
              bank: method === 'cash' ? null : bank,
            })
            setName('')
            setMethod('cash')
            onClose()
          }}
          className="nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold text-primary"
        >
          <Play className="size-4" />
          სესიის დაწყება
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label="აქტიური სესია"
          value={String(stats.active)}
          hint={`${consoles.length} კონსოლიდან`}
        />
        <StatCard
          icon={CircleDot}
          label="თავისუფალი"
          value={String(stats.free)}
          hint="მზადაა ახალი სესიისთვის"
        />
        <StatCard
          icon={Coins}
          label="მიმდინარე შემოსავალი"
          value={gel(stats.liveRevenue)}
          hint="აქტიური სესიები"
        />
        <StatCard
          icon={Clock}
          label="იწურება"
          value={String(stats.expiring)}
          hint="≤ 5 წუთი ან ამოწურული"
        />
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
        {consoles.map((unit) => (
          <ConsoleCard key={unit.id} unit={unit} now={now} />
        ))}
        <button
          type="button"
          onClick={() => {
            setNewName('')
            setAddOpen(true)
          }}
          className="nm-btn flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-3xl text-muted-foreground"
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
