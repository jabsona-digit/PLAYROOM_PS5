'use client'

/**
 * RS.GE Fiscal Receipt — Phase B (PDF/print via window.print)
 *
 * Phase C (future): replace printFiscalReceipt with a call to the local
 * Bridge Agent (localhost:3434) which forwards to a physical Daisy register.
 *
 * Toggle: fiscal_enabled is stored per-venue in the venues table.
 * When false, nothing in this module is called — callers guard with fiscalEnabled.
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase/client'
import { useOrg } from './org'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FiscalVenueSettings {
  fiscal_enabled: boolean
  fiscal_tin: string | null
  fiscal_business_name: string | null
  fiscal_address: string | null
}

export interface FiscalItem {
  name: string
  qty: number
  unitPrice: number
}

interface PrintPayload {
  receiptNo: string
  date: string
  items: FiscalItem[]
  total: number
  paymentMethod: string
  currency?: string
  settings: FiscalVenueSettings
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useFiscal() {
  const { currentVenueId } = useOrg()
  const [settings, setSettings] = useState<FiscalVenueSettings>({
    fiscal_enabled: false,
    fiscal_tin: null,
    fiscal_business_name: null,
    fiscal_address: null,
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!currentVenueId) return
    const { data } = await supabase
      .from('venues')
      .select('fiscal_enabled, fiscal_tin, fiscal_business_name, fiscal_address')
      .eq('id', currentVenueId)
      .single()
    if (data) setSettings(data as FiscalVenueSettings)
  }, [currentVenueId])

  useEffect(() => { load() }, [load])

  const save = async (patch: Partial<FiscalVenueSettings>) => {
    if (!currentVenueId) return
    setSaving(true)
    await supabase.from('venues').update(patch).eq('id', currentVenueId)
    setSettings((prev) => ({ ...prev, ...patch }))
    setSaving(false)
  }

  const issueReceipt = async (
    items: FiscalItem[],
    total: number,
    paymentMethod: string,
    currency = '₾',
  ) => {
    if (!settings.fiscal_enabled) return
    const { data } = await supabase.rpc('next_fiscal_receipt_no')
    const receiptNo: string = data ?? `GE-${Date.now()}`
    printFiscalReceipt({
      receiptNo,
      date: new Date().toLocaleString('ka-GE', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }),
      items,
      total,
      paymentMethod,
      currency,
      settings,
    })
  }

  return {
    fiscalEnabled: settings.fiscal_enabled,
    fiscalSettings: settings,
    saveFiscalSettings: save,
    savingFiscal: saving,
    issueReceipt,
    reloadFiscal: load,
  }
}

// ─── Print ───────────────────────────────────────────────────────────────────

function printFiscalReceipt(p: PrintPayload) {
  const currency = p.currency ?? '₾'
  const fmt = (n: number) => `${currency}${n.toFixed(2)}`
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const itemRows = p.items
    .map(
      (i) =>
        `<tr>
          <td class="name">${esc(i.name)}</td>
          <td class="right">${i.qty}</td>
          <td class="right">${fmt(i.unitPrice)}</td>
          <td class="right bold">${fmt(i.qty * i.unitPrice)}</td>
        </tr>`,
    )
    .join('')

  const businessName = p.settings.fiscal_business_name ?? ''
  const tin = p.settings.fiscal_tin ?? ''
  const address = p.settings.fiscal_address ?? ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ფისკალური ჩეკი ${esc(p.receiptNo)}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      width: 80mm;
      padding: 4mm;
      color: #000;
    }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: bold; }
    .title  { font-size: 15px; font-weight: bold; text-align: center; }
    .fiscal-label {
      text-align: center;
      font-size: 10px;
      border: 1px solid #000;
      padding: 2px 6px;
      margin: 4px auto;
      display: inline-block;
      letter-spacing: 1px;
    }
    .divider { border-top: 1px dashed #000; margin: 5px 0; }
    .divider-solid { border-top: 1px solid #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 1px; vertical-align: top; }
    td.name { width: 45%; }
    .total-row td { font-weight: bold; font-size: 13px; }
    .footer { text-align: center; margin-top: 8px; font-size: 10px; }
    .meta { font-size: 10px; }
    @media print { body { width: 80mm; } }
  </style>
</head>
<body>
  <div class="center">
    <div class="title">${esc(businessName)}</div>
    ${tin ? `<div class="meta">ს/ნ: ${esc(tin)}</div>` : ''}
    ${address ? `<div class="meta">${esc(address)}</div>` : ''}
    <div class="divider"></div>
    <div class="fiscal-label">★ ფისკალური ჩეკი ★</div>
  </div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr class="meta">
        <td>დასახელება</td>
        <td class="right">რაოდ.</td>
        <td class="right">ფასი</td>
        <td class="right">სულ</td>
      </tr>
    </thead>
    <tbody>
      <tr><td colspan="4"><div class="divider-solid"></div></td></tr>
      ${itemRows}
    </tbody>
    <tfoot>
      <tr><td colspan="4"><div class="divider-solid"></div></td></tr>
      <tr class="total-row">
        <td colspan="3">სულ:</td>
        <td class="right">${fmt(p.total)}</td>
      </tr>
      <tr class="meta">
        <td colspan="3">გადახდა:</td>
        <td class="right">${esc(p.paymentMethod)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="divider"></div>

  <div class="meta center">
    <div>ჩეკი №: ${esc(p.receiptNo)}</div>
    <div>${esc(p.date)}</div>
  </div>

  <div class="divider"></div>
  <div class="footer">გმადლობთ! / Thank you!</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=340,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 350)
}
