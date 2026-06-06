'use client'

import { useEffect, useState } from 'react'
import {
  Building2,
  Coins,
  Eye,
  Pause,
  Play,
  ShieldCheck,
  Users2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'

// Estimated monthly price per plan (manual/invoice billing for now — edit freely).
const PLAN_PRICE: Record<string, number> = { trial: 0, pro: 99, enterprise: 299 }
const PLANS = ['trial', 'pro', 'enterprise'] as const

interface OrgRow {
  id: string
  name: string | null
  plan: string | null
  subscription_status: string | null
  trial_ends_at: string | null
  created_at: string | null
  member_count: number | null
  venue_count: number | null
  total_revenue: number | null
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: 'აქტიური', color: 'var(--status-free)' },
  trialing: { label: 'საცდელი', color: 'var(--status-active)' },
  past_due: { label: 'ვადაგადაცილებული', color: 'var(--status-warning5)' },
  canceled: { label: 'შეჩერებული', color: 'var(--status-expired)' },
}

export function PlatformConsole({ onViewAs }: { onViewAs: () => void }) {
  const { pushToast } = usePlayroom()
  const { setCurrentOrg, refresh } = useOrg()
  const [rows, setRows] = useState<OrgRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    const { data } = await supabase
      .from('platform_org_overview')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setRows(data as OrgRow[])
  }

  useEffect(() => {
    load()
  }, [])

  const mrr = rows
    .filter((r) => r.subscription_status === 'active')
    .reduce((sum, r) => sum + (PLAN_PRICE[r.plan ?? 'trial'] ?? 0), 0)
  const activeCount = rows.filter((r) => r.subscription_status === 'active').length
  const trialCount = rows.filter((r) => r.subscription_status === 'trialing').length
  const totalRevenue = rows.reduce((s, r) => s + Number(r.total_revenue ?? 0), 0)

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

  const viewAs = async (id: string) => {
    setCurrentOrg(id)
    pushToast('info', 'ხედავ ამ ორგანიზაციის პანელს')
    onViewAs()
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Coins} label="MRR (სავარაუდო)" value={gel(mrr)} accent="var(--status-free)" />
        <Kpi icon={Building2} label="ორგანიზაციები" value={String(rows.length)} />
        <Kpi icon={ShieldCheck} label="აქტიური / საცდელი" value={`${activeCount} / ${trialCount}`} />
        <Kpi icon={Coins} label="ბრუნვა (ყველა)" value={gel(totalRevenue)} />
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
              return (
                <div
                  key={r.id}
                  className="nm-inset flex flex-col gap-4 rounded-2xl p-4 lg:flex-row lg:items-center lg:justify-between"
                >
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
                      className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-primary"
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
