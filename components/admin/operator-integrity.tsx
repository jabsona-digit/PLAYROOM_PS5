'use client'

import { useCallback, useEffect, useState } from 'react'
import { Gauge, Flag, Gamepad2 } from 'lucide-react'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'
import { cn } from '@/lib/utils'

// get_operator_integrity ships in migration 0095; not in generated types yet → loose wrapper.
const sb = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

interface Op {
  name: string | null
  role: string | null
  sessions: number
  avg_joysticks: number
  pct_2j: number
  bar_on_2j_avg: number
  deviation: number
  flag: boolean
}
interface Data {
  venue_avg_joysticks: number | null
  venue_pct_2j: number | null
  venue_sessions: number
  operators: Op[]
}

const RANGES = [
  { days: 30, label: '30 დღე' },
  { days: 90, label: '90 დღე' },
] as const

export function OperatorIntegrity() {
  const { currentOrgId } = useOrg()
  const [data, setData] = useState<Data | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!currentOrgId) return
    setLoading(true)
    const { data: d, error } = await sb.rpc('get_operator_integrity', {
      p_org_id: currentOrgId,
      p_from: new Date(Date.now() - days * 86_400_000).toISOString(),
      p_to: new Date().toISOString(),
    })
    setLoading(false)
    if (error) return
    setData(d as Data)
  }, [currentOrgId, days])

  useEffect(() => { load() }, [load])

  const ops = data?.operators ?? []

  return (
    <div className="nm-raised rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Gauge className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-extrabold tracking-tight">ოპერატორის ნდობა — ჯოისტიკები</h3>
            <p className="text-xs text-muted-foreground text-pretty">
              ვინ რთავს ვენიუს საშუალოზე ნაკლებ ჯოისტიკს (შესაძლო under-ringing). hardware არ სჭირდება.
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', days === r.days ? 'nm-daylight text-primary' : 'nm-btn text-muted-foreground')}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* venue baseline */}
      {data && data.venue_sessions > 0 && (
        <div className="nm-inset mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-4 py-2.5 text-xs">
          <span className="flex items-center gap-1.5 font-bold">
            <Gamepad2 className="size-3.5 text-primary" /> ვენიუს საშ.: {data.venue_avg_joysticks} ჯოისტიკი
          </span>
          <span className="text-muted-foreground">{data.venue_pct_2j}% — 2 ჯოისტიკი</span>
          <span className="text-muted-foreground">{data.venue_sessions} სესია</span>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">იტვირთება…</p>
      ) : ops.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">ამ პერიოდში playroom სესია არ არის.</p>
      ) : ops.length < 2 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          საჭიროა ≥2 ოპერატორი შესადარებლად. ახლა მხოლოდ <b className="text-foreground">{ops[0].name ?? 'უცნობი'}</b> ({ops[0].avg_joysticks} ჯოისტიკი საშ., {ops[0].sessions} სესია).
        </p>
      ) : (
        <ul className="space-y-2.5">
          {ops.map((o, i) => (
            <li key={i} className={cn('nm-inset rounded-2xl p-3.5', o.flag && 'ring-1 ring-[var(--status-expired)]/50')}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 truncate text-sm font-bold">
                  {o.flag && <Flag className="size-4 shrink-0 text-[var(--status-expired)]" />}
                  {o.name ?? 'უცნობი'}
                  {o.flag && <span className="rounded-full bg-[var(--status-expired)]/15 px-2 py-0.5 text-[10px] font-black text-[var(--status-expired)]">შესამოწმებელი</span>}
                </span>
                <span className="shrink-0 font-mono text-base font-black" style={{ color: o.flag ? 'var(--status-expired)' : 'var(--foreground)' }}>
                  {o.avg_joysticks}<span className="text-xs text-muted-foreground"> ჯ/საშ.</span>
                </span>
              </div>
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>{o.sessions} სესია</span>
                <span>{o.pct_2j}% — 2j</span>
                {o.deviation > 0
                  ? <span className="font-bold text-[var(--status-warning5)]">−{o.deviation} ვენიუს საშ-ზე ნაკლები</span>
                  : <span className="text-[var(--status-free)]">საშუალოზე მაღლა/თანაბრად</span>}
                <span>🍹 2j-ზე საშ. {gel(o.bar_on_2j_avg)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        🚩 = ≥5 სესია და საშ. ჯოისტიკი ვენიუს საშ-ზე ≥0.3-ით დაბალი. ეჭვის ნიშანია, არა მტკიცებულება — გადაამოწმე.
      </p>
    </div>
  )
}
