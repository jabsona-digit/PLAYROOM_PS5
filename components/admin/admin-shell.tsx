'use client'

import { useEffect, useState } from 'react'
import { Eye, LoaderCircle, Lock } from 'lucide-react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import type { ModuleKey } from '@/lib/types'
import { PlayroomProvider, usePlayroom } from '@/lib/store'
import { OrgProvider, useOrg } from '@/lib/org'
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
import { AiAssistant } from './ai-assistant'
import { ToastViewport } from './toast'

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

function Workspace({ email }: { email?: string }) {
  const [active, setActive] = useState<ModuleKey>('dashboard')

  const logout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <PlayroomProvider>
      <Heartbeat />
      <div className="flex min-h-screen w-full bg-background p-3 md:p-5">
        <div className="nm-raised flex w-full overflow-hidden rounded-[2rem]">
          <Sidebar
            active={active}
            onSelect={setActive}
            email={email}
            onLogout={logout}
          />

          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
            <ImpersonationBar onBack={() => setActive('platform')} />
            <Topbar active={active} />
            <div className="mt-8">
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
              {active === 'platform' && (
                <PlatformConsole onViewAs={() => setActive('dashboard')} />
              )}
            </div>
          </main>
        </div>
      </div>
      <AiAssistant />
      <ToastViewport />
    </PlayroomProvider>
  )
}

/* Inside OrgProvider: decide between loading / onboarding / the workspace. */
function OrgGate({ email }: { email?: string }) {
  const { loading, needsOnboarding, suspended } = useOrg()
  if (loading) return <Splash />
  if (needsOnboarding) return <Onboarding />
  if (suspended) return <Suspended email={email} />
  return <Workspace email={email} />
}

export function AdminShell() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
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
