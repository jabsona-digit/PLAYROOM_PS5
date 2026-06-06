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
import type { OrgRole, Venue } from './types'

const VENUE_KEY = 'playroom:venue'
const ORG_KEY = 'playroom:org'

export interface OrgSummary {
  id: string
  name: string
  plan: string
  subscription_status: string
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
  currentRole: OrgRole | null
  impersonating: boolean // platform admin viewing an org they're not a member of
  setCurrentOrg: (orgId: string) => void
  setCurrentVenue: (venueId: string) => void
  stopImpersonating: () => void
  refresh: () => Promise<void>
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
      impersonating,
      setCurrentOrg: setOrgId,
      setCurrentVenue: setVenueId,
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
      impersonating,
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
