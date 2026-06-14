'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  CalendarDays, Receipt, Trash2, Plus, FileDown, FileUp, 
  LoaderCircle, LayoutDashboard, Calculator, Target, FileText,
  Printer, Check, X, AlertCircle, Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'
import { exportWorkbook, downloadTemplate, readExcel } from '@/lib/excel'
import type { 
  Expense, VenuePnl, MonthlyPnl, ExpenseCategory,
  VatSummary, BudgetVsActual, Invoice, InvoiceItem 
} from '@/lib/types'
import { EXPENSE_CATEGORY_LABELS } from '@/lib/types'
import { Modal } from './modal'
import { useModuleAccess } from '@/lib/org'
import { InvoicePrint } from './invoice-print'
import { ReceiptScanner } from './receipt-scanner'

// helper to local yyyy-mm-dd — must NOT go through toISOString() (that converts
// to UTC and, in GE/+4, shifts month boundaries a day earlier → drops the last
// day of the range).
function toIsoDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type TabKey = 'pnl' | 'vat' | 'budgets' | 'invoices'

export function Accounting() {
  const isAuthorized = useModuleAccess('accounting')
  const { currentVenueId, currentOrgId, currentRole } = useOrg()
  const { pushToast } = usePlayroom()
  const canEdit = ['owner', 'admin', 'manager'].includes(currentRole ?? '')
  const isAdmin = ['owner', 'admin'].includes(currentRole ?? '')

  const [activeTab, setActiveTab] = useState<TabKey>('pnl')
  const [dateFrom, setDateFrom] = useState(toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [dateTo, setDateTo] = useState(toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)))

  // Data States
  const [pnl, setPnl] = useState<VenuePnl | null>(null)
  const [trend, setTrend] = useState<MonthlyPnl[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [vatSummary, setVatSummary] = useState<VatSummary | null>(null)
  const [budgets, setBudgets] = useState<BudgetVsActual[]>([])
  const [invoiceList, setInvoiceList] = useState<Invoice[]>([])

  // UI States
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [printingInvoice, setPrintingInvoice] = useState<{inv: Invoice, items: InvoiceItem[]} | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // Form States (P&L / Expenses)
  const [expenseCat, setExpenseCat] = useState<ExpenseCategory>('rent')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseVat, setExpenseVat] = useState('')
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseDate, setExpenseDate] = useState(toIsoDate(new Date()))

  // Modal States
  const [budgetModal, setBudgetModal] = useState<{ month: string, rev: string, exp: string } | null>(null)
  const [newBudgetMonth, setNewBudgetMonth] = useState(toIsoDate(new Date()).slice(0, 7)) // YYYY-MM
  const [invoiceModal, setInvoiceModal] = useState<boolean>(false)
  const [newInvClient, setNewInvClient] = useState('')
  const [newInvTin, setNewInvTin] = useState('')
  const [newInvItems, setNewInvItems] = useState<{ desc: string, qty: number, price: number }[]>([{ desc: '', qty: 1, price: 0 }])
  const [showOcr, setShowOcr] = useState(false)

  const loadData = async () => {
    if (!currentVenueId || !isAuthorized) return
    setLoading(true)

    // Summary KPI (P&L) — surface RPC errors instead of silently rendering ₾0.00
    const { data: pnlData, error: pnlError } = await supabase.rpc('get_venue_pnl', {
      p_venue_id: currentVenueId,
      p_from: dateFrom,
      p_to: dateTo
    })
    if (pnlError) pushToast('danger', `მოგება-ზარალი ვერ ჩაიტვირთა: ${pnlError.message}`)
    if (pnlData) setPnl(pnlData as unknown as VenuePnl)

    // VAT Summary
    const { data: vatData } = await supabase.rpc('get_vat_summary', {
      p_venue_id: currentVenueId,
      p_from: dateFrom,
      p_to: dateTo
    })
    if (vatData) setVatSummary(vatData as unknown as VatSummary)

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

    // Budgets
    const { data: budgetData } = await supabase
      .from('budget_vs_actual')
      .select('*')
      .eq('venue_id', currentVenueId)
      .order('month', { ascending: false })
    if (budgetData) setBudgets(budgetData as unknown as BudgetVsActual[])

    // Invoices
    const { data: invData } = await supabase
      .from('invoices')
      .select('*')
      .eq('venue_id', currentVenueId)
      .order('created_at', { ascending: false })
    if (invData) setInvoiceList(invData as unknown as Invoice[])

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [currentVenueId, dateFrom, dateTo, isAuthorized])

  if (!isAuthorized) {
    return (
      <div className="flex h-64 items-center justify-center nm-inset rounded-3xl text-muted-foreground font-bold">
        წვდომა აკრძალულია — საჭიროა ბუღალტრის უფლებები.
      </div>
    )
  }

  // Export the current P&L view as a multi-sheet workbook (summary + expenses + trend).
  const handleExport = () => {
    if (!pnl) return pushToast('warning', 'ჯერ არ არის მონაცემი')
    const summary = [{
      'პერიოდი': `${dateFrom} — ${dateTo}`,
      'სესიის შემოსავალი': pnl.session_revenue,
      'ბარის შემოსავალი': pnl.bar_revenue,
      'სულ შემოსავალი': pnl.total_revenue,
      'დაბრუნებები': pnl.session_refunds,
      'საქონლის თვითღირებულება (COGS)': pnl.bar_cogs,
      'ოპერაციული ხარჯები': pnl.total_expenses,
      'სუფთა მოგება': pnl.net_profit,
    }]
    const expenseRows = expenses.map(e => ({
      'თარიღი': e.expense_date,
      'კატეგორია': EXPENSE_CATEGORY_LABELS[e.category],
      'თანხა': e.amount,
      'დღგ': e.vat_amount ?? 0,
      'აღწერა': e.description ?? '',
    }))
    const trendRows = [...trend].reverse().map(t => ({
      'თვე': (t.month ?? '').slice(0, 7),
      'სესიები': t.session_revenue,
      'ბარი': t.bar_revenue,
      'ხარჯები': t.total_expenses,
      'მოგება': t.net_profit,
    }))
    exportWorkbook(`PnL_${dateFrom}_${dateTo}`, [
      { name: 'შეჯამება', rows: summary },
      { name: 'ხარჯები', rows: expenseRows },
      { name: 'თვეები', rows: trendRows },
    ])
    pushToast('success', 'რეპორტი ჩამოიტვირთა')
  }

  // Import expenses from an Excel file (matches the ხარჯების_შაბლონი template).
  const handleImportExpenses = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (file) ev.target.value = '' // allow re-importing the same file
    if (!file || !currentVenueId || !canEdit) return
    try {
      const rows = await readExcel(file)
      if (!rows.length) return pushToast('warning', 'ფაილი ცარიელია')
      const labelToKey = Object.fromEntries(
        Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => [v, k]),
      ) as Record<string, ExpenseCategory>
      let ok = 0, fail = 0
      for (const r of rows as Record<string, unknown>[]) {
        const amount = Number(r['თანხა'])
        if (!amount || amount <= 0) { fail++; continue }
        const raw = String(r['კატეგორია'] ?? '').trim()
        const category: ExpenseCategory =
          (raw in EXPENSE_CATEGORY_LABELS ? (raw as ExpenseCategory) : labelToKey[raw]) ?? 'other'
        const dateStr = String(r['თარიღი'] ?? '').slice(0, 10)
        const expense_date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : toIsoDate(new Date())
        const { error } = await supabase.rpc('add_expense', {
          p_venue_id: currentVenueId,
          p_category: category,
          p_amount: amount,
          p_vat_amount: Number(r['დღგ']) || 0,
          p_description: String(r['აღწერა'] ?? '').trim() || undefined,
          p_expense_date: expense_date,
        })
        if (error) fail++; else ok++
      }
      pushToast(ok ? 'success' : 'danger', `იმპორტი: ${ok} დაემატა${fail ? `, ${fail} გამოტოვდა` : ''}`)
      loadData()
    } catch {
      pushToast('danger', 'ფაილის წაკითხვა ვერ მოხერხდა')
    }
  }

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
      p_vat_amount: parseFloat(expenseVat) || 0,
      p_description: expenseDesc.trim() || undefined,
      p_expense_date: expenseDate,
    })
    setAdding(false)

    if (error) {
      pushToast('danger', error.message)
    } else {
      pushToast('success', 'ხარჯი დამატებულია')
      setExpenseAmount('')
      setExpenseVat('')
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

  const handleOcrResults = (data: { amount: number, date: string, category: string, description: string }) => {
    setExpenseAmount(data.amount.toString())
    setExpenseDate(data.date)
    setExpenseCat(data.category as ExpenseCategory)
    setExpenseDesc(data.description)
  }

  const handleUpdateBudget = async () => {
    if (!budgetModal || !currentVenueId || !currentOrgId || !isAdmin) return
    setAdding(true)

    // Ensure month format is YYYY-MM-01 for DB date field
    const dbMonthStr = budgetModal.month.length === 7 ? `${budgetModal.month}-01` : budgetModal.month

    const { error } = await supabase
      .from('venue_budgets')
      .upsert({
        org_id: currentOrgId,
        venue_id: currentVenueId,
        month: dbMonthStr,
        revenue_target: parseFloat(budgetModal.rev) || 0,
        expense_budget: parseFloat(budgetModal.exp) || 0
      }, { onConflict: 'venue_id,month' })
    
    setAdding(false)
    if (error) pushToast('danger', error.message)
    else {
      pushToast('success', 'ბიუჯეტი განახლდა')
      setBudgetModal(null)
      loadData()
    }
  }

  const handleCreateInvoice = async () => {
    if (!currentVenueId || !isAdmin || !currentOrgId) return
    setAdding(true)
    
    try {
      // 1. Get next invoice number
      const { data: invNo, error: noErr } = await supabase.rpc('next_invoice_number', { p_org_id: currentOrgId })
      if (noErr) throw noErr

      // 2. Calculate totals
      const subtotal = newInvItems.reduce((acc, i) => acc + (i.qty * i.price), 0)
      const vat_total = subtotal * 0.18
      const total = subtotal + vat_total

      // 3. Create invoice
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          org_id: currentOrgId,
          venue_id: currentVenueId,
          invoice_number: invNo,
          client_name: newInvClient,
          client_tin: newInvTin || null,
          subtotal,
          vat_total,
          total_amount: total,
          status: 'issued',
          issued_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (invErr) throw invErr

      // 4. Create items
      const itemsToInsert = newInvItems.map(i => ({
        invoice_id: inv.id,
        description: i.desc,
        qty: i.qty,
        unit_price: i.price,
        line_total: i.qty * i.price
      }))
      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsToInsert)
      if (itemsErr) throw itemsErr

      pushToast('success', 'ინვოისი შეიქმნა')
      setInvoiceModal(false)
      setNewInvClient('')
      setNewInvTin('')
      setNewInvItems([{ desc: '', qty: 1, price: 0 }])
      loadData()
    } catch (err: any) {
      pushToast('danger', err.message)
    } finally {
      setAdding(false)
    }
  }

  const printInvoice = async (invoice: Invoice) => {
    const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id)
    if (items) {
      setPrintingInvoice({ inv: invoice, items: items as unknown as InvoiceItem[] })
    }
  }

  const handleMarkPaid = async (id: string) => {
    if (!isAdmin) return
    const { error } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', id)
    if (error) pushToast('danger', error.message)
    else {
      pushToast('success', 'ინვოისი მონიშნულია როგორც გადახდილი')
      loadData()
    }
  }

  const trendMax = Math.max(10, ...trend.map(t => Math.max(Number(t.session_revenue || 0) + Number(t.bar_revenue || 0), t.total_expenses || 0)))

  if (printingInvoice) {
    return <InvoicePrint 
      invoice={printingInvoice.inv} 
      items={printingInvoice.items} 
      onClose={() => setPrintingInvoice(null)} 
    />
  }

  return (
    <div className="space-y-6 pb-20">
      
      {/* Control Bar */}
      <div className="nm-raised flex flex-col gap-4 rounded-3xl p-6 lg:flex-row lg:items-center">
        <div className="flex flex-1 items-center gap-6">
          <h2 className="flex items-center gap-2 text-xl font-black">
            <Calculator className="size-6 text-primary" />
            ფინანსები
          </h2>

          <nav className="flex gap-1 nm-inset p-1 rounded-2xl overflow-x-auto no-scrollbar">
            {(['pnl', 'vat', 'budgets', 'invoices'] as const).map(key => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                  activeTab === key ? "nm-daylight text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {key === 'pnl' ? 'მოგება-ზარალი' : 
                 key === 'vat' ? 'დღგ' : 
                 key === 'budgets' ? 'ბიუჯეტი' : 'ინვოისები'}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(activeTab === 'pnl' || activeTab === 'vat') && (
            <div className="flex flex-1 max-w-sm gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="nm-inset w-full rounded-2xl px-4 py-2 text-sm font-bold outline-none text-muted-foreground"
              />
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="nm-inset w-full rounded-2xl px-4 py-2 text-sm font-bold outline-none text-muted-foreground"
              />
            </div>
          )}
          {activeTab === 'pnl' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                className="nm-btn flex size-10 items-center justify-center rounded-xl text-primary/70"
                title="რეპორტის ექსპორტი (Excel)"
              >
                <FileDown className="size-4" />
              </button>
              {canEdit && (
                <>
                  <button
                    onClick={() => importRef.current?.click()}
                    className="nm-btn flex size-10 items-center justify-center rounded-xl text-primary/70"
                    title="ხარჯების იმპორტი (Excel)"
                  >
                    <FileUp className="size-4" />
                  </button>
                  <button
                    onClick={() => downloadTemplate('expenses')}
                    className="nm-btn flex items-center justify-center rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground"
                    title="ხარჯების შაბლონის ჩამოტვირთვა"
                  >
                    შაბლონი
                  </button>
                  <input
                    ref={importRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleImportExpenses}
                    className="hidden"
                  />
                </>
              )}
            </div>
          )}
          {activeTab === 'invoices' && isAdmin && (
            <button
              onClick={() => setInvoiceModal(true)}
              className="nm-btn flex items-center gap-2 rounded-2xl px-5 py-2 text-sm font-bold text-primary"
            >
              <Plus className="size-4" />
              ახალი ინვოისი
            </button>
          )}
        </div>
      </div>

      {loading && activeTab !== 'invoices' && (
        <div className="flex h-32 items-center justify-center">
          <LoaderCircle className="size-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && (
        <>
          {/* TAB: PNL */}
          {activeTab === 'pnl' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                  <p className="text-sm font-semibold mb-3 text-amber-500">დაბრუნებები</p>
                  <p className="font-mono text-2xl font-extrabold text-amber-500">{gel(pnl?.session_refunds || 0)}</p>
                </div>
                <div className="nm-raised rounded-3xl p-6">
                  <p className="text-sm font-semibold mb-3 text-red-500">ხარჯები</p>
                  <p className="font-mono text-2xl font-extrabold text-red-500">{gel((pnl?.total_expenses || 0) + (pnl?.bar_cogs || 0))}</p>
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>ოპერაციული:</span>
                      <span className="font-bold text-foreground">{gel(pnl?.total_expenses || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>საქონლის ღირ. (COGS):</span>
                      <span className="font-bold text-foreground">{gel(pnl?.bar_cogs || 0)}</span>
                    </div>
                  </div>
                </div>
                <div className="nm-daylight rounded-3xl p-6">
                  <p className="text-sm font-semibold mb-3 text-muted-foreground">სუფთა მოგება</p>
                  <p className={cn("font-mono text-3xl font-extrabold", (pnl?.net_profit || 0) >= 0 ? "text-green-500" : "text-red-500")}>
                    {gel(pnl?.net_profit || 0)}
                  </p>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="nm-raised rounded-3xl p-6 lg:col-span-2">
                  <h3 className="text-base font-extrabold mb-6">თვეების ისტორია</h3>
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
                  </div>
                </div>

                <div className="nm-raised rounded-3xl p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-extrabold">დაამატე ხარჯი</h3>
                    {canEdit && (
                      <button
                        onClick={() => setShowOcr(true)}
                        className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase text-primary"
                        title="ჩეკის სკანირება AI-თ"
                      >
                        <Sparkles className="size-3" />
                        სკანირება
                      </button>
                    )}
                  </div>
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
                          <span className="text-xs font-semibold text-muted-foreground">დღგ (ჩასათვლელი)</span>
                          <input
                            type="number" step="0.01" min="0"
                            value={expenseVat} onChange={e => setExpenseVat(e.target.value)}
                            placeholder="0.00"
                            className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-mono font-bold outline-none text-amber-500"
                          />
                        </label>
                      </div>
                      <label className="block">
                        <span className="text-xs font-semibold text-muted-foreground">თარიღი</span>
                        <input
                          type="date" required
                          value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                          className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none"
                        />
                      </label>
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
                        {adding ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                        დამატება
                      </button>
                    </form>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4 nm-inset rounded-2xl">ხარჯების მართვის უფლება არ გაქვთ</p>
                  )}
                </div>
              </div>

               <div className="nm-raised rounded-3xl p-6">
                <h3 className="text-base font-extrabold mb-4">ბოლო ხარჯები</h3>
                <div className="space-y-3">
                  {expenses.slice(0, 5).map(e => (
                    <div key={e.id} className="nm-inset flex items-center justify-between rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="nm-inset flex size-10 items-center justify-center rounded-xl bg-background/50">
                          <Receipt className="size-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{EXPENSE_CATEGORY_LABELS[e.category]}</p>
                          <p className="text-xs text-muted-foreground">{e.description || '—'}</p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-4">
                        <div>
                          <p className="font-mono text-sm font-extrabold text-red-500">{gel(e.amount)}</p>
                          <p className="text-[10px] text-muted-foreground">{e.expense_date}</p>
                        </div>
                        {canEdit && (
                          <button onClick={() => handleDeleteExpense(e.id)} className="nm-btn size-8 flex items-center justify-center rounded-lg text-red-500">
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {showOcr && (
                <ReceiptScanner 
                  onDetected={handleOcrResults} 
                  onClose={() => setShowOcr(false)} 
                />
              )}
            </div>
          )}

          {/* TAB: VAT */}
          {activeTab === 'vat' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
               {!vatSummary?.is_vat_registered && (
                <div className="nm-inset p-8 rounded-3xl text-center">
                  <AlertCircle className="size-12 text-amber-500 mx-auto mb-4 opacity-50" />
                  <p className="text-xl font-bold mb-2">თქვენ არ ხართ დღგ-ს გადამხდელი</p>
                  <p className="text-sm text-muted-foreground">ამ გვერდზე ნაჩვენებია გამოთვლები საინფორმაციო მიზნით.</p>
                </div>
              )}
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div className="nm-raised rounded-3xl p-6">
                  <p className="text-xs font-black uppercase text-muted-foreground mb-4 tracking-widest">Gross Sales (Net)</p>
                  <p className="font-mono text-2xl font-black text-slate-800">{gel(vatSummary?.gross_sales || 0)}</p>
                  <div className="h-1 w-full bg-slate-100 rounded-full mt-4 overflow-hidden">
                    <div className="h-full bg-slate-400 w-full" />
                  </div>
                </div>
                <div className="nm-raised rounded-3xl p-6">
                  <p className="text-xs font-black uppercase text-muted-foreground mb-4 tracking-widest">Output VAT (18%)</p>
                  <p className="font-mono text-2xl font-black text-primary">{gel(vatSummary?.output_vat || 0)}</p>
                  <div className="h-1 w-full bg-primary/10 rounded-full mt-4 overflow-hidden">
                    <div className="h-full bg-primary w-full shadow-[0_0_8px_var(--primary)]" />
                  </div>
                </div>
                <div className="nm-raised rounded-3xl p-6">
                  <p className="text-xs font-black uppercase text-muted-foreground mb-4 tracking-widest">Input VAT (Credits)</p>
                  <p className="font-mono text-2xl font-black text-amber-500">{gel(vatSummary?.input_vat || 0)}</p>
                  <div className="h-1 w-full bg-amber-500/10 rounded-full mt-4 overflow-hidden">
                    <div className="h-full bg-amber-500 w-full" />
                  </div>
                </div>
                <div className="nm-daylight rounded-3xl p-6 border border-white/50">
                  <p className="text-xs font-black uppercase text-primary mb-4 tracking-widest">Net VAT Payable</p>
                  <p className="font-mono text-3xl font-black text-primary">{gel(vatSummary?.net_vat_payable || 0)}</p>
                  <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase">გადასახდელი დღგ</p>
                </div>
              </div>

              <div className="nm-raised rounded-3xl p-8">
                <h3 className="text-lg font-black mb-6 flex items-center gap-2">
                  <Calculator className="size-5 text-primary" />
                  დეტალური გაანგარიშება
                </h3>
                <div className="space-y-4 max-w-2xl">
                  <div className="flex justify-between items-center nm-inset p-4 rounded-2xl">
                    <span className="font-bold text-slate-600">გაყიდვები დღგ-ს გარეშე</span>
                    <span className="font-mono font-bold">{gel(vatSummary?.gross_sales || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center nm-inset p-4 rounded-2xl">
                    <span className="font-bold text-slate-600">დარიცხული დღგ (გაყიდვებიდან)</span>
                    <span className="font-mono font-bold text-primary">+ {gel(vatSummary?.output_vat || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center nm-inset p-4 rounded-2xl">
                    <span className="font-bold text-slate-600">ჩასათვლელი დღგ (ხარჯებიდან)</span>
                    <span className="font-mono font-bold text-amber-500">- {gel(vatSummary?.input_vat || 0)}</span>
                  </div>
                  <div className="h-px bg-slate-200 mt-6 mb-2" />
                  <div className="flex justify-between items-center px-4">
                    <span className="text-xl font-black">ჯამური ვალდებულება</span>
                    <span className="text-2xl font-black font-mono text-primary">{gel(vatSummary?.net_vat_payable || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: BUDGETS */}
          {activeTab === 'budgets' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
               
               {/* Add / Edit Budget Header */}
               {isAdmin && (
                 <div className="nm-raised rounded-3xl p-6 flex flex-col md:flex-row items-center gap-4">
                   <h3 className="text-lg font-black shrink-0 mr-auto text-slate-800">თვის მართვა</h3>
                   <div className="flex gap-3 w-full md:w-auto">
                     <input
                       type="month"
                       value={newBudgetMonth}
                       onChange={(e) => setNewBudgetMonth(e.target.value)}
                       className="nm-inset flex-1 md:w-48 rounded-xl px-4 py-3 font-bold text-sm outline-none"
                     />
                     <button
                       onClick={() => {
                         const existing = budgets.find(b => b.month === newBudgetMonth || b.month.startsWith(newBudgetMonth))
                         setBudgetModal({
                           month: newBudgetMonth,
                           rev: existing?.revenue_target?.toString() || '',
                           exp: existing?.expense_budget?.toString() || ''
                         })
                       }}
                       className="nm-btn px-6 rounded-xl text-primary font-bold text-sm whitespace-nowrap"
                     >
                       ბიუჯეტის მითითება
                     </button>
                   </div>
                 </div>
               )}

               <div className="grid gap-6 md:grid-cols-2">
                  {budgets.map(b => (
                    <div key={b.month} className="nm-raised rounded-3xl p-6 relative overflow-hidden group">
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-xl font-black text-slate-800">{b.month}</h4>
                        {isAdmin && (
                          <button 
                            onClick={() => {
                              const viewMonth = b.month.slice(0, 7) // convert Back to YYYY-MM if it's longer
                              setBudgetModal({ month: viewMonth, rev: b.revenue_target?.toString() || '', exp: b.expense_budget?.toString() || '' })
                            }}
                            className="nm-btn p-2 rounded-xl text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            განახლება
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-8 mb-4">
                        {/* Revenue target vs actual */}
                        <div className="space-y-3">
                          <div className="flex justify-between text-xs font-black uppercase text-muted-foreground tracking-tighter">
                            <span>შემოსავალი</span>
                            <span>{Math.round(b.revenue_pct || 0)}%</span>
                          </div>
                          <div className="nm-inset h-10 rounded-2xl flex items-center px-4 justify-between relative overflow-hidden">
                            <div 
                              className="absolute left-0 h-full bg-primary/20" 
                              style={{ width: `${Math.min(100, b.revenue_pct || 0)}%` }} 
                            />
                            <span className="text-xs font-bold z-10">{gel(b.actual_revenue)}</span>
                            <span className="text-[10px] text-muted-foreground z-10 italic">მიზანი: {gel(b.revenue_target || 0)}</span>
                          </div>
                        </div>

                        {/* Expense budget vs actual */}
                        <div className="space-y-3">
                          <div className="flex justify-between text-xs font-black uppercase text-muted-foreground tracking-tighter">
                            <span>ხარჯის ლიმიტი</span>
                            <span className={cn(
                              (b.expense_pct || 0) > 100 ? "text-red-500" : "text-green-500"
                            )}>
                              {Math.round(b.expense_pct || 0)}%
                            </span>
                          </div>
                          <div className="nm-inset h-10 rounded-2xl flex items-center px-4 justify-between relative overflow-hidden">
                            <div 
                              className={cn(
                                "absolute left-0 h-full opacity-20",
                                (b.expense_pct || 0) > 100 ? "bg-red-500" : "bg-green-500"
                              )}
                              style={{ width: `${Math.min(100, b.expense_pct || 0)}%` }} 
                            />
                            <span className="text-xs font-bold z-10">{gel(b.actual_expense)}</span>
                            <span className="text-[10px] text-muted-foreground z-10 italic">ლიმიტი: {gel(b.expense_budget || 0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {budgets.length === 0 && (
                    <div className="py-20 text-center nm-inset rounded-3xl col-span-full">
                       <Target className="size-12 text-slate-300 mx-auto mb-4" />
                       <p className="text-slate-500 font-bold mb-2">ბიუჯეტები არ მოიძებნა</p>
                       <p className="text-xs text-muted-foreground">გამოიყენეთ ზედა პანელი ბიუჯეტის შესაქმნელად.</p>
                    </div>
                  )}
               </div>
            </div>
          )}

          {/* TAB: INVOICES */}
          {activeTab === 'invoices' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
               {invoiceList.map(inv => (
                 <div key={inv.id} className="nm-raised rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="nm-inset size-12 flex items-center justify-center rounded-xl">
                        <FileText className="size-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-black text-slate-800">#{inv.invoice_number}</p>
                        <p className="text-xs text-muted-foreground font-bold">{inv.client_name}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6">
                      <div className="text-right">
                        <p className="font-mono font-black text-lg">{gel(inv.total_amount)}</p>
                        <p className="text-[10px] uppercase font-black text-muted-foreground">{new Date(inv.issued_at).toLocaleDateString()}</p>
                      </div>
                      
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                        inv.status === 'paid' ? "bg-green-500/10 text-green-600" :
                        inv.status === 'issued' ? "bg-amber-500/10 text-amber-600" :
                        "bg-slate-200 text-slate-500"
                      )}>
                        {inv.status === 'paid' ? 'გადახდილი' : 
                         inv.status === 'issued' ? 'გაგზავნილი' : inv.status}
                      </span>

                      <div className="flex gap-2">
                        <button 
                          onClick={() => printInvoice(inv)}
                          className="nm-btn size-10 flex items-center justify-center rounded-xl text-primary"
                        >
                          <Printer className="size-4" />
                        </button>
                        {inv.status !== 'paid' && isAdmin && (
                          <button 
                            onClick={() => handleMarkPaid(inv.id)}
                            className="nm-btn size-10 flex items-center justify-center rounded-xl text-green-500"
                            title="გადახდილად მონიშვნა"
                          >
                            <Check className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>
                 </div>
               ))}
               {invoiceList.length === 0 && (
                 <div className="py-20 text-center nm-inset rounded-3xl">
                    <FileText className="size-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 font-bold">ინვოისები არ მოიძებნა</p>
                 </div>
               )}
            </div>
          )}
        </>
      )}

      {/* --- Modals --- */}
      
      {/* Budget Update Modal */}
      <Modal open={!!budgetModal} onClose={() => setBudgetModal(null)} title={`${budgetModal?.month} — ბიუჯეტის მართვა`}>
         <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-black uppercase text-muted-foreground">შემოსავლის მიზანი (₾)</span>
              <input 
                type="number"
                value={budgetModal?.rev} 
                onChange={e => setBudgetModal(prev => prev ? { ...prev, rev: e.target.value } : null)}
                className="nm-inset mt-2 w-full rounded-xl px-4 py-3 font-mono font-bold text-primary outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-muted-foreground">ხარჯვის ლიმიტი (₾)</span>
              <input 
                type="number"
                value={budgetModal?.exp} 
                onChange={e => setBudgetModal(prev => prev ? { ...prev, exp: e.target.value } : null)}
                className="nm-inset mt-2 w-full rounded-xl px-4 py-3 font-mono font-bold text-red-500 outline-none"
              />
            </label>
            <div className="flex gap-3 pt-4">
              <button onClick={() => setBudgetModal(null)} className="nm-btn flex-1 py-3 rounded-2xl font-bold text-muted-foreground">გაუქმება</button>
              <button disabled={adding} onClick={handleUpdateBudget} className="nm-daylight flex-1 py-3 rounded-2xl font-bold text-primary">
                {adding ? <LoaderCircle className="size-4 animate-spin mx-auto" /> : 'შენახვა'}
              </button>
            </div>
         </div>
      </Modal>

      {/* New Invoice Modal */}
      <Modal open={invoiceModal} onClose={() => setInvoiceModal(false)} title="ახალი ინვოისი">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
           <label className="block">
              <span className="text-xs font-black uppercase text-muted-foreground italic">კლიენტის დასახელება</span>
              <input 
                value={newInvClient} 
                onChange={e => setNewInvClient(e.target.value)}
                placeholder="შპს ..."
                className="nm-inset mt-2 w-full rounded-xl px-4 py-3 font-bold outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-muted-foreground italic">კლიენტის ს/ნ (არასავალდებულო)</span>
              <input 
                value={newInvTin} 
                onChange={e => setNewInvTin(e.target.value)}
                placeholder="405..."
                className="nm-inset mt-2 w-full rounded-xl px-4 py-3 font-mono outline-none"
              />
            </label>

            <div className="pt-4 border-t border-slate-100">
               <h4 className="text-sm font-black mb-3">მომსახურების ხაზები</h4>
               <div className="space-y-3">
                  {newInvItems.map((item, idx) => (
                    <div key={idx} className="nm-inset p-3 rounded-2xl space-y-3 relative">
                       <input 
                         placeholder="მომსახურების აღწერა" 
                         value={item.desc}
                         onChange={e => {
                           const n = [...newInvItems]; n[idx].desc = e.target.value; setNewInvItems(n)
                         }}
                         className="w-full bg-transparent font-bold text-sm outline-none px-1"
                       />
                       <div className="flex gap-3">
                          <input 
                            type="number" placeholder="რაოდ." 
                            value={item.qty}
                            onChange={e => {
                              const n = [...newInvItems]; n[idx].qty = parseInt(e.target.value) || 0; setNewInvItems(n)
                            }}
                            className="bg-background/40 rounded-lg px-2 py-1 text-xs font-mono w-16 outline-none"
                          />
                          <input 
                            type="number" placeholder="ფასი" 
                            value={item.price}
                            onChange={e => {
                              const n = [...newInvItems]; n[idx].price = parseFloat(e.target.value) || 0; setNewInvItems(n)
                            }}
                            className="bg-background/40 rounded-lg px-2 py-1 text-xs font-mono flex-1 outline-none"
                          />
                          <div className="flex items-center text-xs font-black text-primary px-1">
                            {gel(item.qty * item.price)}
                          </div>
                          {newInvItems.length > 1 && (
                            <button onClick={() => setNewInvItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400">
                              <X className="size-4" />
                            </button>
                          )}
                       </div>
                    </div>
                  ))}
                  <button 
                    onClick={() => setNewInvItems(prev => [...prev, { desc: '', qty: 1, price: 0 }])}
                    className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
                  >
                    <Plus className="size-3" /> ხაზის დამატება
                  </button>
               </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-1 text-right">
                <p className="text-xs font-bold text-muted-foreground uppercase">Subtotal (Net): {gel(newInvItems.reduce((acc, i) => acc + (i.qty * i.price), 0))}</p>
                <p className="text-xs font-bold text-muted-foreground uppercase">VAT (18%): {gel(newInvItems.reduce((acc, i) => acc + (i.qty * i.price), 0) * 0.18)}</p>
                <p className="text-lg font-black text-slate-800">TOTAL: {gel(newInvItems.reduce((acc, i) => acc + (i.qty * i.price), 0) * 1.18)}</p>
            </div>

            <div className="flex gap-3 pt-6 sticky bottom-0 bg-background/80 backdrop-blur-sm pb-2">
              <button onClick={() => setInvoiceModal(false)} className="nm-btn flex-1 py-3 rounded-2xl font-bold text-muted-foreground">გაუქმება</button>
              <button 
                disabled={adding || !newInvClient} 
                onClick={handleCreateInvoice} 
                className="nm-daylight flex-1 py-3 rounded-2xl font-bold text-primary disabled:opacity-50"
              >
                {adding ? <LoaderCircle className="size-4 animate-spin mx-auto" /> : 'ინვოისის შექმნა'}
              </button>
            </div>
        </div>
      </Modal>

    </div>
  )
}
