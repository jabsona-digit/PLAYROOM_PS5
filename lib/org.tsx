'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from './supabase/client'
import type { ModuleKey, OrgRole, Venue } from './types'

const VENUE_KEY = 'playroom:venue'
const ORG_KEY = 'playroom:org'
const EMP_KEY = 'playroom:employee'

export interface OrgSummary {
  id: string
  name: string
  plan: string
  subscription_status: string
}

export interface ActiveEmployee {
  id: number
  name: string
  role: OrgRole
}

interface OrgState {
  loading: boolean
  needsOnboarding: boolean
  suspended: boolean // current org is canceled and the user is not a platform admin
  isPlatformAdmin: boolean
  orgs: OrgSummary[] // every org the user can access (RLS-scoped; all of them for a platform admin)
  memberOrgIds: string[] // orgs where the user is actually a member
  venues: Venue[] // venues of the current org
  currentOrgId: string | null
  currentVenueId: string | null
  currentRole: OrgRole | null // role of the AUTH user in the current org
  activeEmployee: ActiveEmployee | null
  activeRole: OrgRole | null // role of the PIN-authenticated employee (or currentRole if no employees)
  hasEmployees: boolean
  impersonating: boolean // platform admin viewing an org they're not a member of
  setCurrentOrg: (orgId: string) => void
  setCurrentVenue: (venueId: string) => void
  signInWithPin: (pin: string) => Promise<{ ok: boolean; error?: string }>
  lockTerminal: () => void
  stopImpersonating: () => void
  refresh: () => Promise<void>
}

const MODULE_ROLES: Record<ModuleKey, OrgRole[]> = {
  dashboard:    ['owner', 'admin', 'manager', 'cashier', 'operator'],
  pos:          ['owner', 'admin', 'manager', 'cashier', 'operator'],
  cashier:      ['owner', 'admin', 'manager', 'accountant', 'cashier'],
  accounting:   ['owner', 'admin', 'accountant'],
  history:      ['owner', 'admin', 'manager', 'cashier'],
  pricing:      ['owner', 'admin'],
  inventory:    ['owner', 'admin', 'manager'],
  customers:    ['owner', 'admin', 'manager', 'cashier'],
  employees:    ['owner', 'admin'],
  settings:     ['owner', 'admin'],
  reservations: ['owner', 'admin', 'manager', 'cashier'],
  billing:      ['owner'],
  platform:     [], // handled by isPlatformAdmin
}

export function useModuleAccess(key: ModuleKey): boolean {
  const { activeRole, isPlatformAdmin } = useOrg()
  if (isPlatformAdmin) return true
  if (!activeRole) return false
  return MODULE_ROLES[key]?.includes(activeRole) ?? false
}

// Preferred landing order — the first module a role can access. Used to redirect
// when a role lands on a module it can't see (e.g. accountant has no dashboard).
const MODULE_ORDER: ModuleKey[] = [
  'dashboard', 'accounting', 'cashier', 'pos', 'reservations', 'history',
  'inventory', 'customers', 'pricing', 'employees', 'settings', 'billing',
]
export function firstAllowedModule(role: OrgRole): ModuleKey {
  return MODULE_ORDER.find((m) => MODULE_ROLES[m].includes(role)) ?? 'dashboard'
}

