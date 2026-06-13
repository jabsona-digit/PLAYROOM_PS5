'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users2, Mail, Copy, Trash2, Send, LoaderCircle, ShieldCheck, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { ROLE_LABELS, type OrgRole } from '@/lib/types'

// Roles an owner/admin can invite (not 'owner' — ownership comes from create_organization).
const INVITE_ROLES: OrgRole[] = ['admin', 'manager', 'accountant', 'cashier', 'operator']

interface Member { user_id: string; email: string; role: string; joined_at: string }
interface Invite { id: string; email: string; role: string; token: string; expires_at: string }

const inviteLink = (token: string) =>
  typeof window !== 'undefined' ? `${window.location.origin}/app?invite=${token}` : ''

export function TeamSettings() {
  const { currentOrgId, currentRole, isPlatformAdmin } = useOrg()
  const { pushToast } = usePlayroom()
  const canManage = currentRole === 'owner' || currentRole === 'admin' || isPlatformAdmin

  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('operator')
  const [busy, setBusy] = useState(false)
  const [meId, setMeId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!currentOrgId) return
    const [{ data: m }, { data: inv }] = await Promise.all([
      supabase.rpc('list_org_members', { p_org: currentOrgId }),
      supabase
        .from('org_invites')
        .select('id, email, role, token, expires_at')
        .eq('org_id', currentOrgId)
        .is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ])
    setMembers((m ?? []) as Member[])
    setInvites((inv ?? []) as Invite[])
  }, [currentOrgId])

  useEffect(() => {
    load()
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null))
  }, [load])

  const copy = (token: string) => {
    navigator.clipboard?.writeText(inviteLink(token)).then(
      () => pushToast('success', 'ბმული დაკოპირდა'),
      () => pushToast('info', inviteLink(token)),
    )
  }

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentOrgId || !email.trim() || busy) return
    setBusy(true)
    const { data, error } = await supabase.rpc('create_invite', {
      p_org: currentOrgId,
      p_email: email.trim(),
      p_role: role,
    })
    setBusy(false)
    if (error) {
      const map: Record<string, string> = {
        already_member: 'ეს ელფოსტა უკვე გუნდშია',
        invalid_email: 'ელფოსტა არასწორია',
        invalid_role: 'როლი არასწორია',
      }
      const key = Object.keys(map).find((k) => error.message.includes(k))
      return pushToast('danger', key ? map[key] : error.message)
    }
    const res = data as { token?: string } | null
    if (res?.token) {
      copy(res.token)
      pushToast('success', 'მოწვევა შეიქმნა — ბმული დაკოპირდა, გაუგზავნე თანამშრომელს')
    }
    setEmail('')
    load()
  }

  const revoke = async (id: string) => {
    const { error } = await supabase.rpc('revoke_invite', { p_invite_id: id })
    if (error) pushToast('danger', error.message)
    else {
      pushToast('info', 'მოწვევა გაუქმდა')
      load()
    }
  }

  const removeMember = async (m: Member) => {
    if (!currentOrgId) return
    if (m.role === 'owner') return pushToast('danger', 'მფლობელის წაშლა შეუძლებელია')
    if (m.user_id === meId) return pushToast('danger', 'საკუთარი თავის წაშლა შეუძლებელია')
    if (!confirm(`წაიშალოს ${m.email} გუნდიდან?`)) return
    const { error } = await supabase
      .from('org_members')
      .delete()
      .eq('org_id', currentOrgId)
      .eq('user_id', m.user_id)
    if (error) pushToast('danger', error.message)
    else {
      pushToast('info', 'წევრი წაიშალა')
      load()
    }
  }

  return (
    <section className="nm-raised rounded-3xl p-6 lg:col-span-2">
      <div className="mb-5 flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <Users2 className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">გუნდი</h2>
          <p className="text-xs text-muted-foreground">
            მოიწვიე თანამშრომელი ელფოსტით — მიიღებს თავის ლოგინს და როლს
          </p>
        </div>
      </div>

      {/* Invite form */}
      {canManage && (
        <form onSubmit={invite} className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="text-xs font-semibold text-muted-foreground">ელფოსტა</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@example.com"
              className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">როლი</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrgRole)}
              className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none appearance-none bg-transparent"
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r} className="bg-background">{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="nm-daylight flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
            მოწვევა
          </button>
        </form>
      )}

      {/* Members */}
      <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">წევრები</p>
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.user_id} className="nm-inset flex items-center justify-between rounded-2xl px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)]">
                {['owner', 'admin'].includes(m.role)
                  ? <ShieldCheck className="size-4 text-primary" />
                  : <Users2 className="size-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{m.email}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                  {ROLE_LABELS[m.role as OrgRole] ?? m.role}
                </p>
              </div>
            </div>
            {canManage && m.role !== 'owner' && m.user_id !== meId && (
              <button
                onClick={() => removeMember(m)}
                className="nm-btn flex size-8 items-center justify-center rounded-lg text-[var(--status-expired)]"
                aria-label="წაშლა"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Pending invites */}
      {invites.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
            მოლოდინში
          </p>
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li key={inv.id} className="nm-inset flex items-center justify-between gap-2 rounded-2xl px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{inv.email}</p>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                      {ROLE_LABELS[inv.role as OrgRole] ?? inv.role} • მოლოდინში
                    </p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => copy(inv.token)}
                      className="nm-btn flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-primary"
                    >
                      <Copy className="size-3.5" /> ბმული
                    </button>
                    <button
                      onClick={() => revoke(inv.id)}
                      className="nm-btn flex size-8 items-center justify-center rounded-lg text-[var(--status-expired)]"
                      aria-label="გაუქმება"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
