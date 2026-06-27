'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
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
  Gift,
  Landmark,
  Play,
  Plug,
  Plus,
  QrCode,
  ScanLine,
  Search,
  Square,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { formatClock, gel, openBillableMinutes, paymentMethodLabel, statusMeta, consoleLabels, consoleCategory, planAppliesToConsole, venueLabels } from '@/lib/ui'
import type { Bank, ConsoleUnit, PaymentMethod } from '@/lib/types'
import { Modal } from './modal'
import { Analytics } from './analytics'
import { InSeatAccessModal } from './inseat-access-modal'
import { DailyBrief } from './daily-brief'
import { useFiscal } from '@/lib/fiscal'

const BarcodeScanner = dynamic(() => import('./barcode-scanner'), { ssr: false })

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
      <p className="mt-4 font-mono text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums break-words">
        {displayValue}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function ConsoleCard({ unit, now }: { unit: ConsoleUnit; now: number | null }) {
  const { extendSession, changeSessionTier, hardwareRequired } = usePlayroom()
  const tilt = use3dTilt(4)
  const [startOpen, setStartOpen] = useState(false)
  const [extendOpen, setExtendOpen] = useState(false)
  const [tierOpen, setTierOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const [billOpen, setBillOpen] = useState(false)

  const meta = statusMeta[unit.status]
  const s = unit.active_session
  const isFree = unit.status === 'free' || !s
  const isOpen = !!s?.is_open
  // strict mode: block starting a session on a console with no active hardware
  const hwBlocked = hardwareRequired && !(unit.hardware && unit.hardware.is_active)

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

  const accessChip = s?.portal_code ? (
    <button
      type="button"
      onClick={() => setAccessOpen(true)}
      className="nm-btn mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-bold text-muted-foreground"
    >
      <QrCode className="size-4 text-primary" />
      In-Seat კოდი · <span className="font-mono tracking-widest text-primary">{s.portal_code}</span>
    </button>
  ) : null

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
              {consoleCategory(unit.console_type) === 'playroom'
                ? <Gamepad2 className="size-5 text-primary" />
                : <span className="text-2xl leading-none">{consoleLabels(unit.console_type).icon}</span>}
            </div>
            <div>
              <p className="font-bold leading-tight">{unit.name}</p>
              <p className="text-xs text-muted-foreground">
                სლოტი #{unit.slot_number}
              </p>
              {unit.hardware && (
                <p
                  className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-muted-foreground"
                  title={`Hardware: ${unit.hardware.last_known_state} · ${unit.hardware.driver}`}
                >
                  <Plug
                    className="size-3"
                    style={{
                      color:
                        unit.hardware.last_known_state === 'on' ? 'var(--status-free)' :
                        unit.hardware.last_known_state === 'unknown' ? 'var(--status-warning5)' :
                        'var(--muted-foreground)',
                    }}
                  />
                  {unit.hardware.last_known_state === 'on' ? 'ჩართული' :
                   unit.hardware.last_known_state === 'off' ? 'გამორთული' : '—'}
                </p>
              )}
              {typeof unit.health_score === 'number' && unit.health_score <= 50 && (
                <p
                  className="mt-0.5 flex items-center gap-1 text-[10px] font-bold"
                  title={`ჯანმრთელობა ${unit.health_score}% · ${unit.total_sessions_count ?? 0} სესია`}
                  style={{ color: unit.health_score <= 20 ? 'var(--status-expired)' : 'var(--status-warning5)' }}
                >
                  <Wrench className="size-3" />
                  მოვლა რეკომენდებულია
                </p>
              )}
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
              {hwBlocked
                ? 'სესიის დასაწყებად ჯერ დააკონფიგურირე Hardware (პარამეტრები → 🔌).'
                : `${consoleLabels(unit.console_type).singular} თავისუფალია — დაიწყე ახალი სესია.`}
            </p>
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              disabled={hwBlocked}
              className="nm-btn mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="font-mono text-2xl sm:text-3xl font-extrabold tabular-nums"
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
            <button
              type="button"
              onClick={() => setBillOpen(true)}
              className="nm-btn mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-bold text-muted-foreground"
            >
              🧾 ანგარიში — რა შეუკვეთა
            </button>
            {accessChip}
          </div>
        ) : (
          <div className="mt-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">დარჩენილი დრო</p>
                <p
                  className="font-mono text-2xl sm:text-3xl font-extrabold tabular-nums"
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
            {!isOpen && (
              <button
                type="button"
                onClick={() => setTierOpen(true)}
                className="nm-btn mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-bold text-primary"
              >
                🎮 ჯოისტიკი / ტარიფის შეცვლა
              </button>
            )}
            <button
              type="button"
              onClick={() => setBillOpen(true)}
              className="nm-btn mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-bold text-muted-foreground"
            >
              🧾 ანგარიში — რა შეუკვეთა
            </button>
            {accessChip}
          </div>
        )}
      </div>

      <StartSessionModal
        open={startOpen}
        onClose={() => setStartOpen(false)}
        consoleId={unit.id}
        consoleType={unit.console_type}
      />
      <ExtendModal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        onConfirm={(min) => {
          extendSession(unit.id, min)
          setExtendOpen(false)
        }}
      />
      <TierModal
        open={tierOpen}
        onClose={() => setTierOpen(false)}
        consoleType={unit.console_type}
        currentPlanId={s?.pricing_plan_id ?? 0}
        onConfirm={(planId) => {
          changeSessionTier(unit.id, planId)
          setTierOpen(false)
        }}
      />
      <EndSessionModal
        open={endOpen}
        onClose={() => setEndOpen(false)}
        unit={unit}
      />
      <LiveBillModal open={billOpen} onClose={() => setBillOpen(false)} unit={unit} />
      {s?.portal_code && (
        <InSeatAccessModal
          open={accessOpen}
          onClose={() => setAccessOpen(false)}
          consoleId={unit.id}
          consoleName={unit.name}
          code={s.portal_code}
        />
      )}
    </>
  )
}

