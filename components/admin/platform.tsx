'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Coins,
  Eye,
  Pause,
  Play,
  ShieldCheck,
  Users2,
  Wallet,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'
import { ApiKeysPanel } from './api-keys-panel'

// Plan prices — single source of truth is plan_monthly_price() in the DB (see
// migration 0040). These mirror it only for the plan-dropdown labels. Keep in
// sync with billing.tsx (Trial free / Pro ₾50 / Enterprise ₾70).
const PLAN_PRICE: Record<string, number> = { trial: 0, pro: 50, enterprise: 70 }
const PLANS = ['trial', 'pro', 'enterprise'] as const
const PAY_MONTHS = [1, 3, 6, 12] as const

interface OrgRow {
  id: string
  name: string | null
  plan: string | null
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  monthly_amount: number | null
  created_at: string | null
  member_count: number | null
  venue_count: number | null
  total_revenue: number | null
  last_payment_at: string | null
  total_paid: number | null
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: 'აქტიური', color: 'var(--status-free)' },
  trialing: { label: 'საცდელი', color: 'var(--status-active)' },
  past_due: { label: 'ვადაგადაცილებული', color: 'var(--status-warning5)' },
  canceled: { label: 'შეჩერებული', color: 'var(--status-expired)' },
}

const DAY = 86_400_000

