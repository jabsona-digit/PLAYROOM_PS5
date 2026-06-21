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
  Trophy,
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

      {/* Platform tournaments */}
      <PlatformTournaments />

      {/* Tenant global-promotion requests */}
      <TenantPromotionRequests />

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

interface POffer {
  id: string
  status: string
  note: string | null
  proposed_amount: number | null
  agreed_amount: number | null
  venue: string | null
  org: string | null
}
interface PTournament {
  id: string
  name: string
  game: string | null
  status: string
  entry_fee: number | null
  prize_pool: number | null
  starts_at: string | null
  agreed_amount: number | null
  is_public: boolean
  commission_pct: number | null
  host_venue: string | null
  host_org: string | null
  registered_count: number | null
  checked_in_count: number | null
  collected: number | null
  commission_due: number | null
  offers: POffer[] | null
}

const T_STATUS: Record<string, { label: string; color: string }> = {
  seeking_host: { label: 'ჰოსტის ძებნა', color: 'var(--status-warning5)' },
  registration: { label: 'რეგისტრაცია ღია', color: 'var(--status-active)' },
  active: { label: 'მიმდინარე', color: 'var(--status-free)' },
  completed: { label: 'დასრულდა', color: 'var(--status-expired)' },
  cancelled: { label: 'გაუქმდა', color: 'var(--status-expired)' },
}

