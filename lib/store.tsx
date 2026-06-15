'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { supabase } from './supabase/client'
import { useOrg } from './org'
import { setCurrencySymbol, planErrorText } from './ui'
import { playExpired, playWarning } from './notify'
import type {
  AppSettings,
  Bank,
  ConsoleStatus,
  ConsoleHardware,
  ConsoleUnit,
  Employee,
  PaymentMethod,
  PricingPlan,
  Session,
  SessionExtension,
  SessionStatus,
  Shift,
  Toast,
  ToastType,
} from './types'

type CompletedSession = Session & { console_name: string; plan_name: string }

const SETTINGS_KEY = 'playroom:settings:v1'

const DEFAULT_SETTINGS: AppSettings = {
  venue_name: 'Playroom Gaming Lounge',
  currency: '₾',
  warn_10_min: 10,
  warn_5_min: 5,
  auto_end_on_expire: false,
  sound_alerts: true,
}

interface PlayroomState {
  consoles: ConsoleUnit[]
  plans: PricingPlan[]
  employees: Employee[]
  shifts: Shift[]
  completed: CompletedSession[]
  settings: AppSettings
  loading: boolean
  toasts: Toast[]
  pushToast: (type: ToastType, message: string) => void
  dismissToast: (id: string) => void
  addConsole: (name?: string) => void
  renameConsole: (id: number, name: string) => void
  removeConsole: (id: number) => void
  forceConsolePower: (consoleId: number, on: boolean) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => void
  resetSettings: () => void
  startSession: (params: {
    console_id: number
    pricing_plan_id: number
    duration_min: number
    customer_name?: string
    payment_method: PaymentMethod
    bank?: Bank | null
  }) => void
  startOpenSession: (params: {
    console_id: number
    pricing_plan_id: number
    customer_name?: string
    payment_method: PaymentMethod
    bank?: Bank | null
  }) => void
  extendSession: (console_id: number, extra_minutes: number) => void
  endSession: (console_id: number, tip?: number) => void
  refreshLive: () => Promise<void>
  tick: () => void
  updatePlanPrice: (id: number, price: number) => void
  togglePlanActive: (id: number) => void
  addPlan: (params: { name: string; controllers: number; price_per_hour: number }) => Promise<void>
  removePlan: (id: number) => Promise<void>
  clockToggle: (pin: string) => Promise<{ ok: boolean; message: string }>
  refreshStaff: () => Promise<void>
}

const Ctx = createContext<PlayroomState | null>(null)

const num = (v: unknown) => (v == null ? 0 : Number(v))

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapExtension(r: any): SessionExtension {
  return {
    id: r.id,
    session_id: r.session_id,
    extra_minutes: r.extra_minutes,
    extra_price: num(r.extra_price),
    created_at: r.created_at,
  }
}

function mapSession(r: any): Session {
  return {
    id: r.id,
    console_id: r.console_id,
    pricing_plan_id: r.pricing_plan_id,
    customer_name: r.customer_name ?? undefined,
    started_at: r.started_at,
    ends_at: r.ends_at ?? null,
    ended_at: r.ended_at ?? undefined,
    duration_min: r.duration_min ?? null,
    price_per_hour: num(r.price_per_hour),
    price_total: num(r.price_total),
    tip_amount: num(r.tip_amount),
    status: r.status as SessionStatus,
    payment_method: (r.payment_method ?? 'cash') as Session['payment_method'],
    bank: (r.bank ?? null) as Session['bank'],
    is_open: r.is_open ?? false,
    created_by_user: r.created_by_user ?? null,
    portal_code: r.portal_code ?? null,
    extensions: (r.session_extensions ?? []).map(mapExtension),
  }
}

function mapHardware(r: any): ConsoleHardware {
  return {
    control_mode: (r.control_mode ?? 'manual') as ConsoleHardware['control_mode'],
    driver: r.driver ?? 'none',
    target: (r.target ?? 'tv') as ConsoleHardware['target'],
    is_active: r.is_active ?? true,
    desired_state: (r.desired_state ?? null) as ConsoleHardware['desired_state'],
    last_known_state: (r.last_known_state ?? 'unknown') as ConsoleHardware['last_known_state'],
    last_seen_at: r.last_seen_at ?? null,
    config: (r.config ?? {}) as Record<string, unknown>,
  }
}