// Due date = paid-until; for a tenant still on trial fall back to the trial end.
function dueDate(r: OrgRow): string | null {
  return r.current_period_end ?? (r.subscription_status === 'trialing' ? r.trial_ends_at : null)
}
function daysLeft(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / DAY)
}
// Overdue = past the due date and not already suspended (suspension shows its own state).
function isOverdue(r: OrgRow): boolean {
  const d = dueDate(r)
  return !!d && new Date(d).getTime() < Date.now() && r.subscription_status !== 'canceled'
}
function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ka-GE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function PlatformConsole({ onViewAs }: { onViewAs: () => void }) {
  const { pushToast } = usePlayroom()
  const { setCurrentOrg, refresh } = useOrg()
  const [rows, setRows] = useState<OrgRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [payMonths, setPayMonths] = useState<Record<string, number>>({})
  const [tgLinked, setTgLinked] = useState<boolean | null>(null)
  const [tgCode, setTgCode] = useState<string | null>(null)

  const load = async () => {
    const { data } = await supabase
      .from('platform_org_overview')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setRows(data as OrgRow[])
  }

  useEffect(() => {
    load()
    ;(supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: { linked?: boolean } | null }>)('platform_telegram_status', {})
      .then(({ data }) => setTgLinked(!!data?.linked))
  }, [])

  const genTelegramCode = async () => {
    const { data } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: { ok?: boolean; code?: string } | null }>)('create_platform_telegram_code', {})
    if (data?.ok && data.code) setTgCode(data.code)
    else pushToast('danger', 'ვერ მოხერხდა — სცადე თავიდან')
  }

  const mrr = rows
    .filter((r) => r.subscription_status === 'active')
    .reduce((sum, r) => sum + Number(r.monthly_amount ?? 0), 0)
  const activeCount = rows.filter((r) => r.subscription_status === 'active').length
  const trialCount = rows.filter((r) => r.subscription_status === 'trialing').length
  const overdueRows = rows.filter(isOverdue)
  const overdueAmount = overdueRows.reduce((s, r) => s + Number(r.monthly_amount ?? 0), 0)
  const collected = rows.reduce((s, r) => s + Number(r.total_paid ?? 0), 0)

  const updateOrg = async (
    id: string,
    patch: { plan?: string; subscription_status?: string },
  ) => {
    setBusyId(id)
    const { error } = await supabase.from('organizations').update(patch).eq('id', id)
    setBusyId(null)
    if (error) return pushToast('danger', error.message)
    await load()
    await refresh()
    pushToast('success', 'ორგანიზაცია განახლდა')
  }

  const markPaid = async (id: string, months: number) => {
    setBusyId(id)
    const { error } = await supabase.rpc('mark_tenant_paid', { p_org: id, p_months: months })
    setBusyId(null)
    if (error) return pushToast('danger', error.message)
    await load()
    await refresh()
    pushToast('success', `გადახდა დაფიქსირდა — ვადა +${months} თვ.`)
  }

  const viewAs = async (id: string) => {
    setCurrentOrg(id)
    pushToast('info', 'ხედავ ამ ორგანიზაციის პანელს')
    onViewAs()
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Coins} label="MRR (აქტიური)" value={gel(mrr)} accent="var(--status-free)" />
        <Kpi
          icon={AlertTriangle}
          label="ვადაგადაცილებული"
          value={`${overdueRows.length} • ${gel(overdueAmount)}`}
          accent={overdueRows.length ? 'var(--status-expired)' : undefined}
        />
        <Kpi icon={ShieldCheck} label="აქტიური / საცდელი" value={`${activeCount} / ${trialCount}`} />
        <Kpi icon={Wallet} label="შემოსული გადახდები" value={gel(collected)} accent="var(--status-free)" />
      </div>

      {/* Platform Telegram alerts */}
      <div className="nm-raised flex flex-col gap-3 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-extrabold">
            <Send className="size-5 text-primary" /> Telegram alert-ები (პლატფორმა)
          </h3>
          <p className="mt-1 text-xs text-muted-foreground text-pretty">
            🆕 ახალი tenant · 👑 დღის digest (MRR / overdue / საცდელი) — შენს Telegram-ში.
            {tgLinked === true ? ' ✅ დაკავშირებულია' : tgLinked === false ? ' ⚪ არ არის დაკავშირებული' : ''}
          </p>
          {tgCode && (
            <p className="mt-2 text-sm">
              გაუგზავნე ბოტს: <code className="nm-inset rounded-lg px-2 py-1 font-mono font-bold tracking-wider">/link {tgCode}</code>
            </p>
          )}
        </div>
        <button onClick={genTelegramCode} className="nm-btn shrink-0 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary">
          კოდის გენერაცია
        </button>
      </div>

      {/* Tenants */}
      <div className="nm-raised rounded-3xl p-6">
        <h3 className="flex items-center gap-2 text-base font-extrabold">
          <Users2 className="size-5 text-primary" />
          ორგანიზაციები (Tenants)
        </h3>

        <div className="mt-5 space-y-3">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              ორგანიზაციები ვერ მოიძებნა
            </p>
          ) : (
            rows.map((r) => {
              const status = STATUS_META[r.subscription_status ?? 'trialing'] ?? STATUS_META.trialing
              const suspended = r.subscription_status === 'canceled'
              const overdue = isOverdue(r)
              const due = dueDate(r)
              const days = daysLeft(due)
              const months = payMonths[r.id] ?? 1
              const amount = Number(r.monthly_amount ?? 0)
              return (
                <div
                  key={r.id}
                  className="nm-inset flex flex-col gap-4 rounded-2xl p-4"
                  style={
                    overdue
                      ? { boxShadow: 'inset 0 0 0 1.5px color-mix(in oklch, var(--status-expired) 45%, transparent)' }
                      : undefined
                  }
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="nm-raised-sm flex size-11 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold text-primary">
                        {(r.name ?? '?')[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-extrabold">{r.name}</p>
                        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users2 className="size-3" />
                            {r.member_count ?? 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <Building2 className="size-3" />
                            {r.venue_count ?? 0} ფილ.
                          </span>
                          <span>{gel(Number(r.total_revenue ?? 0))} ბრუნვა</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-3 py-1 text-xs font-bold"
                        style={{ color: status.color, background: `color-mix(in oklch, ${status.color} 14%, transparent)` }}
                      >
                        {status.label}
                      </span>
                      {overdue && (
                        <span
                          className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold"
                          style={{
                            color: 'var(--status-expired)',
                            background: 'color-mix(in oklch, var(--status-expired) 14%, transparent)',
                          }}
                        >
                          <AlertTriangle className="size-3" />
                          ვადაგადაცილ.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Billing strip */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <BillCell label="თვიური" value={amount ? gel(amount) : 'უფასო'} />
                    <BillCell label="ვადა (paid-until)" value={fmtDate(due)} />
                    <BillCell
                      label="დარჩა"
                      value={
                        days === null
                          ? '—'
                          : days < 0
                            ? `${Math.abs(days)} დღით აგვიანებს`
                            : `${days} დღე`
                      }
                      accent={
                        days !== null && days < 0
                          ? 'var(--status-expired)'
                          : days !== null && days <= 3
                            ? 'var(--status-warning5)'
                            : undefined
                      }
                    />
                    <BillCell label="ბოლო გადახდა" value={fmtDate(r.last_payment_at)} />
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                    {/* plan */}
                    <select
                      value={r.plan ?? 'trial'}
                      disabled={busyId === r.id}
                      onChange={(e) => updateOrg(r.id, { plan: e.target.value })}
                      className="nm-btn rounded-xl px-3 py-2 text-xs font-bold outline-none appearance-none bg-transparent"
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p} className="bg-background">
                          {p.toUpperCase()} {PLAN_PRICE[p] ? `(${gel(PLAN_PRICE[p])})` : ''}
                        </option>
                      ))}
                    </select>

                    {/* mark paid */}
                    <div className="flex items-center gap-1.5">
                      <select
                        value={months}
                        disabled={busyId === r.id}
                        onChange={(e) => setPayMonths((m) => ({ ...m, [r.id]: Number(e.target.value) }))}
                        className="nm-btn rounded-xl px-2 py-2 text-xs font-bold outline-none appearance-none bg-transparent"
                        aria-label="თვეების რაოდენობა"
                      >
                        {PAY_MONTHS.map((m) => (
                          <option key={m} value={m} className="bg-background">
                            {m} თვ.
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => markPaid(r.id, months)}
                        className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-[var(--status-free)]"
                      >
                        <CheckCircle2 className="size-3.5" />
                        გადაიხადა
                      </button>
                    </div>

                    {/* suspend / activate */}
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() =>
                        updateOrg(r.id, { subscription_status: suspended ? 'active' : 'canceled' })
                      }
                      className={cn(
                        'nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold',
                        suspended ? 'text-[var(--status-free)]' : 'text-[var(--status-expired)]',
                      )}
                    >
                      {suspended ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                      {suspended ? 'გააქტიურება' : 'შეჩერება'}
                    </button>

                    {/* view as */}
                    <button
                      type="button"
                      onClick={() => viewAs(r.id)}
                      className="nm-btn ml-auto flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-primary"
                    >
                      <Eye className="size-3.5" />
                      ნახვა
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Platform-wide API keys (God Mode) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ApiKeysPanel platform />
      </div>
    </div>
  )
}

function BillCell({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-bold" style={accent ? { color: accent } : undefined}>
          {value}
        </p>
      </div>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Coins
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="nm-raised flex items-center gap-3 rounded-3xl p-5">
      <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
        <Icon className="size-5" style={{ color: accent ?? 'var(--primary)' }} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="font-mono text-xl font-extrabold" style={accent ? { color: accent } : undefined}>
          {value}
        </p>
      </div>
    </div>
  )
}
