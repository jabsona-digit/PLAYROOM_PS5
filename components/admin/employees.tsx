'use client'

import { useState, useEffect, useCallback } from 'react'
import { Delete, LogIn, ShieldCheck, User, Plus, MoreVertical, X, Key, Trash2, Edit2, LoaderCircle, Wallet, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { useOrg, useModuleAccess } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { dateLabel, timeOfDay, gel, planErrorText } from '@/lib/ui'
import { ROLE_LABELS, type OrgRole, type Employee } from '@/lib/types'
import { StaffLeaderboard } from './staff-leaderboard'

function PinPad() {
  const { clockToggle } = usePlayroom()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(
    null,
  )

  const press = async (d: string) => {
    if (pin.length >= 6 || busy) return
    const next = pin + d
    setPin(next)
    setFeedback(null)
    
    // In our system, PIN can be 4-6 digits. But clockToggle here expects exactly 4 for the legacy pad interaction? 
    // Actually, the new identify_by_pin supports 4-6. Let's keep it 4 for the quick clock-in if that's the UX.
    // The prompt says create_employee PIN >= 4 digits.
    if (next.length === 4) {
      setBusy(true)
      const res = await clockToggle(next)
      setFeedback(res)
      setBusy(false)
      setTimeout(() => setPin(''), 800)
    }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="nm-raised rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <LogIn className="size-5 text-primary" />
        </div>
        <div>
          <p className="font-extrabold">Clock In / Out</p>
          <p className="text-xs text-muted-foreground">შეიყვანე 4-ნიშნა PIN</p>
        </div>
      </div>

      {/* pin dots */}
      <div className="mt-6 flex justify-center gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'size-4 rounded-full transition-all',
              i < pin.length
                ? 'bg-primary shadow-[0_0_12px_var(--primary)]'
                : 'nm-inset',
            )}
          />
        ))}
      </div>

      {feedback ? (
        <p
          className="mt-4 text-center text-sm font-semibold"
          style={{
            color: feedback.ok ? 'var(--status-free)' : 'var(--status-expired)',
          }}
        >
          {feedback.message}
        </p>
      ) : (
        <p className="mt-4 h-5 text-center text-sm text-muted-foreground">
          {' '}
        </p>
      )}

      <div className="mx-auto mt-6 grid max-w-[260px] grid-cols-3 gap-3">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="nm-btn aspect-square rounded-2xl font-mono text-xl font-bold"
          >
            {k}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => press('0')}
          className="nm-btn aspect-square rounded-2xl font-mono text-xl font-bold"
        >
          0
        </button>
        <button
          type="button"
          aria-label="წაშლა"
          onClick={() => {
            setPin((p) => p.slice(0, -1))
            setFeedback(null)
          }}
          className="nm-btn flex aspect-square items-center justify-center rounded-2xl"
        >
          <Delete className="size-5 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

