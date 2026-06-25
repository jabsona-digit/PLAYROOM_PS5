'use client'

import { useState } from 'react'
import { Building2, LoaderCircle, LogOut, Sparkles, UserPlus, ArrowRight, X, User } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/org'
import { ROLE_LABELS, type OrgRole } from '@/lib/types'

export function Onboarding() {
  const { refresh, currentOrgId } = useOrg()
  const [step, setStep] = useState(1)
  
  // Step 1: Org
  const [orgName, setOrgName] = useState('')
  const [venueName, setVenueName] = useState('')
  const [tin, setTin] = useState('')
  const [phone, setPhone] = useState('')
  
  // Step 2: Employees
  const [employees, setEmployees] = useState<{name: string, role: OrgRole, pin: string}[]>([])
  const [newE, setNewE] = useState({name: '', role: 'operator' as OrgRole, pin: ''})
  
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.rpc('create_organization', {
      p_org_name: orgName,
      p_venue_name: venueName || 'მთავარი ფილიალი',
      p_identification_code: tin.trim() || undefined,
      p_contact_phone: phone.trim(),
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    await refresh()
    setStep(2)
    setLoading(false)
  }

  const addStaff = async () => {
    if (!newE.name || newE.pin.length < 4) return
    setEmployees([...employees, newE])
    setNewE({name: '', role: 'operator', pin: ''})
  }

  const finish = async () => {
    if (!currentOrgId) return
    setLoading(true)
    for (const e of employees) {
      await supabase.rpc('create_employee', {
        p_org_id: currentOrgId,
        p_name: e.name,
        p_role: e.role,
        p_pin: e.pin
      })
    }
    await refresh()
    // Shell will take over once org state is refreshed
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="nm-raised w-full max-w-lg rounded-[2rem] p-8">
        
        {step === 1 && (
          <>
            <div className="flex flex-col items-center text-center">
              <div className="nm-raised-sm flex size-16 items-center justify-center rounded-3xl">
                <Sparkles className="size-8 text-primary" />
              </div>
              <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
                მოგესალმები! 👋
              </h1>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                შექმენი შენი ორგანიზაცია და პირველი ფილიალი.
              </p>
            </div>

            <form onSubmit={createOrg} className="mt-8 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ორგანიზაციის სახელი</span>
                <input
                  required autoFocus
                  value={orgName} onChange={(e) => setOrgName(e.target.value)}
                  placeholder="მაგ. Martelounge Saburtalo"
                  className="nm-inset mt-2 w-full rounded-2xl px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground/40 font-bold"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ფილიალის სახელი</span>
                  <input
                    value={venueName} onChange={(e) => setVenueName(e.target.value)}
                    placeholder="მთავარი ფილიალი"
                    className="nm-inset mt-2 w-full rounded-2xl px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground/40 font-bold"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">საიდენტიფიკაციო კოდი</span>
                  <input
                    value={tin} onChange={(e) => setTin(e.target.value)}
                    placeholder="ოპციონალური"
                    className="nm-inset mt-2 w-full rounded-2xl px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground/40 font-bold font-mono"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">საკონტაქტო ტელეფონი *</span>
                <input
                  required type="tel" inputMode="tel"
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="5XX XXX XXX"
                  className="nm-inset mt-2 w-full rounded-2xl px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground/40 font-bold font-mono"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">ქართული მობილური — დაგვჭირდება შენთან დასაკავშირებლად.</span>
              </label>

              {error && <p className="text-center text-sm font-semibold text-[var(--status-expired)]">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="nm-daylight flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black text-primary disabled:opacity-60 mt-4 transition-transform hover:scale-[1.01]"
              >
                {loading ? <LoaderCircle className="size-5 animate-spin" /> : (
                  <>შემდეგი <ArrowRight className="size-4" /></>
                )}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex flex-col items-center text-center">
              <div className="nm-raised-sm flex size-16 items-center justify-center rounded-3xl">
                <UserPlus className="size-8 text-primary" />
              </div>
              <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
                პერსონალი 👥
              </h1>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                დაამატე თანამშრომლები ან გამოტოვე ეს ნაბიჯი.
              </p>
            </div>

            <div className="mt-8 space-y-4">
              <div className="nm-inset rounded-2xl p-4 space-y-3">
                <div className="flex gap-2">
                  <input 
                    placeholder="სახელი"
                    value={newE.name} onChange={e => setNewE({...newE, name: e.target.value})}
                    className="nm-raised flex-1 rounded-xl px-3 py-2 text-sm outline-none font-bold"
                  />
                  <input 
                    placeholder="PIN" type="password" maxLength={6}
                    value={newE.pin} onChange={e => setNewE({...newE, pin: e.target.value})}
                    className="nm-raised w-20 rounded-xl px-3 py-2 text-sm outline-none font-mono text-center"
                  />
                </div>
                <div className="flex gap-2">
                  <select 
                    value={newE.role} onChange={e => setNewE({...newE, role: e.target.value as OrgRole})}
                    className="nm-raised flex-1 rounded-xl px-3 py-2 text-sm outline-none bg-transparent"
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k} className="bg-background">{v}</option>
                    ))}
                  </select>
                  <button 
                    onClick={addStaff}
                    className="nm-btn px-4 rounded-xl text-primary font-bold text-sm"
                  >
                    დამატება
                  </button>
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {employees.map((e, i) => (
                  <div key={i} className="nm-raised flex items-center justify-between rounded-xl px-4 py-2 text-sm">
                    <div className="flex items-center gap-3">
                      <User className="size-4 text-muted-foreground" />
                      <span className="font-bold">{e.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">{ROLE_LABELS[e.role]}</span>
                    </div>
                    <button onClick={() => setEmployees(employees.filter((_, idx) => idx !== i))}>
                      <X className="size-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={refresh}
                  className="nm-btn flex-1 rounded-2xl py-3.5 text-sm font-bold text-muted-foreground"
                >
                  გამოტოვება
                </button>
                <button
                  onClick={finish}
                  disabled={loading || employees.length === 0}
                  className="nm-daylight flex-[2] rounded-2xl py-3.5 text-sm font-black text-primary disabled:opacity-50"
                >
                  {loading ? <LoaderCircle className="size-5 animate-spin" /> : 'დასრულება'}
                </button>
              </div>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="mx-auto mt-8 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="size-3.5" />
          გასვლა
        </button>
      </div>
    </div>
  )
}
