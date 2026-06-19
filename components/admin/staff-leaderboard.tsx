'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'
import { cn } from '@/lib/utils'

// get_staff_leaderboard ships in migration 0094; not in generated types yet → loose wrapper.
const sb = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

interface Row {
  name: string | null
  role: string | null
  sessions: number
  session_revenue: number
  bar_sales: number
  bar_revenue: number
  service_done: number
  service_dismissed: number
  score: number
}

const MEDAL = ['🥇', '🥈', '🥉']
const RANGES = [
  { days: 7, label: '7 დღე' },
  { days: 30, label: '30 დღე' },
] as const

export function StaffLeaderboard() {
  const { currentOrgId } = useOrg()
  const [rows, setRows] = useState<Row[]>([])
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!currentOrgId) return
    setLoading(true)
    const from = new Date(Date.now() - days * 86_400_000).toISOString()
    const { data, error } = await sb.rpc('get_staff_leaderboard', {
      p_org_id: currentOrgId,
      p_from: from,
      p_to: new Date().toISOString(),
    })
    setLoading(false)
    if (error) return
    setRows(Array.isArray(data) ? (data as Row[]) : [])
  }, [currentOrgId, days])

  useEffect(() => { load() }, [load])

  const top = rows[0]?.score || 1

  return (
    <section className="nm-raised rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Trophy className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-extrabold tracking-tight">გუნდის ლიდერბორდი</h3>
            <p className="text-xs text-muted-foreground">ქულა: სესია ×10 · ბარი ×15 · მომსახ. ×10 · უარყ. −10</p>
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

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">იტვირთება…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          ამ პერიოდში მონაცემი არ არის. (ლიდერბორდი მუშაობს, როცა თანამშრომლები საკუთარი ექაუნთით შედიან.)
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className="nm-inset rounded-2xl p-3.5">
              <div className="flex items-center gap-3">
                <span className="w-7 shrink-0 text-center text-lg font-black">
                  {MEDAL[i] ?? <span className="text-sm text-muted-foreground">{i + 1}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{r.name ?? 'უცნობი'}</span>
                    <span className="shrink-0 font-mono text-base font-black text-primary">{r.score}</span>
                  </div>
                  {/* score bar */}
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(4, Math.round((r.score / top) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>🎮 {r.sessions} ({gel(r.session_revenue)})</span>
                    <span>🍹 {r.bar_sales} ({gel(r.bar_revenue)})</span>
                    <span>🛎️ {r.service_done}</span>
                    {r.service_dismissed > 0 && <span className="text-[var(--status-expired)]">✕ {r.service_dismissed}</span>}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