// IMPORTANT: invoke `.rpc` as a MEMBER call so `this` stays bound to the supabase client.
// Assigning `supabase.rpc` to a const detaches `this` → supabase-js reads `this.rest` on
// undefined → throws "Cannot read properties of undefined (reading 'rest')" (same class of
// bug as the booking-widget fix in marketplace). `.call(supabase, …)` preserves the binding.
const rpcAny = (
  f: string,
  a: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> =>
  (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  ).call(supabase, f, a)

const EMPTY_T_FORM = {
  name: '',
  game: '',
  entry_fee: '20',
  prize_pool: '200',
  starts_at: '',
  group_size: '4',
  advance_per_group: '2',
  max: '16',
}

function PlatformTournaments() {
  const { pushToast } = usePlayroom()
  const [list, setList] = useState<PTournament[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [agreed, setAgreed] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ ...EMPTY_T_FORM })

  const load = async () => {
    const { data } = await rpcAny('list_platform_tournaments', {})
    setList((data as PTournament[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!form.name.trim()) return pushToast('danger', 'სახელი სავალდებულოა')
    setBusy(true)
    const { error } = await rpcAny('create_platform_tournament', {
      p_name: form.name.trim(),
      p_game: form.game.trim(),
      p_format: 'groups_knockout',
      p_group_size: Number(form.group_size || 4),
      p_advance: Number(form.advance_per_group || 2),
      p_entry_fee: Number(form.entry_fee || 0),
      p_prize_pool: Number(form.prize_pool || 0),
      p_starts_at: form.starts_at || null,
      p_max: form.max ? Number(form.max) : null,
    })
    setBusy(false)
    if (error) return pushToast('danger', error.message)
    setOpen(false)
    setForm({ ...EMPTY_T_FORM })
    pushToast('success', '🏆 ტურნირი შეიქმნა — owner-ებს გაეგზავნათ მოწვევა')
    load()
  }

  const accept = async (offerId: string) => {
    setBusy(true)
    const { error } = await rpcAny('accept_host_offer', {
      p_offer: offerId,
      p_agreed: Number(agreed[offerId] || 0),
    })
    setBusy(false)
    if (error) return pushToast('danger', error.message)
    pushToast('success', '✅ ჰოსტი დადასტურდა — ვენიუ მიიღებს შეტყობინებას')
    load()
  }

  const setCommission = async (id: string, pct: string) => {
    const { error } = await rpcAny('set_tournament_commission', { p_tournament: id, p_pct: Number(pct || 0) })
    if (error) return pushToast('danger', error.message)
    pushToast('success', `კომისია: ${Number(pct || 0)}%`)
    load()
  }

  return (
    <div className="nm-raised rounded-3xl p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-extrabold">
          <Trophy className="size-5 text-primary" /> პლატფორმის ტურნირები
        </h3>
        <button
          onClick={() => setOpen(!open)}
          className="nm-btn shrink-0 rounded-2xl px-4 py-2 text-sm font-bold text-primary"
        >
          {open ? 'დახურვა' : '+ ახალი'}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground text-pretty">
        შენ ქმნი ტურნირს → owner-ებს მისდით მოწვევა (Telegram + პანელი) → შემოგთავაზებენ თავიანთ სივრცეს → ირჩევ ჰოსტს.
      </p>

      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ტურნირის სახელი"
            className="nm-inset rounded-xl px-4 py-2.5 text-sm outline-none sm:col-span-2"
          />
          <input
            value={form.game}
            onChange={(e) => setForm({ ...form, game: e.target.value })}
            placeholder="თამაში (მაგ. EA FC 25)"
            className="nm-inset rounded-xl px-4 py-2.5 text-sm outline-none sm:col-span-2"
          />
          <label className="block">
            <span className="text-xs text-muted-foreground">საწევრო (₾)</span>
            <input
              type="number"
              value={form.entry_fee}
              onChange={(e) => setForm({ ...form, entry_fee: e.target.value })}
              className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">პრიზი (₾)</span>
            <input
              type="number"
              value={form.prize_pool}
              onChange={(e) => setForm({ ...form, prize_pool: e.target.value })}
              className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">ჯგუფში მოთამაშე</span>
            <input
              type="number"
              value={form.group_size}
              onChange={(e) => setForm({ ...form, group_size: e.target.value })}
              className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">გადადის ნოკაუტში</span>
            <input
              type="number"
              value={form.advance_per_group}
              onChange={(e) => setForm({ ...form, advance_per_group: e.target.value })}
              className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">მაქს. მონაწილე</span>
            <input
              type="number"
              value={form.max}
              onChange={(e) => setForm({ ...form, max: e.target.value })}
              className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">დაწყება</span>
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              className="nm-inset mt-1 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
            />
          </label>
          <button
            disabled={busy}
            onClick={create}
            className="nm-btn rounded-2xl px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50 sm:col-span-2"
          >
            შექმნა + owner-ების მოწვევა
          </button>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">ჯერ ტურნირები არ არის — შექმენი პირველი.</p>
        )}
        {list.map((t) => {
          const meta = T_STATUS[t.status] ?? { label: t.status, color: 'var(--status-active)' }
          return (
            <div key={t.id} className="nm-inset rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">
                    {t.name}
                    {t.game && <span className="text-muted-foreground"> · {t.game}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    💰 {gel(t.entry_fee ?? 0)} · 🏆 {gel(t.prize_pool ?? 0)}
                    {t.starts_at && ` · 📅 ${new Date(t.starts_at).toLocaleString('ka-GE', { dateStyle: 'short', timeStyle: 'short' })}`}
                  </p>
                </div>
                <span
                  className="nm-raised-sm shrink-0 rounded-full px-3 py-1 text-xs font-bold"
                  style={{ color: meta.color }}
                >
                  {meta.label}
                </span>
              </div>

              {t.status !== 'seeking_host' && t.host_venue && (
                <p className="mt-2 text-sm">
                  🏠 ჰოსტი: <b>{t.host_venue}</b>
                  {t.host_org && <span className="text-muted-foreground"> ({t.host_org})</span>}
                  {t.agreed_amount != null && ` · შეთანხმება ${gel(t.agreed_amount)}`}
                </p>
              )}

              {t.status !== 'seeking_host' && (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="nm-raised-sm rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">რეგისტრ.</p>
                      <p className="text-sm font-extrabold">{t.registered_count ?? 0}</p>
                    </div>
                    <div className="nm-raised-sm rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">გავლილი</p>
                      <p className="text-sm font-extrabold text-[var(--status-free)]">{t.checked_in_count ?? 0}</p>
                    </div>
                    <div className="nm-raised-sm rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">შემოსული</p>
                      <p className="text-sm font-extrabold">{gel(t.collected ?? 0)}</p>
                    </div>
                    <div className="nm-raised-sm rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">კომისია</p>
                      <p className="text-sm font-extrabold text-primary">{gel(t.commission_due ?? 0)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">კომისია %:</span>
                    <input
                      type="number"
                      defaultValue={String(t.commission_pct ?? 0)}
                      onBlur={(e) => setCommission(t.id, e.target.value)}
                      className="nm-inset w-20 rounded-lg px-2 py-1 text-sm outline-none"
                    />
                    <span className="text-[10px] text-muted-foreground">(fokus-დან გასვლისას ინახება)</span>
                  </div>
                </>
              )}

              {t.status === 'seeking_host' && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-bold text-muted-foreground">
                    შემოთავაზებები ({t.offers?.length ?? 0})
                  </p>
                  {(!t.offers || t.offers.length === 0) && (
                    <p className="text-xs text-muted-foreground">ჯერ არავის შემოუთავაზებია — owner-ებს გაეგზავნათ მოწვევა.</p>
                  )}
                  {t.offers?.map((o) => (
                    <div
                      key={o.id}
                      className="nm-raised-sm flex flex-wrap items-center justify-between gap-2 rounded-xl p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {o.venue}
                          {o.org && <span className="text-muted-foreground"> · {o.org}</span>}
                        </p>
                        {o.note && <p className="text-xs text-muted-foreground">„{o.note}“</p>}
                        {o.proposed_amount != null && (
                          <p className="text-xs">შემოთავაზებული: {gel(o.proposed_amount)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="₾"
                          value={agreed[o.id] ?? ''}
                          onChange={(e) => setAgreed({ ...agreed, [o.id]: e.target.value })}
                          className="nm-inset w-20 rounded-lg px-2 py-1.5 text-sm outline-none"
                        />
                        <button
                          disabled={busy}
                          onClick={() => accept(o.id)}
                          className="nm-btn shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50"
                        >
                          დადასტურება
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface PromoReq {
  id: string
  name: string
  game: string | null
  status: string
  promotion_status: string
  entry_fee: number | null
  prize_pool: number | null
  starts_at: string | null
  proposed_commission_pct: number | null
  commission_pct: number | null
  rejected_reason: string | null
  venue: string | null
  org: string | null
  registered_count: number | null
  checked_in_count: number | null
  collected: number | null
  commission_due: number | null
}

const PROMO_META: Record<string, { label: string; color: string }> = {
  pending: { label: '⏳ მოლოდინში', color: 'var(--status-active)' },
  approved: { label: '✅ დადასტურდა', color: 'var(--status-free)' },
  rejected: { label: '❌ უარყოფილი', color: 'var(--status-expired)' },
}

function TenantPromotionRequests() {
  const { pushToast } = usePlayroom()
  const [list, setList] = useState<PromoReq[]>([])
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState<Record<string, string>>({})

  const load = async () => {
    const { data } = await rpcAny('list_tenant_promotion_requests', {})
    setList((data as PromoReq[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const approve = async (id: string, fallback: number | null) => {
    setBusy(true)
    const { error } = await rpcAny('approve_tournament_promotion', {
      p_tournament: id,
      p_commission: Number(pct[id] ?? fallback ?? 0),
    })
    setBusy(false)
    if (error) return pushToast('danger', error.message)
    pushToast('success', '✅ დადასტურდა — owner-ს ეცნობა, marketplace-ზე გამოჩნდა')
    load()
  }

  const reject = async (id: string) => {
    const reason = window.prompt('უარყოფის მიზეზი (არჩევითი):') ?? ''
    setBusy(true)
    const { error } = await rpcAny('reject_tournament_promotion', { p_tournament: id, p_reason: reason })
    setBusy(false)
    if (error) return pushToast('danger', error.message)
    pushToast('info', 'უარყოფილია — owner-ს ეცნობა')
    load()
  }

  if (list.length === 0) return null

  return (
    <div className="nm-raised rounded-3xl p-6">
      <h3 className="flex items-center gap-2 text-base font-extrabold">
        🌍 Global ტურნირის მოთხოვნები
      </h3>
      <p className="mt-1 text-xs text-muted-foreground text-pretty">
        owner-ებმა საკუთარი ტურნირი მოითხოვეს marketplace-ზე — დაადასტურე კომისიის %-ით ან უარყავი.
      </p>
      <div className="mt-4 space-y-3">
        {list.map((t) => {
          const meta = PROMO_META[t.promotion_status] ?? { label: t.promotion_status, color: 'var(--status-active)' }
          return (
            <div key={t.id} className="nm-inset rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">
                    {t.name}
                    {t.game && <span className="text-muted-foreground"> · {t.game}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    🏠 {t.venue ?? '—'}
                    {t.org && <span> ({t.org})</span>} · 💰 {gel(t.entry_fee ?? 0)} · 🏆 {gel(t.prize_pool ?? 0)}
                    {t.starts_at && ` · 📅 ${new Date(t.starts_at).toLocaleString('ka-GE', { dateStyle: 'short', timeStyle: 'short' })}`}
                  </p>
                </div>
                <span className="nm-raised-sm shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ color: meta.color }}>
                  {meta.label}
                </span>
              </div>

              {t.promotion_status === 'pending' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    შემოთავაზებული: <b>{t.proposed_commission_pct ?? 0}%</b> · საბოლოო კომისია %:
                  </span>
                  <input
                    type="number"
                    placeholder={String(t.proposed_commission_pct ?? 0)}
                    value={pct[t.id] ?? ''}
                    onChange={(e) => setPct({ ...pct, [t.id]: e.target.value })}
                    className="nm-inset w-20 rounded-lg px-2 py-1.5 text-sm outline-none"
                  />
                  <button
                    disabled={busy}
                    onClick={() => approve(t.id, t.proposed_commission_pct)}
                    className="nm-btn rounded-xl px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50"
                  >
                    დადასტურება
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => reject(t.id)}
                    className="nm-btn rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--status-expired)] disabled:opacity-50"
                  >
                    უარყოფა
                  </button>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="nm-raised-sm rounded-xl px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">რეგისტრ.</p>
                    <p className="text-sm font-extrabold">{t.registered_count ?? 0}</p>
                  </div>
                  <div className="nm-raised-sm rounded-xl px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">გავლილი</p>
                    <p className="text-sm font-extrabold text-[var(--status-free)]">{t.checked_in_count ?? 0}</p>
                  </div>
                  <div className="nm-raised-sm rounded-xl px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">შემოსული</p>
                    <p className="text-sm font-extrabold">{gel(t.collected ?? 0)}</p>
                  </div>
                  <div className="nm-raised-sm rounded-xl px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">კომისია {t.commission_pct ?? 0}%</p>
                    <p className="text-sm font-extrabold text-primary">{gel(t.commission_due ?? 0)}</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
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
