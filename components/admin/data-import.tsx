'use client'

import { useRef, useState } from 'react'
import { FileDown, FileUp, Gamepad2, Tag, Users, LoaderCircle } from 'lucide-react'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { downloadTemplate, readExcel } from '@/lib/excel'

// Onboarding data import (recs P1-1). Lets a venue bring its existing Excel — consoles,
// tariffs, customers — instead of retyping. Client-side parse + RLS-bound inserts (the
// owner is an org admin), idempotent (skips duplicates), with a download-template so the
// columns are unambiguous. No new DB surface.
type Kind = 'consoles' | 'tariffs' | 'customers'

function norm(s: unknown): string {
  return String(s ?? '').trim()
}
// Georgian mobile → 9 digits starting with 5 (drops +995); '' if invalid.
function cleanPhone(raw: unknown): string {
  let p = norm(raw).replace(/\D/g, '')
  if (p.length === 12 && p.startsWith('995')) p = p.slice(3)
  return p.length === 9 && p.startsWith('5') ? p : ''
}

export function DataImport() {
  const { consoles, plans, refreshLive, refreshPlans, pushToast } = usePlayroom()
  const { currentOrgId, currentVenueId } = useOrg()
  const [busy, setBusy] = useState<Kind | null>(null)

  const importConsoles = async (file: File) => {
    if (!currentOrgId || !currentVenueId) return pushToast('danger', 'ფილიალი არ არის არჩეული')
    const rows = await readExcel(file)
    if (!rows.length) return pushToast('warning', 'ფაილი ცარიელია')
    const seen = new Set(consoles.map((c) => c.name.toLowerCase()))
    let slot = consoles.reduce((m, c) => Math.max(m, c.slot_number), 0)
    const toInsert: { org_id: string; venue_id: string; slot_number: number; name: string; console_type: string; status: string }[] = []
    let skipped = 0
    for (const r of rows as Record<string, unknown>[]) {
      const name = norm(r['დასახელება'])
      if (!name || seen.has(name.toLowerCase())) { skipped++; continue }
      seen.add(name.toLowerCase())
      slot++
      toInsert.push({
        org_id: currentOrgId, venue_id: currentVenueId, slot_number: slot, name,
        console_type: (norm(r['ტიპი']).toLowerCase() || 'standard'), status: 'free',
      })
    }
    if (!toInsert.length) return pushToast('info', `ახალი არაფერი — ${skipped} გამოტოვდა (დუბლი/ცარიელი)`)
    const { error } = await supabase.from('consoles').insert(toInsert)
    if (error) throw error
    await refreshLive()
    pushToast('success', `${toInsert.length} კონსოლი დაემატა${skipped ? ` · ${skipped} გამოტოვდა` : ''}`)
  }

  const importTariffs = async (file: File) => {
    if (!currentOrgId) return
    const rows = await readExcel(file)
    if (!rows.length) return pushToast('warning', 'ფაილი ცარიელია')
    const seen = new Set(plans.map((p) => p.name.toLowerCase()))
    const toInsert: Record<string, unknown>[] = []
    let skipped = 0
    for (const r of rows as Record<string, unknown>[]) {
      const name = norm(r['დასახელება'])
      const price = Number(r['ფასი_სთ'] ?? r['ფასი'] ?? 0)
      if (!name || !(price > 0) || seen.has(name.toLowerCase())) { skipped++; continue }
      seen.add(name.toLowerCase())
      const controllers = Number(r['ჯოისტიკები']) || 2
      const type = controllers === 2 ? 'standard' : controllers === 3 ? 'pro' : controllers === 4 ? 'premium' : 'custom'
      toInsert.push({
        org_id: currentOrgId, name, type, controllers, price_per_hour: price,
        category: norm(r['კატეგორია']).toLowerCase() || null,
      })
    }
    if (!toInsert.length) return pushToast('info', `ახალი არაფერი — ${skipped} გამოტოვდა (დუბლი/ცარიელი)`)
    const { error } = await (supabase.from('pricing_plans') as never as { insert: (v: unknown) => Promise<{ error: { message: string } | null }> }).insert(toInsert)
    if (error) throw new Error(error.message)
    await refreshPlans()
    pushToast('success', `${toInsert.length} ტარიფი დაემატა${skipped ? ` · ${skipped} გამოტოვდა` : ''}`)
  }

  const importCustomers = async (file: File) => {
    if (!currentOrgId) return
    const rows = await readExcel(file)
    if (!rows.length) return pushToast('warning', 'ფაილი ცარიელია')
    // existing phones in this org (RLS-scoped) so re-import doesn't duplicate
    const { data: existing } = await supabase.from('customers').select('phone').is('deleted_at', null)
    const seen = new Set((existing ?? []).map((c: { phone: string | null }) => c.phone ?? ''))
    const toInsert: { org_id: string; name: string; phone: string; points: number }[] = []
    let skipped = 0
    for (const r of rows as Record<string, unknown>[]) {
      const name = norm(r['სახელი'])
      const phone = cleanPhone(r['ტელეფონი'])
      if (!name || !phone || seen.has(phone)) { skipped++; continue }  // valid GE mobile required (trigger)
      seen.add(phone)
      toInsert.push({ org_id: currentOrgId, name, phone, points: Number(r['ქულები']) || 0 })
    }
    if (!toInsert.length) return pushToast('info', `ახალი არაფერი — ${skipped} გამოტოვდა (არასწორი/დუბლი ნომერი)`)
    const { error } = await supabase.from('customers').insert(toInsert)
    if (error) throw error
    pushToast('success', `${toInsert.length} კლიენტი დაემატა${skipped ? ` · ${skipped} გამოტოვდა` : ''}`)
  }

  const run = async (kind: Kind, file: File | undefined) => {
    if (!file) return
    setBusy(kind)
    try {
      if (kind === 'consoles') await importConsoles(file)
      else if (kind === 'tariffs') await importTariffs(file)
      else await importCustomers(file)
    } catch (err) {
      pushToast('danger', 'იმპორტი ვერ მოხერხდა: ' + (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const ROWS: { kind: Kind; icon: typeof Gamepad2; title: string; hint: string }[] = [
    { kind: 'consoles', icon: Gamepad2, title: 'კონსოლები', hint: 'დასახელება + ტიპი (standard/vip/billiard…)' },
    { kind: 'tariffs', icon: Tag, title: 'ტარიფები', hint: 'დასახელება + ფასი/სთ + ჯოისტიკები + კატეგორია' },
    { kind: 'customers', icon: Users, title: 'კლიენტები', hint: 'სახელი + ტელეფონი (9 ციფრი, 5-ით) + ქულები' },
  ]

  return (
    <section className="nm-raised rounded-3xl p-6">
      <div className="mb-1 flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <FileUp className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">მონაცემების იმპორტი (Excel)</h2>
          <p className="text-xs text-muted-foreground">ჩამოტვირთე შაბლონი, შეავსე შენი Excel-იდან და ატვირთე — ხელით აკრეფის გარეშე.</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {ROWS.map((row) => (
          <ImportRow key={row.kind} {...row} busy={busy === row.kind} onFile={(f) => run(row.kind, f)} />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        დუბლები (იგივე სახელი/ნომერი) ავტომატურად გამოიტოვება — ხელახლა ატვირთვა უსაფრთხოა.
      </p>
    </section>
  )
}

function ImportRow({
  kind, icon: Icon, title, hint, busy, onFile,
}: {
  kind: Kind; icon: typeof Gamepad2; title: string; hint: string; busy: boolean; onFile: (f?: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="nm-inset flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Icon className="size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => downloadTemplate(kind)}
          className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground"
        >
          <FileDown className="size-3.5" /> შაბლონი
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-primary disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />} ატვირთვა
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }}
        />
      </div>
    </div>
  )
}
