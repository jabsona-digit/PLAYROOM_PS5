'use client'

import { useState, useEffect } from 'react'
import { CalendarDays, Receipt, Trash2, Plus, FileDown, FileUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'
import { exportToExcel, downloadTemplate, readExcel } from '@/lib/excel'
import type { Expense, VenuePnl, MonthlyPnl, ExpenseCategory } from '@/lib/types'
import { EXPENSE_CATEGORY_LABELS } from '@/lib/types'

// helper to local yyyy-mm-dd
function toIsoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

export function Accounting() {
  const { currentVenueId, currentRole } = useOrg()
  const { pushToast } = usePlayroom()
  const canEdit = ['owner', 'admin', 'manager'].includes(currentRole ?? '')

  const [dateFrom, setDateFrom] = useState(toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [dateTo, setDateTo] = useState(toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)))

  const [pnl, setPnl] = useState<VenuePnl | null>(null)
  const [trend, setTrend] = useState<MonthlyPnl[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])

  // Form State
  const [expenseCat, setExpenseCat] = useState<ExpenseCategory>('rent')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseDate, setExpenseDate] = useState(toIsoDate(new Date()))
  const [adding, setAdding] = useState(false)

  const loadData = async () => {
    if (!currentVenueId) return
    
    // Summary KPI
    const { data: pnlData } = await supabase.rpc('get_venue_pnl', {
      p_venue_id: currentVenueId,
      p_from: dateFrom,
      p_to: dateTo
    })
    if (pnlData) setPnl(pnlData as unknown as VenuePnl)

    // Monthly Trend
    const { data: trendData } = await supabase
      .from('monthly_pnl')
      .select('*')
      .eq('venue_id', currentVenueId)
      .order('month', { ascending: false })
      .limit(12)
    if (trendData) setTrend(trendData as unknown as MonthlyPnl[])

    // Expenses List
    const { data: expData } = await supabase
      .from('expenses')
      .select('*')
      .eq('venue_id', currentVenueId)
      .order('expense_date', { ascending: false })
    if (expData) setExpenses(expData as unknown as Expense[])
  }

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVenueId, dateFrom, dateTo])

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentVenueId || !canEdit) return
    const amount = parseFloat(expenseAmount)
    if (!amount || amount <= 0) return

    setAdding(true)
    const { error } = await supabase.rpc('add_expense', {
      p_venue_id: currentVenueId,
      p_category: expenseCat,
      p_amount: amount,
      p_description: expenseDesc.trim() || undefined,
      p_expense_date: expenseDate,
    })
    setAdding(false)

    if (error) {
      pushToast('danger', error.message)
    } else {
      pushToast('success', 'ხარჯი დამატებულია')
      setExpenseAmount('')
      setExpenseDesc('')
      loadData()
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!canEdit) return
    if (!confirm('ნამდვილად გსურთ წაშლა?')) return
    
    const { error } = await supabase.rpc('delete_expense', { p_expense_id: id })
    if (error) pushToast('danger', error.message)
    else {
      pushToast('info', 'ხარჯი წაიშალა')
      loadData()
    }
  }

  const handleExportReport = () => {
    if (!pnl) return
    const reportData = [
      { 'პარამეტრი': 'სულ შემოსავალი', 'მნიშვნელობა': pnl.total_revenue },
      { 'პარამეტრი': 'სეს. შემოსავალი', 'მნიშვნელობა': pnl.session_revenue },
      { 'პარამეტრი': 'ბარის შემოსავალი', 'მნიშვნელობა': pnl.bar_revenue },
      { 'პარამეტრი': 'დაბრუნებები', 'მნიშვნელობა': pnl.session_refunds },
      { 'პარამეტრი': 'სულ ხარჯები', 'მნიშვნელობა': pnl.total_expenses },
      { 'პარამეტრი': 'სუფთა მოგება', 'მნიშვნელობა': pnl.net_profit },
      { 'პარამეტრი': '', 'მნიშვნელობა': '' },
      { 'პარამეტრი': 'ხარჯების სია', 'მნიშვნელობა': '' },
      ...expenses.map(e => ({
        'პარამეტრი': `${EXPENSE_CATEGORY_LABELS[e.category]}: ${e.description || ''}`,
        'მნიშვნელობა': e.amount
      }))
    ]
    exportToExcel(reportData, `ფინანსური_რეპორტი_${dateFrom}_${dateTo}`)
  }

  const handleImportExpenses = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentVenueId || !canEdit) return

    try {
      const data = await readExcel(file)
      if (!data.length) return pushToast('warning', 'ფაილი ცარიელია')

      const { data: orgData } = await supabase.from('venues').select('org_id').eq('id', currentVenueId).single()
      if (!orgData) return

      for (const item of data) {
        const catLabel = String(item['კატეგორია'] || '').trim().split(' / ')[0] // handle template hint
        const catKey = (Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).find(
          k => EXPENSE_CATEGORY_LABELS[k] === catLabel
        ) || 'other'

        await supabase.rpc('add_expense', {
          p_venue_id: currentVenueId,
          p_category: catKey,
          p_amount: Number(item['თანხა']) || 0,
          p_description: item['აღწერა'] || undefined,
          p_expense_date: item['თარიღი'] || toIsoDate(new Date()),
        })
      }

      pushToast('success', `${data.length} ხარჯი წარმატებით დაემატა`)
      loadData()
    } catch (err: any) {
      pushToast('danger', 'იმპორტისას მოხდა შეცდომა: ' + err.message)
    } finally {
      e.target.value = ''
    }
  }

  const trendMax = Math.max(10, ...trend.map(t => Math.max(Number(t.session_revenue || 0) + Number(t.bar_revenue || 0), t.total_expenses || 0)))

  return (
    <div className="space-y-6">
      
      {/* Date Range Picker */}
      <div className="nm-raised flex flex-col gap-4 rounded-3xl p-6 sm:flex-row sm:items-center">
        <h2 className="flex items-center gap-2 text-lg font-extrabold mr-auto">
          <CalendarDays className="size-5 text-primary" />
          პერიოდი
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2 mr-2">
            <button
              onClick={handleExportReport}
              className="nm-btn flex size-10 items-center justify-center rounded-xl text-primary/70 hover:text-primary transition-colors"
              title="რეპორტის ექსპორტი"
            >
              <FileDown className="size-4" />
            </button>
            {canEdit && (
              <>
                <button
                  onClick={() => downloadTemplate('expenses')}
                  className="nm-btn flex size-10 items-center justify-center rounded-xl text-amber-500/70 hover:text-amber-500 transition-colors"
                  title="ხარჯების შაბლონი"
                >
                  <FileDown className="size-4" />
                </button>
                <label className="nm-btn flex size-10 cursor-pointer items-center justify-center rounded-xl text-amber-500/70 hover:text-amber-500 transition-colors">
                  <FileUp className="size-4" />
                  <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExpenses} />
                </label>
              </>
            )}
          </div>
          <div className="flex flex-1 max-w-sm gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="nm-inset w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none text-muted-foreground"
            />
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="nm-inset w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="nm-raised rounded-3xl p-6">
          <p className="text-sm font-semibold mb-3">სულ შემოსავალი</p>
          <p className="font-mono text-2xl font-extrabold text-primary">{gel(pnl?.total_revenue || 0)}</p>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>სეს. შემოსავალი:</span>
              <span className="font-bold text-foreground">{gel(pnl?.session_revenue || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>ბარის შემოსავალი:</span>
              <span className="font-bold text-foreground">{gel(pnl?.bar_revenue || 0)}</span>
            </div>
          </div>
        </div>

        <div className="nm-raised rounded-3xl p-6">
          <p className="text-sm font-semibold mb-3">დაბრუნებები</p>
          <p className="font-mono text-2xl font-extrabold text-amber-400">{gel(pnl?.session_refunds || 0)}</p>
        </div>

        <div className="nm-raised rounded-3xl p-6">
          <p className="text-sm font-semibold mb-3">სულ ხარჯები</p>
          <p className="font-mono text-2xl font-extrabold text-[var(--status-expired)]">{gel(pnl?.total_expenses || 0)}</p>
        </div>

        <div className="nm-daylight rounded-3xl p-6">
          <p className="text-sm font-semibold mb-3 text-muted-foreground">სუფთა მოგება</p>
          <p className={cn("font-mono text-3xl font-extrabold", (pnl?.net_profit || 0) >= 0 ? "text-green-500" : "text-red-500")}>
            {gel(pnl?.net_profit || 0)}
          </p>
        </div>
      </div>

      {/* Monthly Trend & New Expense */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trend */}
        <div className="nm-raised rounded-3xl p-6 lg:col-span-2">
          <h3 className="text-base font-extrabold mb-6">თვეების ისტორია (12 თვე)</h3>
          <div className="flex h-48 items-end gap-2 overflow-x-auto pb-2">
            {[...trend].reverse().map(t => {
              const profit = t.net_profit || 0
              const isPos = profit >= 0
              const heightStr = `${Math.max(5, (Math.abs(profit) / trendMax) * 100)}%`
              return (
                <div key={t.month} className="flex flex-1 flex-col items-center justify-end gap-2 group relative">
                  <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10 pointer-events-none">
                    მოგება: {gel(profit)}
                  </div>
                  <div
                    className={cn("w-full max-w-[40px] rounded-t-lg transition-all", isPos ? "bg-green-500/80" : "bg-red-500/80")}
                    style={{ height: heightStr }}
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{t.month}</span>
                </div>
              )
            })}
            {trend.length === 0 && <div className="text-sm text-muted-foreground w-full text-center">მონაცემები არ არის</div>}
          </div>
        </div>

        {/* Add Expense Form */}
        <div className="nm-raised rounded-3xl p-6">
          <h3 className="text-base font-extrabold mb-4">დაამატე ხარჯი</h3>
          {canEdit ? (
            <form onSubmit={handleAddExpense} className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">კატეგორია</span>
                <select
                  value={expenseCat}
                  onChange={e => setExpenseCat(e.target.value as ExpenseCategory)}
                  className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none appearance-none bg-transparent"
                >
                  {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map(k => (
                    <option key={k} value={k} className="bg-background">{EXPENSE_CATEGORY_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">თანხა (₾)</span>
                  <input
                    type="number" step="0.01" min="0" required
                    value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)}
                    className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-mono font-bold outline-none text-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">თარიღი</span>
                  <input
                    type="date" required
                    value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                    className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">აღწერა</span>
                <input
                  type="text"
                  value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)}
                  className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={adding}
                className="nm-daylight flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-primary mt-2"
              >
                <Plus className="size-4" />
                დამატება
              </button>
            </form>
          ) : (
             <div className="nm-inset p-4 rounded-2xl text-sm text-center text-muted-foreground">
               ხარჯის დამატების უფლება არ გაქვთ.
             </div>
          )}
        </div>
      </div>

      {/* Expenses List */}
      <div className="nm-raised rounded-3xl p-6">
        <h3 className="text-base font-extrabold mb-4">ყველა ხარჯი</h3>
        <div className="space-y-3">
          {expenses.map(e => (
            <div key={e.id} className="nm-inset flex items-center justify-between rounded-2xl p-4 sm:flex-row flex-col gap-3">
              <div className="flex w-full sm:w-auto items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/50">
                  <Receipt className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{EXPENSE_CATEGORY_LABELS[e.category]}</p>
                  <p className="text-xs text-muted-foreground truncate">{e.description || '—'}</p>
                </div>
              </div>
              
              <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-4 shrink-0">
                <div className="text-right flex-1 sm:flex-none">
                  <p className="font-mono text-base font-extrabold text-[var(--status-expired)]">{gel(e.amount)}</p>
                  <p className="text-xs text-muted-foreground">{e.expense_date}</p>
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleDeleteExpense(e.id)}
                    className="nm-btn flex size-9 items-center justify-center rounded-xl text-red-500 shrink-0"
                    title="წაშლა"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {expenses.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              ხარჯები არ მოიძებნა
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
