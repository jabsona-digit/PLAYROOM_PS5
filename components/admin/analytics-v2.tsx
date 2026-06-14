'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3, TrendingUp, Gauge, Coins, Gamepad2, Flame, Snowflake,
  Lightbulb, LoaderCircle, Clock, Sparkles,
} from 'lucide-react'
import { useOrg } from '@/lib/org'
import { gel } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'

// get_console_analytics ships in migration 0059; DB types regenerate on deploy.
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>)(fn, args)

interface ConsoleRow {
  console_id: number; name: string; sessions: number
  occupied_min: number; revenue: number; occupancy_pct: number; revpach: number
}
interface HeatCell { dow: number; hour: number; sessions: number; revenue: number }
interface Analytics {
  console_count: number; days: number; daily_hours: number
  available_console_hours: number; total_revenue: number; total_occupied_hours: number
  occupancy_pct: number; revpach: number; consoles: ConsoleRow[]; heatmap: HeatCell[]
}

type Preset = 'today' | '7d' | '30d' | 'month'
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'დღეს' },
  { key: '7d', label: '7 დღე' },
  { key: '30d', label: '30 დღე' },
  { key: 'month', label: 'ეს თვე' },
]

// extract(dow): 0=Sun … 6=Sat. Display Mon→Sun.
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DOW_LABEL: Record<number, string> = { 1: 'ორშ', 2: 'სამ', 3: 'ოთხ', 4: 'ხუთ', 5: 'პარ', 6: 'შაბ', 0: 'კვი' }

function rangeOf(preset: Preset) {
  const to = new Date()
  const start = new Date(); start.setHours(0, 0, 0, 0)
  if (preset === '7d') start.setDate(start.getDate() - 6)
  else if (preset === '30d') start.setDate(start.getDate() - 29)
  else if (preset === 'month') start.setDate(1)
  return { from: start.toISOString(), to: to.toISOString() }
}