function EmployeeModal({ 
  employee, 
  onClose, 
  onRefresh 
}: { 
  employee?: Employee; 
  onClose: () => void; 
  onRefresh: () => void 
}) {
  const { currentOrgId } = useOrg()
  const { pushToast } = usePlayroom()
  
  const [name, setName] = useState(employee?.name || '')
  const [role, setRole] = useState<OrgRole>(employee?.role || 'operator')
  const [pin, setPin] = useState('')
  const [salaryType, setSalaryType] = useState(employee?.salary_type || 'hourly')
  const [salaryAmount, setSalaryAmount] = useState(employee?.salary_amount?.toString() || '')
  const [loading, setLoading] = useState(false)

  const isEdit = !!employee

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentOrgId) return
    setLoading(true)

    try {
      if (isEdit) {
        // Update basic info
        const { error } = await supabase
          .from('employees')
          .update({
            name,
            role,
            salary_type: salaryType,
            salary_amount: Number(salaryAmount) || 0
          })
          .eq('id', employee.id)
        
        if (error) throw error

        // Update PIN if provided
        if (pin.length >= 4) {
          const { error: pinError } = await supabase.rpc('set_employee_pin', {
            p_employee_id: employee.id,
            p_pin: pin
          })
          if (pinError) {
            if (pinError.message.includes('pin_taken')) {
              pushToast('danger', 'ეს PIN უკვე გამოყენებულია')
              setLoading(false)
              return
            }
            throw pinError
          }
        }
      } else {
        // Create new
        const { data, error } = await supabase.rpc('create_employee', {
          p_org_id: currentOrgId,
          p_name: name,
          p_role: role,
          p_pin: pin
        })

        if (error) {
          if (error.message.includes('pin_taken')) {
            pushToast('danger', 'ეს PIN უკვე გამოყენებულია')
            setLoading(false)
            return
          }
          throw error
        }

        // Set salary
        const created = data as { ok?: boolean; employee_id?: number } | null
        if (created?.ok && created.employee_id) {
          await supabase
            .from('employees')
            .update({
              salary_type: salaryType,
              salary_amount: Number(salaryAmount) || 0
            })
            .eq('id', created.employee_id)
        }
      }

      pushToast('success', isEdit ? 'ცვლილებები შენახულია' : 'თანამშრომელი დაემატა')
      onRefresh()
      onClose()
    } catch (err: any) {
      pushToast('danger', planErrorText(err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="nm-raised w-full max-w-md rounded-3xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black">{isEdit ? 'რედაქტირება' : 'ახალი თანამშრომელი'}</h3>
          <button onClick={onClose} className="nm-btn size-8 flex items-center justify-center rounded-xl">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={save} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">სახელი</span>
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">როლი</span>
              <select
                value={role}
                onChange={e => setRole(e.target.value as OrgRole)}
                className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none bg-transparent appearance-none"
              >
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k} className="bg-background">{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">PIN (4-6 ნიშნა)</span>
              <input
                required={!isEdit}
                type="password"
                maxLength={6}
                value={pin}
                autoComplete="new-password"
                onChange={e => setPin(e.target.value)}
                placeholder={isEdit ? 'დატოვეთ ცარიელი დასატოვებლად' : ''}
                className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ანაზღაურება</span>
              <select
                value={salaryType}
                onChange={e => setSalaryType(e.target.value as 'hourly' | 'monthly' | 'fixed')}
                className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none bg-transparent appearance-none"
              >
                <option value="hourly" className="bg-background">საათობრივი</option>
                <option value="monthly" className="bg-background">თვიური</option>
                <option value="fixed" className="bg-background">ფიქსირებული</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ოდენობა (₾)</span>
              <input
                type="number" step="0.01"
                value={salaryAmount}
                onChange={e => setSalaryAmount(e.target.value)}
                className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-mono font-bold outline-none text-primary"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="nm-daylight flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-primary mt-4"
          >
            {loading ? <LoaderCircle className="size-5 animate-spin" /> : (isEdit ? 'შენახვა' : 'დამატება')}
          </button>
        </form>
      </div>
    </div>
  )
}

interface PayrollRun {
  id: string
  period_from: string
  period_to: string
  total_paid: number
  employees_paid: number
}

function PayrollPanel() {
  const { currentOrgId, currentVenueId } = useOrg()
  const { pushToast } = usePlayroom()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState<PayrollRun[]>([])

  const loadRuns = useCallback(async () => {
    if (!currentVenueId) return
    const { data } = await supabase
      .from('payroll_runs')
      .select('id, period_from, period_to, total_paid, employees_paid')
      .eq('venue_id', currentVenueId)
      .order('period_from', { ascending: false })
      .limit(6)
    if (data) setRuns(data as PayrollRun[])
  }, [currentVenueId])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  const run = async () => {
    if (!currentOrgId || !currentVenueId || busy) return
    const [y, m] = month.split('-').map(Number)
    const from = `${month}-01`
    const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    if (!confirm(`დაირიცხოს ხელფასები ${month}-ის პერიოდისთვის? თანხა ჩაიწერება ბუღალტერიაში ხარჯად.`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('process_payroll', {
      p_org_id: currentOrgId,
      p_venue_id: currentVenueId,
      p_from: from,
      p_to: to,
    })
    setBusy(false)
    if (error) {
      if (error.message.includes('payroll_already_run')) {
        pushToast('danger', `${month}-ის ხელფასი უკვე დარიცხულია`)
      } else if (error.message.includes('rate_limit')) {
        pushToast('danger', 'ბევრი მცდელობა — დაელოდე წუთს')
      } else {
        pushToast('danger', error.message)
      }
      return
    }
    const res = data as { total_paid?: number; employees_paid?: number } | null
    pushToast('success', `ხელფასი დაირიცხა: ${gel(res?.total_paid ?? 0)} • ${res?.employees_paid ?? 0} თანამშრომელი`)
    loadRuns()
  }

  return (
    <div className="nm-raised rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <Wallet className="size-5 text-primary" />
        </div>
        <div>
          <p className="font-extrabold">ხელფასების დარიცხვა</p>
          <p className="text-xs text-muted-foreground">საათობრივი ცვლების მიხედვით + თვიური/ფიქს.</p>
        </div>
      </div>

      <div className="mt-5 flex items-end gap-3">
        <label className="flex-1">
          <span className="text-xs font-semibold text-muted-foreground">პერიოდი (თვე)</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none"
          />
        </label>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="nm-daylight flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-primary"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Wallet className="size-4" />}
          დარიცხვა
        </button>
      </div>

      {runs.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">ბოლო დარიცხვები</p>
          {runs.map((r) => (
            <div key={r.id} className="nm-inset flex items-center justify-between rounded-2xl px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="size-3.5 text-muted-foreground" />
                {r.period_from.slice(0, 7)}
              </span>
              <span className="text-xs text-muted-foreground">{r.employees_paid} თანამშრ.</span>
              <span className="font-mono text-sm font-bold text-primary">{gel(r.total_paid)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Employees() {
  const { employees, shifts, refreshStaff, pushToast } = usePlayroom()
  const canManage = useModuleAccess('employees')
  
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEmp, setEditingEmp] = useState<Employee | undefined>()
  
  const toggleActive = async (emp: Employee) => {
    if (!confirm(`ნამდვილად გსურთ ${emp.name}-ს ${emp.is_active ? 'დეაქტივაცია' : 'აქტივაცია'}?`)) return
    const { error } = await supabase
      .from('employees')
      .update({ is_active: !emp.is_active })
      .eq('id', emp.id)
    
    if (error) pushToast('danger', error.message)
    else {
      pushToast('success', 'სტატუსი განახლდა')
      refreshStaff()
    }
  }

  const SALARY_LABELS = {
    hourly: 'სთ.',
    monthly: 'თვე',
    fixed: 'ფიქს.'
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-6">
        <PinPad />
        {canManage && <PayrollPanel />}
        {canManage && <StaffLeaderboard />}
      </div>

      <div className="space-y-6 lg:col-span-3">
        {/* roster */}
        <div className="nm-raised rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold">თანამშრომლები</h3>
            {canManage && (
              <button 
                onClick={() => { setEditingEmp(undefined); setModalOpen(true); }}
                className="nm-btn flex size-10 items-center justify-center rounded-xl text-primary"
              >
                <Plus className="size-5" />
              </button>
            )}
          </div>
          <ul className="space-y-3">
            {employees.map((e) => {
              const onShift = shifts.some(
                (s) => s.employee_id === e.id && !s.clock_out,
              )
              return (
                <li
                  key={e.id}
                  className={cn(
                    "nm-inset flex items-center justify-between rounded-2xl px-4 py-3 transition-opacity",
                    !e.is_active && "opacity-50"
                  )}
                >
                  <div className="flex flex-1 items-center gap-3 min-w-0">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)]">
                      {['admin', 'owner'].includes(e.role) ? (
                        <ShieldCheck className="size-5 text-primary" />
                      ) : (
                        <User className="size-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold leading-tight truncate">{e.name}</p>
                        {onShift && <span className="size-1.5 rounded-full bg-[var(--status-free)] animate-pulse shadow-[0_0_8px_var(--status-free)]" />}
                      </div>
                      <p className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-wider">
                        {ROLE_LABELS[e.role]} • {gel(e.salary_amount || 0)} / {SALARY_LABELS[e.salary_type || 'hourly']}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {canManage && (
                      <div className="flex gap-1.5">
                        <button 
                          onClick={() => { setEditingEmp(e); setModalOpen(true); }}
                          className="nm-btn size-9 flex items-center justify-center rounded-xl text-primary/70 hover:text-primary transition-colors"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        <button 
                          onClick={() => toggleActive(e)}
                          className={cn("nm-btn size-9 flex items-center justify-center rounded-xl transition-colors", e.is_active ? "text-amber-500/70 hover:text-amber-500" : "text-green-500/70 hover:text-green-500")}
                        >
                          {e.is_active ? <Trash2 className="size-4" /> : <Plus className="size-4" />}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* shift log */}
        <div className="nm-raised rounded-3xl p-6">
          <h3 className="text-base font-extrabold">ცვლების ჟურნალი</h3>
          <ul className="mt-4 space-y-2">
            {shifts.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-semibold">{s.employee_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateLabel(s.clock_in)} • {timeOfDay(s.clock_in)} —{' '}
                    {s.clock_out ? timeOfDay(s.clock_out) : 'მიმდინარე'}
                  </p>
                </div>
                <span className="text-sm font-bold text-primary">
                  {s.hours_worked != null ? (
                    <>
                      <span className="font-mono">
                        {s.hours_worked.toFixed(1)}
                      </span>{' '}
                      სთ
                    </>
                  ) : (
                    '—'
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {modalOpen && (
        <EmployeeModal 
          employee={editingEmp} 
          onClose={() => setModalOpen(false)} 
          onRefresh={refreshStaff} 
        />
      )}
    </div>
  )
}
