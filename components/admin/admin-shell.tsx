'use client'

import { useEffect, useState, useRef } from 'react'
import { Eye, LoaderCircle, Lock, Clock } from 'lucide-react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import type { ModuleKey } from '@/lib/types'
import { PlayroomProvider, usePlayroom } from '@/lib/store'
import { OrgProvider, useOrg, useModuleAccess, useModuleRoleAccess, firstAllowedModule } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { Dashboard } from './dashboard'
import { Pos } from './pos'
import { Cashier } from './cashier'
import { HistoryModule } from './history'
import { Pricing } from './pricing'
import { Inventory } from './inventory'
import { Customers } from './customers'
import { Employees } from './employees'
import { Settings } from './settings'
import { Login } from './login'
import { Onboarding } from './onboarding'
import { PlatformConsole } from './platform'
import { Billing } from './billing'
import { Accounting } from './accounting'
import { Reservations } from './reservations'
import { OnlineBookings } from './online-bookings'
import { Tournaments } from './tournaments'
import { Guide } from './guide'
import { RevpachAnalytics } from './analytics-v2'
import { BookingAlertsProvider } from './booking-alerts'
import { ServiceInbox } from './service-inbox'
import { AiAssistant } from './ai-assistant'
import { ToastViewport } from './toast'
import { PinGate } from './pin-gate'

/* Single app-wide heartbeat: drives status changes, timer notifications and
   auto-end regardless of which tab is open. Lives inside the provider. */
function Heartbeat() {
  const { tick } = usePlayroom()
  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tick])
  return null
}

function Splash() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <LoaderCircle className="size-8 animate-spin text-primary" />
    </div>
  )
}

function Suspended({ email }: { email?: string }) {
  const logout = async () => {
    await supabase.auth.signOut()
  }
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-5">
      <div className="nm-raised flex max-w-md flex-col items-center gap-5 rounded-[2rem] p-10 text-center">
        <div
          className="flex size-16 items-center justify-center rounded-3xl"
          style={{
            background: 'color-mix(in oklch, var(--status-expired) 16%, transparent)',
            boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--status-expired) 45%, transparent)',
          }}
        >
          <Lock className="size-7" style={{ color: 'var(--status-expired)' }} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold">ანგარიში შეჩერებულია</h2>
          <p className="text-sm text-muted-foreground">
            თქვენი ორგანიზაციის წვდომა დროებით შეზღუდულია. გასააქტიურებლად
            დაუკავშირდით ადმინისტრაციას.
          </p>
        </div>
        {email && (
          <p className="nm-inset rounded-2xl px-4 py-2 text-xs font-semibold text-muted-foreground">
            {email}
          </p>
        )}
        <button
          type="button"
          onClick={logout}
          className="nm-btn rounded-2xl px-6 py-3 text-sm font-bold text-muted-foreground"
        >
          გასვლა
        </button>
      </div>
    </div>
  )
}

function ImpersonationBar({ onBack }: { onBack: () => void }) {
  const { impersonating, orgs, currentOrgId, stopImpersonating } = useOrg()
  if (!impersonating) return null
  const name = orgs.find((o) => o.id === currentOrgId)?.name ?? 'ორგანიზაცია'
  return (
    <div
      className="mb-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
      style={{
        background: 'color-mix(in oklch, var(--status-warning10) 16%, transparent)',
        boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--status-warning10) 45%, transparent)',
      }}
    >
      <p
        className="flex items-center gap-2 text-sm font-bold"
        style={{ color: 'var(--status-warning10)' }}
      >
        <Eye className="size-4" />
        ხედავ „{name}"-ის პანელს (God Mode)
      </p>
      <button
        type="button"
        onClick={() => {
          stopImpersonating()
          onBack()
        }}
        className="nm-btn rounded-xl px-3 py-1.5 text-xs font-bold"
      >
        გასვლა
      </button>
    </div>
  )
}