type BillItem = { name: string; qty: number; line_total: number }
type SessionBill = {
  play_amount: number; play_paid: boolean
  paid_items: BillItem[]; paid_bar_total: number
  tab_items: BillItem[]; tab_total: number
  tab_extension: number; red_total: number
  grand_total: number; credit_discount?: number
}

// Read-only live bill the OPERATOR sees mid-session — the SAME data the customer sees
// on /p (get_session_bill -> compute_session_bill). Lets staff reconcile what was
// ordered/added instead of relying on the customer's goodwill.
function LiveBillModal({ open, onClose, unit }: { open: boolean; onClose: () => void; unit: ConsoleUnit }) {
  const [bill, setBill] = useState<SessionBill | null>(null)
  const sid = unit.active_session?.id
  useEffect(() => {
    if (!open || !sid) { setBill(null); return }
    ;(supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }>)(
      'get_session_bill', { p_session_id: sid },
    ).then(({ data }) => {
      const d = data as (SessionBill & { error?: string }) | null
      if (d && !d.error) setBill(d)
    })
  }, [open, sid])

  const empty = bill && (bill.paid_items?.length ?? 0) === 0 && (bill.tab_items?.length ?? 0) === 0 && (bill.tab_extension ?? 0) === 0

  return (
    <Modal open={open} onClose={onClose} title="ანგარიში — რა შეუკვეთა">
      {!bill ? (
        <p className="py-8 text-center text-sm text-muted-foreground">იტვირთება…</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className={bill.play_paid ? 'text-[var(--status-free)]' : 'text-[var(--status-expired)]'}>
              {bill.play_paid ? '🟢' : '🔴'} თამაში
            </span>
            <span className="font-mono">{gel(bill.play_amount)}</span>
          </div>
          {bill.paid_items?.map((it, i) => (
            <div key={`p${i}`} className="flex justify-between text-[var(--status-free)]">
              <span>🟢 {it.qty}× {it.name}</span><span className="font-mono">{gel(it.line_total)}</span>
            </div>
          ))}
          {bill.tab_items?.map((it, i) => (
            <div key={`t${i}`} className="flex justify-between text-[var(--status-expired)]">
              <span>🔴 {it.qty}× {it.name}</span><span className="font-mono">{gel(it.line_total)}</span>
            </div>
          ))}
          {bill.tab_extension > 0 && (
            <div className="flex justify-between text-[var(--status-expired)]">
              <span>🔴 ⏱️ დროის გაგრძელება</span><span className="font-mono">{gel(bill.tab_extension)}</span>
            </div>
          )}
          {empty && <p className="text-xs text-muted-foreground">ბარიდან ჯერ არაფერი შეუკვეთავს.</p>}
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-black">
            <span>სულ</span><span className="font-mono text-primary">{gel(bill.grand_total)}</span>
          </div>
          {bill.red_total > 0 && (
            <p className="text-[11px] text-[var(--status-expired)]">
              🔴 გადასახდელი: {gel(bill.red_total)} — ტაბი, სესიის ბოლოს
            </p>
          )}
        </div>
      )}
    </Modal>
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
  const { endSession, pushToast } = usePlayroom()
  const { fiscalEnabled, issueReceipt } = useFiscal()
  const [tip, setTip] = useState(0)
  const [bill, setBill] = useState<SessionBill | null>(null)
  const [settleM, setSettleM] = useState<{ m: string; b: string | null } | null>(null)
  const [creditInput, setCreditInput] = useState('')
  const [credit, setCredit] = useState<{ id: string; remaining: number; note: string | null } | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const now = useNow()

  const sid = unit.active_session?.id
  useEffect(() => {
    if (!open || !sid) { setBill(null); setSettleM(null); setCredit(null); setCreditInput(''); return }
    ;(supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }>)(
      'get_session_bill', { p_session_id: sid },
    ).then(({ data }) => {
      const d = data as (SessionBill & { error?: string }) | null
      if (d && !d.error) setBill(d)
    })
  }, [open, sid])

  // look up a tournament free-time credit by its short code (or scanned MTLC:<id>).
  // RLS only exposes credits for the operator's own org → venue-scoped automatically.
  const lookupCredit = async (raw: string) => {
    const v = raw.trim().replace(/^MTLC:/i, '')
    if (!v) { setCredit(null); return }
    const isUuid = v.length > 20
    const base = (supabase as unknown as { from: (t: string) => any }).from('customer_credits')
      .select('id, minutes, minutes_used, note').eq('status', 'active')
    const { data } = await (isUuid ? base.eq('id', v) : base.ilike('code', v)).limit(1)
    const c = data?.[0]
    setCredit(c ? { id: c.id, remaining: Number(c.minutes) - Number(c.minutes_used), note: c.note ?? null } : null)
  }

  const s = unit.active_session
  if (!s) return null

  // owed-at-end = bar tab + unpaid time-extensions (both settled by settle_session_tab)
  const owedTab = (bill?.tab_total ?? 0) + (bill?.tab_extension ?? 0)

  // Open sessions are billed by elapsed time (rounded up to 5 min); the stored
  // price_total is 0 until close, so compute the live amount here.
  const elapsedMs = (now ?? Date.now()) - new Date(s.started_at).getTime()
  const openMinutes = openBillableMinutes(elapsedMs)
  const base = s.is_open ? (openMinutes / 60) * s.price_per_hour : s.price_total

  // free-time credit discounts the PLAY charge: remaining minutes × rate, capped at the play total
  const estDiscount = credit ? Math.min(Math.round((credit.remaining / 60) * s.price_per_hour * 100) / 100, base) : 0
  const effBase = Math.max(0, base - estDiscount)

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
          <span className="text-sm font-semibold text-muted-foreground">თამაში</span>
          <span className="font-mono text-xl font-extrabold text-primary">
            {gel(base)}
          </span>
        </div>

        {bill && (bill.paid_bar_total > 0 || owedTab > 0) && (
          <div className="nm-inset space-y-1.5 rounded-2xl p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">ბარი</p>
            {bill.paid_items?.map((it, i) => (
              <div key={`p${i}`} className="flex justify-between text-xs">
                <span className="text-[var(--status-free)]">🟢 {it.qty}× {it.name}</span>
                <span className="font-mono text-[var(--status-free)]">{gel(it.line_total)}</span>
              </div>
            ))}
            {bill.tab_items?.map((it, i) => (
              <div key={`t${i}`} className="flex justify-between text-xs">
                <span className="text-[var(--status-expired)]">🔴 {it.qty}× {it.name}</span>
                <span className="font-mono text-[var(--status-expired)]">{gel(it.line_total)}</span>
              </div>
            ))}
            {bill.tab_extension > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-[var(--status-expired)]">🔴 ⏱️ დროის გაგრძელება</span>
                <span className="font-mono text-[var(--status-expired)]">{gel(bill.tab_extension)}</span>
              </div>
            )}
            {owedTab > 0 && (
              <div className="mt-1.5 border-t border-border pt-2">
                <p className="mb-1.5 text-[11px] font-bold text-[var(--status-expired)]">
                  🔴 გადასახდელი ტაბი: {gel(owedTab)} — აირჩიე გადახდა:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setSettleM({ m: 'cash', b: null })} className={`nm-btn rounded-xl py-2 text-xs font-bold ${settleM?.m === 'cash' ? 'nm-daylight text-primary' : ''}`}>ნაღდი</button>
                  <button type="button" onClick={() => setSettleM({ m: 'card', b: 'TBC' })} className={`nm-btn rounded-xl py-2 text-xs font-bold ${settleM?.b === 'TBC' ? 'nm-daylight text-primary' : ''}`}>TBC</button>
                  <button type="button" onClick={() => setSettleM({ m: 'card', b: 'BOG' })} className={`nm-btn rounded-xl py-2 text-xs font-bold ${settleM?.b === 'BOG' ? 'nm-daylight text-primary' : ''}`}>BOG</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* tournament free-time credit — operator enters/scans the player's code */}
        <div className="nm-inset rounded-2xl p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Gift className="size-3.5" /> უფასო წუთები (პრიზის კრედიტი)
          </p>
          <div className="flex gap-2">
            <input
              value={creditInput}
              onChange={(e) => { setCreditInput(e.target.value); lookupCredit(e.target.value) }}
              placeholder="კოდი (მაგ. A1B2C3)"
              className="nm-inset min-w-0 flex-1 rounded-xl px-3 py-2 text-sm uppercase outline-none"
            />
            <button type="button" onClick={() => setScanOpen(true)} className="nm-btn flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-primary">
              <ScanLine className="size-4" /> QR
            </button>
          </div>
          {credit && (
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-[var(--status-free)]">🎁 {credit.note ?? 'უფასო დრო'} · {credit.remaining} წთ</span>
              <span className="font-mono font-bold text-[var(--status-free)]">−{gel(estDiscount)}</span>
            </div>
          )}
          {creditInput.trim() && !credit && (
            <p className="mt-2 text-xs text-[var(--status-expired)]">კოდი ვერ მოიძებნა ან გამოყენებულია</p>
          )}
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
          {estDiscount > 0 && (
            <span className="block text-xs font-normal text-[var(--status-free)]">🎁 პრიზის ფასდაკლება: −{gel(estDiscount)}</span>
          )}
          სულ: <span className="text-primary">{gel(effBase + (bill?.paid_bar_total ?? 0) + owedTab)}</span>
          {bill && (bill.paid_bar_total + owedTab) > 0 && (
            <span className="text-xs text-muted-foreground"> (თამაში {gel(effBase)} + ბარი/დრო {gel(bill.paid_bar_total + owedTab)})</span>
          )}
          {tip > 0 && <span className="text-amber-400"> + ჩაიანი {gel(tip)}</span>}
        </p>

        <button
          type="button"
          disabled={!!bill && owedTab > 0 && !settleM}
          onClick={async () => {
            if (bill && owedTab > 0 && settleM) {
              const { error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(
                'settle_session_tab', { p_session_id: s.id, p_payment_method: settleM.m, p_bank: settleM.b },
              )
              if (error) { pushToast('danger', 'ტაბის გადახდა ვერ მოხერხდა'); return }
            }
            if (fiscalEnabled && s) {
              await issueReceipt(
                [{ name: `${unit.name} — სესია`, qty: 1, unitPrice: effBase }],
                effBase,
                paymentMethodLabel[s.payment_method],
              )
            }
            await endSession(unit.id, tip)
            // free-time credit applies AFTER end (price_total is final) → reduces the recorded play revenue
            if (credit && creditInput.trim()) {
              const { data, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
                'apply_credit_to_session', { p_session_id: s.id, p_code: creditInput.trim() },
              )
              if (error) pushToast('danger', 'კრედიტი ვერ გამოყენდა — სცადე ხელახლა')
              else {
                const d = data as { discount: number; minutes: number }
                pushToast('success', `🎁 ${d.minutes} წთ უფასო გამოყენდა (−${gel(d.discount)})`)
              }
            }
            setTip(0); setBill(null); setSettleM(null); setCredit(null); setCreditInput('')
            onClose()
          }}
          className="nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold text-[var(--status-expired)] disabled:opacity-50"
        >
          <Square className="size-4" />
          {bill && owedTab > 0 ? 'გადახდა და დასრულება' : 'დადასტურება'}
        </button>
      </div>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(raw: string) => { setScanOpen(false); const v = raw.replace(/^MTLC:/i, ''); setCreditInput(v); lookupCredit(raw) }}
      />
    </Modal>
  )
}