const Ctx = createContext<OrgState | null>(null)

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [orgs, setOrgs] = useState<OrgSummary[]>([])
  const [memberRoles, setMemberRoles] = useState<{ org_id: string; role: OrgRole }[]>([])
  const [allVenues, setAllVenues] = useState<Venue[]>([])
  const [currentOrgId, setOrgId] = useState<string | null>(null)
  const [currentVenueId, setVenueId] = useState<string | null>(null)
  
  const [activeEmployee, setActiveEmployee] = useState<ActiveEmployee | null>(null)
  const [hasEmployees, setHasEmployees] = useState(false)

  // Load active employee from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(EMP_KEY)
    if (stored) {
      try {
        const { emp, timestamp } = JSON.parse(stored)
        // Auto-clear after 8 hours
        if (Date.now() - timestamp < 8 * 3600_000) {
          setActiveEmployee(emp)
        } else {
          sessionStorage.removeItem(EMP_KEY)
        }
      } catch (e) {
        sessionStorage.removeItem(EMP_KEY)
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    const [orgRes, memberRes, plat, venueRes] = await Promise.all([
      supabase.from('organizations').select('id, name, plan, subscription_status'),
      uid
        ? supabase.from('org_members').select('org_id, role').eq('user_id', uid)
        : Promise.resolve({ data: [] as { org_id: string; role: string }[] }),
      supabase.rpc('is_platform_admin'),
      supabase.from('venues').select('id, org_id, name, is_active').order('name'),
    ])

    const orgList = (orgRes.data ?? []) as OrgSummary[]
    setOrgs(orgList)
    setMemberRoles(
      (memberRes.data ?? []).map((m) => ({ org_id: m.org_id, role: m.role as OrgRole })),
    )
    setIsPlatformAdmin(plat.data === true)
    setAllVenues((venueRes.data ?? []) as Venue[])

    setOrgId((prev) => {
      const valid = (id: string | null) => !!id && orgList.some((o) => o.id === id)
      const stored =
        (typeof localStorage !== 'undefined' && localStorage.getItem(ORG_KEY)) || null
      return valid(prev) ? prev : valid(stored) ? stored : orgList[0]?.id ?? null
    })
  }, [])

  // Employees are ORG-scoped (no venue_id column). PIN gate applies whenever the
  // current org has at least one active employee.
  useEffect(() => {
    if (!currentOrgId) {
      setHasEmployees(false)
      return
    }
    ;(supabase.from('employees') as any)
      .select('id', { count: 'exact', head: true })
      .eq('org_id', currentOrgId)
      .eq('is_active', true)
      .then(({ count }: { count: number | null }) => {
        setHasEmployees((count ?? 0) > 0)
      })
  }, [currentOrgId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await refresh()
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [refresh])

  // resolve a venue inside the current org + persist
  useEffect(() => {
    if (!currentOrgId) {
      setVenueId(null)
      return
    }
    localStorage.setItem(ORG_KEY, currentOrgId)
    const venuesOfOrg = allVenues.filter((v) => v.org_id === currentOrgId)
    setVenueId((prev) => {
      const stored = localStorage.getItem(VENUE_KEY)
      const inOrg = (id: string | null) => !!id && venuesOfOrg.some((v) => v.id === id)
      return inOrg(prev) ? prev : inOrg(stored) ? stored : venuesOfOrg[0]?.id ?? null
    })
  }, [currentOrgId, allVenues])

  useEffect(() => {
    if (currentVenueId) localStorage.setItem(VENUE_KEY, currentVenueId)
  }, [currentVenueId])

  const memberOrgIds = useMemo(() => memberRoles.map((m) => m.org_id), [memberRoles])
  const venues = useMemo(
    () => allVenues.filter((v) => v.org_id === currentOrgId),
    [allVenues, currentOrgId],
  )
  const currentRole = useMemo(
    () => memberRoles.find((m) => m.org_id === currentOrgId)?.role ?? null,
    [memberRoles, currentOrgId],
  )
  
  // If no employees, the AUTH user's role is used. Otherwise, activeEmployee's role.
  const activeRole = useMemo(() => {
    if (!hasEmployees) return currentRole
    return activeEmployee?.role ?? null
  }, [hasEmployees, activeEmployee, currentRole])

  const impersonating = useMemo(
    () => isPlatformAdmin && !!currentOrgId && !memberOrgIds.includes(currentOrgId),
    [isPlatformAdmin, currentOrgId, memberOrgIds],
  )
  // A canceled tenant is frozen for its own members. Platform admins are never
  // locked out (God Mode must be able to inspect a suspended tenant).
  const suspended = useMemo(
    () =>
      !isPlatformAdmin &&
      orgs.find((o) => o.id === currentOrgId)?.subscription_status === 'canceled',
    [isPlatformAdmin, orgs, currentOrgId],
  )

  const stopImpersonating = useCallback(() => {
    setOrgId(memberOrgIds[0] ?? null)
  }, [memberOrgIds])

  const signInWithPin = useCallback(async (pin: string) => {
    if (!currentVenueId) return { ok: false, error: 'venue_not_found' }
    
    try {
      const { data, error } = await (supabase.rpc as any)('identify_by_pin', {
        p_pin: pin,
        p_venue_id: currentVenueId
      })

      if (error) {
        if (error.message.includes('rate_limit_exceeded')) {
          return { ok: false, error: 'rate_limit_exceeded' }
        }
        return { ok: false, error: 'invalid_pin' }
      }

      const res = data as { ok: boolean; employee_id: number; employee_name: string; role: string; error?: string } | null

      if (res && res.ok) {
        const emp = {
          id: res.employee_id,
          name: res.employee_name,
          role: res.role as OrgRole
        }
        setActiveEmployee(emp)
        sessionStorage.setItem(EMP_KEY, JSON.stringify({ emp, timestamp: Date.now() }))
        return { ok: true }
      }

      return { ok: false, error: res?.error || 'invalid_pin' }
    } catch (e: any) {
      if (e.message?.includes('rate_limit_exceeded')) {
        return { ok: false, error: 'rate_limit_exceeded' }
      }
      return { ok: false, error: 'unknown_error' }
    }
  }, [currentVenueId])

  const lockTerminal = useCallback(() => {
    setActiveEmployee(null)
    sessionStorage.removeItem(EMP_KEY)
  }, [])

  const value = useMemo<OrgState>(
    () => ({
      loading,
      needsOnboarding: !loading && orgs.length === 0,
      suspended: !!suspended,
      isPlatformAdmin,
      orgs,
      memberOrgIds,
      venues,
      currentOrgId,
      currentVenueId,
      currentRole,
      activeEmployee,
      activeRole,
      hasEmployees,
      impersonating,
      setCurrentOrg: setOrgId,
      setCurrentVenue: setVenueId,
      signInWithPin,
      lockTerminal,
      stopImpersonating,
      refresh,
    }),
    [
      loading,
      orgs,
      suspended,
      isPlatformAdmin,
      memberOrgIds,
      venues,
      currentOrgId,
      currentVenueId,
      currentRole,
      activeEmployee,
      activeRole,
      hasEmployees,
      impersonating,
      signInWithPin,
      lockTerminal,
      stopImpersonating,
      refresh,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOrg() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