// Operator/cashier attendance: auto-opens a shift on login and offers an explicit
// "end shift". Rendered inside the providers so it can toast. Shifts feed payroll.
function ShiftBadge() {
  const { currentRole, currentVenueId } = useOrg()
  const { pushToast } = usePlayroom()
  const [open, setOpen] = useState(false)
  const startedRef = useRef(false)
  const isShiftRole = currentRole === 'operator' || currentRole === 'cashier'

  useEffect(() => {
    if (!isShiftRole || !currentVenueId || startedRef.current) return
    startedRef.current = true
    supabase.rpc('start_shift', { p_venue_id: currentVenueId }).then(({ data }) => {
      const r = data as { ok?: boolean; started?: boolean; already_open?: boolean } | null
      if (r?.ok) {
        setOpen(true)
        if (r.started) pushToast('success', 'ცვლა დაიწყო')
      }
    })
  }, [isShiftRole, currentVenueId, pushToast])

  if (!isShiftRole || !open) return null

  const end = async () => {
    if (!currentVenueId || !confirm('დაასრულო ცვლა?')) return
    await supabase.rpc('end_shift', { p_venue_id: currentVenueId })
    setOpen(false)
    startedRef.current = true // don't auto-reopen until next login
    pushToast('info', 'ცვლა დასრულდა')
  }

  return (
    <button
      type="button"
      onClick={end}
      title="ცვლის დასრულება"
      className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-[var(--status-free)]"
    >
      <Clock className="size-3.5" />
      ცვლაზე
    </button>
  )
}

function PlanUpgradeNotice({ plan, onUpgrade }: { plan: string; onUpgrade: () => void }) {
  const next = plan === 'trial' ? 'PRO' : 'ENTERPRISE'
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="nm-inset flex size-16 items-center justify-center rounded-3xl">
        <Lock className="size-7 text-primary" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-black">ეს მოდული შენს გეგმაში არ შედის</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          გასახსნელად გადადი <b>{next}</b> გეგმაზე.
        </p>
      </div>
      <button
        onClick={onUpgrade}
        className="nm-daylight rounded-2xl px-6 py-3 text-sm font-bold text-primary transition-transform active:scale-95"
      >
        გეგმის ნახვა / გაუმჯობესება
      </button>
    </div>
  )
}

function Workspace({ email }: { email?: string }) {
  const { activeEmployee, hasEmployees, activeRole, isPlatformAdmin, impersonating, currentRole, currentVenueId, plan } = useOrg()
  const [active, setActive] = useState<ModuleKey>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Two-axis gating: ROLE decides which modules exist for you; PLAN decides which
  // of those your subscription unlocks. A role block jumps you to another module;
  // a plan block keeps you here and shows an upgrade notice (see render below).
  const canAccess = useModuleAccess(active)        // role AND plan
  const roleAccess = useModuleRoleAccess(active)   // role only
  const planBlocked = roleAccess && !canAccess     // role ok, plan too low
  useEffect(() => {
    if (!roleAccess && activeRole && !isPlatformAdmin) {
      const fallback = firstAllowedModule(activeRole)
      if (fallback !== active) setActive(fallback)
    }
  }, [roleAccess, activeRole, active, isPlatformAdmin])

  const logout = async () => {
    // Close the operator/cashier's own shift before signing out.
    if ((currentRole === 'operator' || currentRole === 'cashier') && currentVenueId) {
      try { await supabase.rpc('end_shift', { p_venue_id: currentVenueId }) } catch { /* ignore */ }
    }
    await supabase.auth.signOut()
  }

  const handleSelect = (key: ModuleKey) => {
    setActive(key)
    setSidebarOpen(false)
  }

  // If the org has employees, the terminal is PIN-locked until either an employee
  // signs in OR an owner/admin taps "enter as owner" (activeRole becomes non-null).
  // A platform admin viewing a tenant via God Mode ("view as") is NOT a member and
  // has no employee PIN there — never lock them out of their own God Mode.
  if (hasEmployees && !activeEmployee && !activeRole && !impersonating) {
    return (
      <PlayroomProvider>
        <PinGate />
        <ToastViewport />
      </PlayroomProvider>
    )
  }

  return (
    <PlayroomProvider>
      <Heartbeat />
      <BookingAlertsProvider>
      <div className="flex min-h-screen w-full bg-background p-3 md:p-5">
        <div className="nm-raised flex w-full overflow-hidden rounded-[2rem]">
          <Sidebar
            active={active}
            onSelect={handleSelect}
            email={email}
            onLogout={logout}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
            <ImpersonationBar onBack={() => setActive('platform')} />
            <div className="flex justify-end empty:hidden [&:not(:empty)]:mb-3">
              <ShiftBadge />
            </div>
            <Topbar
              active={active}
              onMenuClick={() => setSidebarOpen(true)}
              onBellClick={() => handleSelect('online_bookings')}
            />
            <div className="mt-8 animate-in slide-in-from-bottom-4 duration-500">
              {planBlocked && <PlanUpgradeNotice plan={plan} onUpgrade={() => setActive('billing')} />}
              {!planBlocked && <>
              {active === 'dashboard' && <Dashboard />}
              {active === 'pos' && <Pos />}
              {active === 'cashier' && <Cashier />}
              {active === 'history' && <HistoryModule />}
              {active === 'pricing' && <Pricing />}
              {active === 'inventory' && <Inventory />}
              {active === 'customers' && <Customers />}
              {active === 'employees' && <Employees />}
              {active === 'settings' && <Settings />}
              {active === 'billing' && <Billing />}
              {active === 'accounting' && <Accounting />}
              {active === 'reservations' && <Reservations />}
              {active === 'online_bookings' && <OnlineBookings />}
              {active === 'tournaments' && <Tournaments />}
              {active === 'guide' && <Guide />}
              {active === 'analytics' && <RevpachAnalytics />}
              {active === 'platform' && (
                <PlatformConsole onViewAs={() => setActive('dashboard')} />
              )}
              </>}
            </div>
          </main>
        </div>
      </div>
      <ServiceInbox />
      <AiAssistant />
      <ToastViewport />
      </BookingAlertsProvider>
    </PlayroomProvider>
  )
}