function StartSessionModal({
  open,
  onClose,
  consoleId,
  consoleType,
}: {
  open: boolean
  onClose: () => void
  consoleId: number
  consoleType?: string
}) {
  const { plans, startSession, startOpenSession, pushToast } = usePlayroom()
  const { currentVenueId, currentOrgId } = useOrg()
  type Cust = { id: string; name: string; phone: string | null; points: number; discount_pct: number }
  // only tariffs that apply to this console's class + sub-type; fall back to all if none match
  const allActive = plans.filter((p) => p.is_active)
  const matched = allActive.filter((p) => planAppliesToConsole(p, consoleType))
  const activePlans = matched.length ? matched : allActive
  const [planId, setPlanId] = useState(activePlans[0]?.id ?? 1)
  const [mode, setMode] = useState<'fixed' | 'open'>('fixed')
  const [duration, setDuration] = useState(60)
  const [name, setName] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [bank, setBank] = useState<Bank>('TBC')
  const [customer, setCustomer] = useState<Cust | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [searching, setSearching] = useState(false)

  // Loyalty identity: resolve a customer by scanned QR (MTLP:<id>) or phone/name search,
  // so the session links to them (points accrue) and the operator sees their balance.
  const resolveCustomerById = async (id: string) => {
    const { data } = await supabase.from('customers').select('id, name, phone, points, discount_pct').eq('id', id).maybeSingle()
    if (data) { setCustomer(data as unknown as Cust); setName((data as unknown as Cust).name ?? '') }
    else pushToast('danger', 'კლიენტი ვერ მოიძებნა')
  }
  // Marketplace passport QR (MTLM:<marketplace_id>) -> find/create + link a local customer (0130)
  const resolveMarketplace = async (mid: string) => {
    if (!currentOrgId) { pushToast('danger', 'ორგანიზაცია არ არის არჩეული'); return }
    const { data, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
      'link_marketplace_customer', { p_org: currentOrgId, p_marketplace_id: mid.trim() },
    )
    if (error || !data) { pushToast('danger', 'passport: ' + (error?.message ?? 'ცარიელი პასუხი')); return }
    setCustomer(data as unknown as Cust); setName((data as unknown as Cust).name ?? '')
  }
  const searchCustomer = async () => {
    const q = name.trim()
    if (q.length < 3) { pushToast('info', 'ჩაწერე სახელი ან ტელეფონი (3+ სიმბოლო)'); return }
    setSearching(true)
    const { data } = await supabase.from('customers').select('id, name, phone, points, discount_pct')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(1)
    setSearching(false)
    if (data && data.length) { setCustomer(data[0] as unknown as Cust); setName((data[0] as unknown as Cust).name) }
    else pushToast('info', 'ვერ მოიძებნა — დარჩება სტუმრად ან დაამატე "კლიენტებში"')
  }

  const plan = plans.find((p) => p.id === planId)

  // Live dynamic-price quote for the selected plan (matches the server-side trigger).
  const [dyn, setDyn] = useState<{ price: number; multiplier: number; rule_name?: string } | null>(null)
  useEffect(() => {
    if (!open || !plan || !currentVenueId) { setDyn(null); return }
    let alive = true
    ;(supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: any }>)(
      'dynamic_price_quote',
      { p_venue_id: currentVenueId, p_base: plan.price_per_hour, p_when: new Date().toISOString() },
    ).then(({ data }) => { if (alive) setDyn(data ?? null) })
    return () => { alive = false }
  }, [open, planId, currentVenueId, plan?.price_per_hour])

  const effRate = dyn?.price ?? plan?.price_per_hour ?? 0
  const dynActive = !!dyn && Number(dyn.multiplier) !== 1
  const total = (duration / 60) * effRate

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
                  {gel(p.price_per_hour)}/სთ{consoleCategory(consoleType) === 'playroom' ? ` • ${p.controllers} ჯოისტიკი` : ''}
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
          {customer ? (
            <div className="nm-inset flex items-center justify-between gap-2 rounded-2xl px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-bold">👤 {customer.name}</p>
                <p className="text-xs text-muted-foreground">
                  {customer.phone ?? ''} · <b className="text-primary">{customer.points} ქულა</b>
                  {customer.discount_pct > 0 ? ` · ${customer.discount_pct}% ფასდაკლება` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setCustomer(null); setName('') }}
                className="nm-btn shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold text-muted-foreground"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchCustomer() }}
                placeholder="სახელი / ტელეფონი"
                className="nm-inset w-full rounded-2xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button type="button" onClick={searchCustomer} disabled={searching} title="ძებნა"
                className="nm-btn shrink-0 rounded-2xl px-3.5 text-primary disabled:opacity-50">
                <Search className="size-4" />
              </button>
              <button type="button" onClick={() => setScanOpen(true)} title="QR სკანი"
                className="nm-btn shrink-0 rounded-2xl px-3.5 text-primary">
                <ScanLine className="size-4" />
              </button>
            </div>
          )}
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

        {dynActive && (
          <div
            className="flex items-center justify-between rounded-2xl px-4 py-2 text-xs font-bold"
            style={{
              background: `color-mix(in oklch, ${dyn!.multiplier < 1 ? 'var(--status-free)' : 'var(--status-expired)'} 14%, transparent)`,
              color: dyn!.multiplier < 1 ? 'var(--status-free)' : 'var(--status-expired)',
            }}
          >
            <span>⚡ {dyn!.rule_name ?? 'დინამიური ფასი'}</span>
            <span className="tabular-nums">{plan ? gel(plan.price_per_hour) : ''} → {gel(effRate)}/სთ</span>
          </div>
        )}
        <div className="nm-inset flex items-center justify-between rounded-2xl px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {mode === 'fixed' ? 'სულ ღირებულება' : 'სავარაუდო ფასი'}
          </span>
          <span className="font-mono text-xl font-extrabold text-primary">
            {mode === 'fixed' ? gel(total) : `${gel(effRate)}/სთ`}
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
                customer_name: customer?.name ?? (name.trim() || undefined),
                customer_id: customer?.id,
                payment_method: method,
                bank: method === 'cash' ? null : bank,
              })
            } else {
              startOpenSession({
                console_id: consoleId,
                pricing_plan_id: planId,
                customer_name: customer?.name ?? (name.trim() || undefined),
                customer_id: customer?.id,
                payment_method: method,
                bank: method === 'cash' ? null : bank,
              })
            }
            setName('')
            setCustomer(null)
            setMethod('cash')
            setMode('fixed')
            onClose()
          }}
          className="nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold text-primary"
        >
          <Play className="size-4" />
          {mode === 'fixed' ? 'სესიის დაწყება' : 'მიმდინარე სესიის დაწყება'}
        </button>
        <BarcodeScanner
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          onScan={(text) => {
            setScanOpen(false)
            const t = text.trim()
            // DIAGNOSTIC: show exactly what the camera decoded, so a "no reaction" report
            // becomes "it read X" — pinpoints decode vs handler vs RPC.
            pushToast('info', 'წავიკითხე: ' + (t.length > 44 ? t.slice(0, 44) + '…' : t || '(ცარიელი)'))
            if (t.startsWith('MTLM:')) resolveMarketplace(t.slice(5))
            else resolveCustomerById(t.startsWith('MTLP:') ? t.slice(5) : t)
          }}
        />
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