// minimal markdown for Gemini's Georgian advice (headings, bullets, **bold**)
function renderAdvice(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.trim() === '') return <div key={i} className="h-2" />
    const isHead = /^#{1,4}\s/.test(line)
    const clean = line.replace(/^#{1,4}\s/, '').replace(/^[-*]\s/, '• ')
    const parts = clean.split(/(\*\*.*?\*\*)/g)
    return (
      <p key={i} className={cn('leading-relaxed', isHead ? 'mt-3 mb-1 font-black text-foreground' : 'mb-1 text-muted-foreground')}>
        {parts.map((p, j) => (p.startsWith('**') && p.endsWith('**')
          ? <strong key={j} className="font-bold text-foreground">{p.slice(2, -2)}</strong>
          : p))}
      </p>
    )
  })
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Gauge; label: string; value: string; hint?: string }) {
  return (
    <div className="nm-raised rounded-3xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function RevpachAnalytics() {
  const { currentVenueId } = useOrg()
  const [preset, setPreset] = useState<Preset>('30d')
  const [dailyHours, setDailyHours] = useState(12)
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReport, setAiReport] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!currentVenueId) return
    setLoading(true)
    const { from, to } = rangeOf(preset)
    const { data: res, error } = await rpc('get_console_analytics', {
      p_venue_id: currentVenueId, p_from: from, p_to: to, p_daily_hours: dailyHours,
    })
    setLoading(false)
    if (error || !res || res.error) { setData(null); return }
    setData(res as Analytics)
  }, [currentVenueId, preset, dailyHours])

  useEffect(() => { load() }, [load])
  // a fresh range invalidates a stale AI report
  useEffect(() => { setAiReport(null) }, [preset, dailyHours, currentVenueId])

  const runAdvisor = async () => {
    if (!currentVenueId) return
    setAiLoading(true); setAiReport(null)
    const { from, to } = rangeOf(preset)
    const { data: res, error } = await supabase.functions.invoke('ai-assistant', {
      body: { action: 'run_revpach_advisor', venue_id: currentVenueId, from, to, daily_hours: dailyHours },
    })
    setAiLoading(false)
    setAiReport(error ? 'რეკომენდაცია ვერ მომზადდა. სცადეთ თავიდან.' : ((res as { text?: string })?.text ?? 'ცარიელი პასუხი'))
  }

  // heatmap lookup + max for intensity
  const { heatLookup, heatMax, goldHour } = useMemo(() => {
    const lookup = new Map<string, HeatCell>()
    let max = 0
    let gold: HeatCell | null = null
    for (const c of data?.heatmap ?? []) {
      lookup.set(`${c.dow}-${c.hour}`, c)
      if (c.sessions > max) max = c.sessions
      if (!gold || c.revenue > gold.revenue) gold = c
    }
    return { heatLookup: lookup, heatMax: max, goldHour: gold }
  }, [data])

  // status thresholds vs venue-wide RevPACH
  const grade = (c: ConsoleRow): { label: string; cls: string; dot: string } => {
    const base = data?.revpach ?? 0
    if (c.sessions === 0) return { label: 'უქმე', cls: 'text-[var(--status-expired)]', dot: 'var(--status-expired)' }
    if (base > 0 && c.revpach >= base * 1.2) return { label: 'ვარსკვლავი', cls: 'text-[var(--status-free)]', dot: 'var(--status-free)' }
    if (base > 0 && c.revpach < base * 0.5) return { label: 'სუსტი', cls: 'text-[var(--status-warning5)]', dot: 'var(--status-warning5)' }
    return { label: 'საშუალო', cls: 'text-muted-foreground', dot: 'var(--muted-foreground)' }
  }

  // lost-revenue estimate: reaching a 50% occupancy target at the realized hourly rate
  const insight = useMemo(() => {
    if (!data || data.total_occupied_hours <= 0) return null
    const realizedHourly = data.total_revenue / data.total_occupied_hours
    const TARGET = 50
    const gapPct = Math.max(0, TARGET - data.occupancy_pct)
    const extraHours = (gapPct / 100) * data.available_console_hours
    const potential = extraHours * realizedHourly
    const top = [...data.consoles].sort((a, b) => b.revpach - a.revpach)[0]
    const weak = [...data.consoles].sort((a, b) => a.revpach - b.revpach)[0]
    return { realizedHourly, potential, gapPct, top, weak }
  }, [data])

  if (!currentVenueId) {
    return <div className="nm-inset rounded-3xl p-10 text-center text-sm text-muted-foreground">აირჩიეთ ფილიალი.</div>
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <BarChart3 className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">კონსოლების ინტელექტი</h2>
            <p className="text-xs text-muted-foreground">RevPACH — შემოსავალი თითო ხელმისაწვდომ კონსოლ-საათზე</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={cn('rounded-2xl px-4 py-2 text-sm font-bold', preset === p.key ? 'nm-daylight text-primary' : 'nm-btn text-muted-foreground')}
            >
              {p.label}
            </button>
          ))}
          <label className="nm-inset flex items-center gap-2 rounded-2xl px-3 py-2">
            <Clock className="size-4 text-muted-foreground" />
            <input
              type="number" min={1} max={24} value={dailyHours}
              onChange={(e) => setDailyHours(Math.max(1, Math.min(24, Number(e.target.value) || 12)))}
              className="w-12 bg-transparent text-sm font-bold outline-none"
            />
            <span className="text-xs text-muted-foreground">სთ/დღე</span>
          </label>
          <button
            onClick={runAdvisor}
            disabled={aiLoading || loading || !data}
            className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold text-primary disabled:opacity-50"
          >
            {aiLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            AI რჩევები
          </button>
        </div>
      </div>

      {loading ? (
        <div className="nm-inset flex items-center justify-center rounded-3xl py-20">
          <LoaderCircle className="size-7 animate-spin text-primary" />
        </div>
      ) : !data || data.console_count === 0 ? (
        <div className="nm-inset rounded-3xl p-10 text-center text-sm text-muted-foreground">მონაცემი ვერ მოიძებნა.</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={TrendingUp} label="RevPACH" value={gel(data.revpach)} hint="თითო კონსოლ-საათზე" />
            <Kpi icon={Gauge} label="დატვირთვა" value={`${data.occupancy_pct}%`} hint={`${data.total_occupied_hours} / ${data.available_console_hours} სთ`} />
            <Kpi icon={Coins} label="შემოსავალი" value={gel(data.total_revenue)} hint={`${data.days} დღე`} />
            <Kpi icon={Gamepad2} label="კონსოლები" value={String(data.console_count)} hint={`${data.daily_hours} სთ/დღე`} />
          </div>

          {/* Insights */}
          {insight && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="nm-raised rounded-3xl p-5">
                <div className="mb-1 flex items-center gap-2 text-[var(--status-warning5)]">
                  <Lightbulb className="size-4" /><span className="text-xs font-bold uppercase tracking-wider">დაკარგული შემოსავალი</span>
                </div>
                <p className="text-2xl font-black">{gel(insight.potential)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  დატვირთვა {data.occupancy_pct}% → 50%-მდე რომ გაიზარდოს, ≈ ამდენი დამატებითი შემოსავალი ამ პერიოდში.
                </p>
              </div>
              <div className="nm-raised rounded-3xl p-5">
                <div className="mb-1 flex items-center gap-2 text-[var(--status-free)]">
                  <Flame className="size-4" /><span className="text-xs font-bold uppercase tracking-wider">საუკეთესო საათი</span>
                </div>
                <p className="text-2xl font-black">
                  {goldHour ? `${DOW_LABEL[goldHour.dow]} ${String(goldHour.hour).padStart(2, '0')}:00` : '—'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {goldHour ? `${gel(goldHour.revenue)} · ${goldHour.sessions} სესია` : 'მონაცემი არ არის'}
                </p>
              </div>
              <div className="nm-raised rounded-3xl p-5">
                <div className="mb-1 flex items-center gap-2 text-primary">
                  <TrendingUp className="size-4" /><span className="text-xs font-bold uppercase tracking-wider">ლიდერი / სუსტი</span>
                </div>
                <p className="text-sm font-black">🥇 {insight.top?.name ?? '—'} · {gel(insight.top?.revpach ?? 0)}</p>
                <p className="mt-1 text-sm font-bold text-muted-foreground">🔻 {insight.weak?.name ?? '—'} · {gel(insight.weak?.revpach ?? 0)}</p>
              </div>
            </div>
          )}

          {/* AI recommendations */}
          {(aiReport || aiLoading) && (
            <div className="nm-raised rounded-3xl p-6">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <h3 className="text-sm font-extrabold">AI რეკომენდაციები</h3>
              </div>
              {aiLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> ვაანალიზებ მონაცემებს…
                </div>
              ) : (
                <div className="text-sm">{renderAdvice(aiReport!)}</div>
              )}
            </div>
          )}

          {/* Console matrix */}
          <div className="nm-raised overflow-hidden rounded-3xl">
            <div className="hidden grid-cols-12 gap-3 border-b border-border px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
              <span className="col-span-3">კონსოლი</span>
              <span className="col-span-2">სტატუსი</span>
              <span className="col-span-3">დატვირთვა</span>
              <span className="col-span-2 text-right">სესიები</span>
              <span className="col-span-2 text-right">RevPACH</span>
            </div>
            <ul>
              {data.consoles.map((c) => {
                const g = grade(c)
                return (
                  <li key={c.console_id} className="grid grid-cols-2 items-center gap-3 border-b border-border px-6 py-4 last:border-b-0 md:grid-cols-12">
                    <div className="md:col-span-3">
                      <p className="font-bold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{gel(c.revenue)}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold', g.cls)}>
                        <span className="size-2 rounded-full" style={{ background: g.dot }} />{g.label}
                      </span>
                    </div>
                    <div className="md:col-span-3">
                      <div className="nm-inset h-2.5 w-full overflow-hidden rounded-full">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, c.occupancy_pct)}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{c.occupancy_pct}%</p>
                    </div>
                    <span className="text-right font-mono text-sm md:col-span-2">{c.sessions}</span>
                    <span className="text-right font-mono text-sm font-extrabold text-primary md:col-span-2">{gel(c.revpach)}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Heatmap */}
          <div className="nm-raised rounded-3xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-extrabold">
                <Flame className="size-4 text-[var(--status-free)]" /> მოთხოვნის რუკა (კვირა × საათი)
              </h3>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Snowflake className="size-3" /> ცარიელი → <Flame className="size-3 text-[var(--status-free)]" /> პიკი
              </span>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                {/* hour header */}
                <div className="mb-1 flex pl-9">
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">{h % 3 === 0 ? h : ''}</div>
                  ))}
                </div>
                {DOW_ORDER.map((dow) => (
                  <div key={dow} className="mb-1 flex items-center">
                    <span className="w-9 shrink-0 text-[10px] font-bold text-muted-foreground">{DOW_LABEL[dow]}</span>
                    {Array.from({ length: 24 }, (_, h) => {
                      const cell = heatLookup.get(`${dow}-${h}`)
                      const intensity = cell && heatMax > 0 ? Math.round((cell.sessions / heatMax) * 80) + 8 : 0
                      return (
                        <div key={h} className="flex-1 px-[1px]">
                          <div
                            className="h-5 rounded-[4px]"
                            title={cell ? `${DOW_LABEL[dow]} ${h}:00 — ${cell.sessions} სესია, ${gel(cell.revenue)}` : `${DOW_LABEL[dow]} ${h}:00 — ცარიელი`}
                            style={{
                              background: intensity > 0
                                ? `color-mix(in oklch, var(--primary) ${intensity}%, transparent)`
                                : 'color-mix(in oklch, var(--muted-foreground) 8%, transparent)',
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            RevPACH = შემოსავალი ÷ (კონსოლები × სამუშაო საათები). მონაცემი სესიებიდან, ბარისა და დაბრუნებების გარეშე.
          </p>
        </>
      )}
    </div>
  )
}