const INVITE_ERRORS: Record<string, string> = {
  email_mismatch: 'მოწვევა სხვა ელფოსტაზეა გამოწერილი — გადი და შედი იმ ელფოსტით, რომელზეც მოგიწვიეს.',
  expired: 'მოწვევის ვადა გავიდა. სთხოვე მფლობელს ახალი მოწვევა.',
  already_used: 'ეს მოწვევა უკვე გამოყენებულია.',
  invalid: 'მოწვევა ვერ მოიძებნა.',
  unauthorized: 'ავტორიზაცია საჭიროა.',
}

/* Inside OrgProvider: claim a pending invite, then decide loading / onboarding /
   the workspace. A freshly-invited user has no org yet, so the claim must run
   BEFORE the onboarding decision (otherwise they'd land on the create-org flow). */
function OrgGate({ email }: { email?: string }) {
  const { loading, needsOnboarding, suspended, refresh, setCurrentOrg } = useOrg()
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const claimedRef = useRef(false)

  useEffect(() => {
    if (loading || claimedRef.current) return
    const token = localStorage.getItem('playroom:pending-invite')
    if (!token) return
    claimedRef.current = true
    setClaiming(true)
    ;(async () => {
      const { data, error } = await supabase.rpc('accept_invite', { p_token: token })
      localStorage.removeItem('playroom:pending-invite')
      const res = data as { ok?: boolean; org_id?: string; error?: string } | null
      if (res?.ok && res.org_id) {
        await refresh()
        setCurrentOrg(res.org_id)
      } else {
        setClaimError(INVITE_ERRORS[res?.error ?? ''] ?? error?.message ?? 'მოწვევა ვერ მიიღო')
      }
      setClaiming(false)
    })()
  }, [loading, refresh, setCurrentOrg])

  if (loading || claiming) return <Splash />
  if (claimError) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
        <div className="nm-raised w-full max-w-sm rounded-3xl p-8 text-center">
          <p className="text-base font-extrabold">მოწვევა</p>
          <p className="mt-3 text-sm text-muted-foreground text-pretty">{claimError}</p>
          <button
            onClick={() => setClaimError(null)}
            className="nm-btn mt-6 w-full rounded-2xl py-3 text-sm font-bold text-primary"
          >
            გაგრძელება
          </button>
        </div>
      </div>
    )
  }
  if (needsOnboarding) return <Onboarding />
  if (suspended) return <Suspended email={email} />
  return <Workspace email={email} />
}

export function AdminShell() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Capture an invite token from the URL (?invite=…) so it survives the
    // login/signup round-trip; OrgGate claims it once there's a session.
    try {
      const url = new URL(window.location.href)
      const token = url.searchParams.get('invite')
      if (token) {
        localStorage.setItem('playroom:pending-invite', token)
        url.searchParams.delete('invite')
        window.history.replaceState({}, '', url.toString())
      }
    } catch {
      /* ignore */
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (checking) return <Splash />
  if (!session) return <Login />
  return (
    <OrgProvider>
      <OrgGate email={session.user.email} />
    </OrgProvider>
  )
}