function TierModal({
  open,
  onClose,
  consoleType,
  currentPlanId,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  consoleType?: string | null
  currentPlanId: number
  onConfirm: (planId: number) => void
}) {
  const { plans } = usePlayroom()
  const applicable = plans.filter((p) => p.is_active && planAppliesToConsole(p, consoleType))
  return (
    <Modal open={open} onClose={onClose} title="ჯოისტიკი / ტარიფის შეცვლა">
      <p className="mb-4 text-sm text-muted-foreground text-pretty">
        აირჩიე ახალი ტარიფი. გადახდილი თანხა გადაითვლება ახალ ფასზე — დარჩენილი დრო შესაბამისად შემოკლდება/გაიზრდება (ფული უცვლელია).
      </p>
      <div className="space-y-2">
        {applicable.map((p) => {
          const isCurrent = p.id === currentPlanId
          return (
            <button
              key={p.id}
              type="button"
              disabled={isCurrent}
              onClick={() => onConfirm(p.id)}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ${
                isCurrent ? 'nm-inset opacity-50' : 'nm-btn'
              }`}
            >
              <span className="text-sm font-bold">
                {p.name}
                {isCurrent ? ' (მიმდინარე)' : ''}
              </span>
              <span className="font-mono text-sm text-primary">
                {gel(p.price_per_hour)}/სთ · {p.controllers} ჯ
              </span>
            </button>
          )
        })}
        {applicable.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">ტარიფი არ მოიძებნა</p>
        )}
      </div>
    </Modal>
  )
}

export function Dashboard() {
  const now = useNow()
  const { consoles, addConsole, venueType } = usePlayroom()
  const vl = venueLabels(venueType)
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
      <div className="flex justify-end">
        <DailyBrief />
      </div>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-4">
        <div style={{ animation: 'slide-in-up 0.4s ease-out 0s both' }}>
          <StatCard icon={Activity} label="აქტიური სესია" value={String(stats.active)} countup={stats.active} hint={`სულ ${consoles.length} ${vl.singular}`} />
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
          {venueType === 'playroom'
            ? <Gamepad2 className="size-5 text-primary" />
            : <span className="text-xl leading-none">{vl.icon}</span>}
          {vl.plural}
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
          {vl.genitive} დამატება
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
          <span className="text-sm font-bold">ახალი {vl.singular}</span>
        </button>
      </div>

      <Analytics />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={`ახალი ${vl.singular}`}>
        <div className="space-y-5">
          <label className="block">
            <span className="text-sm text-muted-foreground">{vl.genitive} სახელი</span>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={venueType === 'playroom' ? `PS5 - ${consoles.length + 1}` : `${vl.singular} ${consoles.length + 1}`}
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