function mapPlan(r: any): PricingPlan {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    controllers: r.controllers,
    price_per_hour: num(r.price_per_hour),
    is_active: r.is_active,
    updated_at: r.updated_at,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function PlayroomProvider({ children }: { children: React.ReactNode }) {
  const { currentOrgId, currentVenueId } = useOrg()

  const [consoles, setConsoles] = useState<ConsoleUnit[]>([])
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [completed, setCompleted] = useState<CompletedSession[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [loading, setLoading] = useState(true)

  setCurrencySymbol(settings.currency)

  // live scope refs (loaders stay stable, read fresh org/venue)
  const orgRef = useRef(currentOrgId)
  orgRef.current = currentOrgId
  const venueRef = useRef(currentVenueId)
  venueRef.current = currentVenueId

  // ---- toasts ----
  const toastSeq = useRef(0)
  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = `t-${Date.now()}-${++toastSeq.current}`
    setToasts((prev) => [...prev, { id, type, message }])
  }, [])
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // ---- loaders (scoped to current org/venue) ----
  const loadPlans = useCallback(async () => {
    const org = orgRef.current
    if (!org) return
    const { data } = await supabase
      .from('pricing_plans')
      .select('*')
      .eq('org_id', org)
      .order('id')
    if (data) setPlans(data.map(mapPlan))
  }, [])

  const loadEmployees = useCallback(async () => {
    const org = orgRef.current
    if (!org) return
    const { data } = await supabase
      .from('employees')
      .select('id, name, role, is_active, salary_type, salary_amount, user_id')
      .eq('org_id', org)
      .order('id')
    if (data) {
      setEmployees(
        data.map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role as Employee['role'],
          is_active: e.is_active,
          salary_type: e.salary_type as Employee['salary_type'],
          salary_amount: Number(e.salary_amount) || 0,
        })),
      )
    }
  }, [])

  const loadShifts = useCallback(async () => {
    const venue = venueRef.current
    if (!venue) return
    const { data } = await supabase
      .from('shifts')
      .select('id, employee_id, clock_in, clock_out, hours_worked, work_date, employees(name)')
      .eq('venue_id', venue)
      .order('clock_in', { ascending: false })
      .limit(100)
    if (data) {
      setShifts(
        data.map((s) => ({
          id: s.id,
          employee_id: s.employee_id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          employee_name: (s.employees as any)?.name ?? '',
          clock_in: s.clock_in,
          clock_out: s.clock_out ?? undefined,
          hours_worked: s.hours_worked == null ? undefined : num(s.hours_worked),
          work_date: s.work_date,
        })),
      )
    }
  }, [])

  const loadLive = useCallback(async () => {
    const venue = venueRef.current
    if (!venue) return
    const [{ data: cons }, { data: active }, { data: hw }] = await Promise.all([
      supabase.from('consoles').select('*').eq('venue_id', venue).order('slot_number'),
      supabase
        .from('sessions')
        .select('*, session_extensions(*)')
        .eq('venue_id', venue)
        .eq('status', 'active'),
      // console_hardware isn't in generated types until the post-deploy regen
      (supabase.from('console_hardware' as never).select('*').eq('venue_id', venue) as unknown as Promise<{ data: any[] | null }>),
    ])
    if (!cons) return
    const byConsole = new Map<number, Session>()
    for (const s of active ?? []) byConsole.set(s.console_id, mapSession(s))
    const hwByConsole = new Map<number, ConsoleHardware>()
    for (const h of (hw ?? []) as any[]) hwByConsole.set(h.console_id, mapHardware(h))
    setConsoles(
      cons.map((c) => ({
        id: c.id,
        slot_number: c.slot_number,
        name: c.name,
        status: (byConsole.has(c.id) ? c.status : 'free') as ConsoleStatus,
        active_session: byConsole.get(c.id),
        hardware: hwByConsole.get(c.id),
      })),
    )
  }, [])

  const loadCompleted = useCallback(async () => {
    const venue = venueRef.current
    if (!venue) return
    const { data } = await supabase
      .from('sessions')
      .select('*, consoles(name), pricing_plans(name), session_extensions(*)')
      .eq('venue_id', venue)
      .eq('status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(200)
    if (data) {
      setCompleted(
        data.map((r) => ({
          ...mapSession(r),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          console_name: (r.consoles as any)?.name ?? '',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          plan_name: (r.pricing_plans as any)?.name ?? '',
        })),
      )
    }
  }, [])

  const refetchLive = useCallback(async () => {
    await Promise.all([loadLive(), loadCompleted()])
  }, [loadLive, loadCompleted])

  // ---- (re)load when the active org/venue changes ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) })
    } catch {}
  }, [])

  useEffect(() => {
    if (!currentOrgId || !currentVenueId) return
    let alive = true
    setLoading(true)
    ;(async () => {
      await Promise.all([
        loadPlans(),
        loadEmployees(),
        loadShifts(),
        loadLive(),
        loadCompleted(),
      ])
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [
    currentOrgId,
    currentVenueId,
    loadPlans,
    loadEmployees,
    loadShifts,
    loadLive,
    loadCompleted,
  ])

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {}
  }, [settings])

  // ---- realtime: any console/session change → debounced refetch ----
  const refetchRef = useRef(refetchLive)
  refetchRef.current = refetchLive
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => refetchRef.current(), 250)
    }
    const channel = supabase
      .channel('playroom-db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consoles' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, schedule)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  // ---- live refs for the stable tick ----
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const consolesRef = useRef(consoles)
  consolesRef.current = consoles
  const plansRef = useRef(plans)
  plansRef.current = plans

  // ---- mutations ----
  const addConsole: PlayroomState['addConsole'] = useCallback(
    async (name) => {
      const org = orgRef.current
      const venue = venueRef.current
      if (!org || !venue) return
      const nextSlot =
        consolesRef.current.reduce((m, c) => Math.max(m, c.slot_number), 0) + 1
      const { error } = await supabase.from('consoles').insert({
        org_id: org,
        venue_id: venue,
        slot_number: nextSlot,
        name: name?.trim() || `PS5 - ${nextSlot}`,
        status: 'free',
      })
      if (error) return pushToast('danger', planErrorText(error.message))
      await loadLive()
    },
    [pushToast, loadLive],
  )

  const renameConsole: PlayroomState['renameConsole'] = useCallback(
    async (id, name) => {
      const clean = name.trim()
      if (!clean) return
      const { error } = await supabase.from('consoles').update({ name: clean }).eq('id', id)
      if (error) return pushToast('danger', error.message)
      await loadLive()
    },
    [pushToast, loadLive],
  )

  const removeConsole: PlayroomState['removeConsole'] = useCallback(
    async (id) => {
      const { error } = await supabase.rpc('delete_console', { p_console_id: id })
      if (error) {
        const msg = error.message.includes('console_has_active_session')
          ? 'კონსოლზე აქტიური სესიაა — ჯერ დაასრულე'
          : error.message
        return pushToast('danger', msg)
      }
      await loadLive()
    },
    [pushToast, loadLive],
  )

  const updateSettings: PlayroomState['updateSettings'] = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetSettings: PlayroomState['resetSettings'] = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
    pushToast('info', 'პარამეტრები განულდა')
  }, [pushToast])

  // Best-effort hardware power — fire-and-forget, never blocks the session flow.
  const firePower = useCallback(
    (consoleId: number, action: 'on' | 'off', triggeredBy: string, sessionId?: string | null) => {
      ;(supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ error: unknown }>)(
        'set_console_power',
        { p_console_id: consoleId, p_action: action, p_session_id: sessionId ?? null, p_triggered_by: triggeredBy },
      )
        .then(() => loadLive())
        .catch((e) => console.error('power', e))
    },
    [loadLive],
  )

  const startSession: PlayroomState['startSession'] = useCallback(
    async ({ console_id, pricing_plan_id, duration_min, customer_name, payment_method, bank }) => {
      const target = consolesRef.current.find((c) => c.id === console_id)
      const { error } = await supabase.rpc('start_session', {
        p_console_id: console_id,
        p_plan_id: pricing_plan_id,
        p_duration_min: duration_min,
        p_customer_name: customer_name ?? undefined,
        p_payment_method: payment_method,
        p_bank: payment_method === 'cash' ? undefined : bank ?? undefined,
      })
      if (error) return pushToast('danger', error.message)
      pushToast('success', `${target?.name ?? 'კონსოლი'} — სესია დაიწყო`)
      await refetchLive()
      firePower(console_id, 'on', 'session_start')
    },
    [pushToast, refetchLive, firePower],
  )

  const startOpenSession: PlayroomState['startOpenSession'] = useCallback(
    async ({ console_id, pricing_plan_id, customer_name, payment_method, bank }) => {
      const target = consolesRef.current.find((c) => c.id === console_id)
      const { error } = await supabase.rpc('start_open_session', {
        p_console_id: console_id,
        p_plan_id: pricing_plan_id,
        p_customer_name: customer_name ?? undefined,
        p_payment_method: payment_method,
        p_bank: payment_method === 'cash' ? undefined : bank ?? undefined,
      })
      if (error) return pushToast('danger', error.message)
      pushToast('success', `${target?.name ?? 'კონსოლი'} — მიმდინარე სესია დაიწყო`)
      await refetchLive()
      firePower(console_id, 'on', 'session_start')
    },
    [pushToast, refetchLive, firePower],
  )

  const extendSession: PlayroomState['extendSession'] = useCallback(
    async (console_id, extra_minutes) => {
      const sid = consolesRef.current.find((c) => c.id === console_id)?.active_session?.id
      if (!sid) return
      const { error } = await supabase.rpc('extend_session', {
        p_session_id: sid,
        p_extra_min: extra_minutes,
      })
      if (error) return pushToast('danger', error.message)
      await refetchLive()
    },
    [pushToast, refetchLive],
  )

  const endSession: PlayroomState['endSession'] = useCallback(
    async (console_id, tip = 0) => {
      const sid = consolesRef.current.find((c) => c.id === console_id)?.active_session?.id
      if (!sid) return
      const { error } = await supabase.rpc('end_session', { p_session_id: sid, p_tip: tip })
      if (error) return pushToast('danger', error.message)
      firePower(console_id, 'off', 'session_end', sid)
      await refetchLive()
    },
    [pushToast, refetchLive, firePower],
  )

  const forceConsolePower = useCallback(
    async (consoleId: number, on: boolean) => {
      const { error } = await (
        supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
      )('set_console_power', {
        p_console_id: consoleId,
        p_action: on ? 'force_on' : 'force_off',
        p_session_id: null,
        p_triggered_by: 'admin_force',
      })
      if (error) return pushToast('danger', planErrorText(error.message))
      pushToast('success', on ? 'ჩაირთო ✅' : 'გამოირთო')
      await loadLive()
    },
    [pushToast, loadLive],
  )

  const endRef = useRef(endSession)
  endRef.current = endSession

  const updatePlanPrice: PlayroomState['updatePlanPrice'] = useCallback(
    async (id, price) => {
      const { error } = await supabase
        .from('pricing_plans')
        .update({ price_per_hour: price, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return pushToast('danger', error.message)
      await loadPlans()
      pushToast('success', 'ტარიფი განახლდა — ძალაში შედის ახალი სესიებიდან')
    },
    [pushToast, loadPlans],
  )

  const togglePlanActive: PlayroomState['togglePlanActive'] = useCallback(
    async (id) => {
      const current = plansRef.current.find((p) => p.id === id)
      if (!current) return
      const { error } = await supabase
        .from('pricing_plans')
        .update({ is_active: !current.is_active })
        .eq('id', id)
      if (error) return pushToast('danger', error.message)
      await loadPlans()
    },
    [pushToast, loadPlans],
  )

  const addPlan: PlayroomState['addPlan'] = useCallback(
    async ({ name, controllers, price_per_hour }) => {
      const org = orgRef.current
      if (!org) return
      const clean = name.trim()
      if (!clean) return pushToast('danger', 'შეიყვანე ტარიფის სახელი')
      // map controller count to a tier label; anything else is "custom"
      const type =
        controllers === 2 ? 'standard' :
        controllers === 3 ? 'pro' :
        controllers === 4 ? 'premium' : 'custom'
      const { error } = await supabase.from('pricing_plans').insert({
        org_id: org,
        name: clean,
        type,
        controllers,
        price_per_hour,
      })
      if (error) return pushToast('danger', error.message)
      await loadPlans()
      pushToast('success', `ტარიფი „${clean}" დაემატა`)
    },
    [pushToast, loadPlans],
  )

  const removePlan: PlayroomState['removePlan'] = useCallback(
    async (id) => {
      // Hard-delete; if past sessions reference it, fall back to deactivating.
      const { error } = await supabase.from('pricing_plans').delete().eq('id', id)
      if (error) {
        const { error: deErr } = await supabase
          .from('pricing_plans')
          .update({ is_active: false })
          .eq('id', id)
        if (deErr) return pushToast('danger', deErr.message)
        await loadPlans()
        return pushToast('info', 'ტარიფზე სესიებია — წაშლის ნაცვლად გაითიშა')
      }
      await loadPlans()
      pushToast('success', 'ტარიფი წაიშალა')
    },
    [pushToast, loadPlans],
  )

  const clockToggle: PlayroomState['clockToggle'] = useCallback(
    async (pin) => {
      const venue = venueRef.current
      if (!venue) {
        const r = { ok: false, message: 'ფილიალი არ არის არჩეული' }
        pushToast('danger', r.message)
        return r
      }
      const { data, error } = await supabase.rpc('clock_toggle', {
        p_pin: pin,
        p_venue_id: venue,
      })
      if (error) {
        pushToast('danger', error.message)
        return { ok: false, message: error.message }
      }
      const res = (data ?? {}) as unknown as {
        ok?: boolean
        action?: string
        employee?: string
        hours_worked?: number
        message?: string
      }
      let message: string
      if (!res.ok) {
        message = res.message ?? 'PIN არასწორია'
      } else if (res.action === 'out') {
        message = `ნახვამდის, ${res.employee}! დამუშავდა ${num(res.hours_worked).toFixed(2)} სთ`
      } else {
        message = `გამარჯობა, ${res.employee}! კარგ ცვლას გისურვებ`
      }
      pushToast(res.ok ? 'success' : 'danger', message)
      if (res.ok) await loadShifts()
      return { ok: !!res.ok, message }
    },
    [pushToast, loadShifts],
  )

  const refreshStaff: PlayroomState['refreshStaff'] = useCallback(async () => {
    await loadEmployees()
  }, [loadEmployees])

  // ---- per-second heartbeat: local status, notifications, auto-end ----
  const tick: PlayroomState['tick'] = useCallback(() => {
    const now = Date.now()
    const { warn_10_min, warn_5_min, auto_end_on_expire, sound_alerts } =
      settingsRef.current
    const cur = consolesRef.current
    const events: { id: number; name: string; status: ConsoleStatus }[] = []
    let changed = false

    const next = cur.map((c) => {
      if (!c.active_session) return c
      // open (pay-as-you-go) sessions have no end time — they never expire
      if (c.active_session.is_open || !c.active_session.ends_at) return c
      const left = (new Date(c.active_session.ends_at).getTime() - now) / 60_000
      let status: ConsoleStatus = 'active'
      if (left <= 0) status = 'expired'
      else if (left <= warn_5_min) status = 'warning_5'
      else if (left <= warn_10_min) status = 'warning_10'
      if (status !== c.status) {
        changed = true
        events.push({ id: c.id, name: c.name, status })
        return { ...c, status }
      }
      return c
    })

    if (changed) setConsoles(next)
    if (events.length === 0) return

    for (const ev of events) {
      if (ev.status === 'warning_10') {
        pushToast('warning', `${ev.name} — ${warn_10_min} წუთი დარჩა!`)
        if (sound_alerts) playWarning()
      } else if (ev.status === 'warning_5') {
        pushToast('danger', `${ev.name} — ${warn_5_min} წუთი დარჩა!`)
        if (sound_alerts) playWarning()
      } else if (ev.status === 'expired') {
        pushToast('expired', `${ev.name} — დრო ამოიწურა!`)
        if (sound_alerts) playExpired()
        if (auto_end_on_expire) endRef.current(ev.id)
      }
    }
  }, [pushToast])

  const value = useMemo<PlayroomState>(
    () => ({
      consoles,
      plans,
      employees,
      shifts,
      completed,
      settings,
      loading,
      toasts,
      pushToast,
      dismissToast,
      addConsole,
      renameConsole,
      removeConsole,
      forceConsolePower,
      updateSettings,
      resetSettings,
      startSession,
      startOpenSession,
      extendSession,
      endSession,
      refreshLive: refetchLive,
      tick,
      updatePlanPrice,
      togglePlanActive,
      addPlan,
      removePlan,
      clockToggle,
      refreshStaff,
    }),
    [
      consoles,
      plans,
      employees,
      shifts,
      completed,
      settings,
      loading,
      toasts,
      pushToast,
      dismissToast,
      addConsole,
      renameConsole,
      removeConsole,
      forceConsolePower,
      updateSettings,
      resetSettings,
      startSession,
      startOpenSession,
      extendSession,
      endSession,
      refetchLive,
      tick,
      updatePlanPrice,
      togglePlanActive,
      addPlan,
      removePlan,
      clockToggle,
      refreshStaff,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePlayroom() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePlayroom must be used within PlayroomProvider')
  return ctx
}
