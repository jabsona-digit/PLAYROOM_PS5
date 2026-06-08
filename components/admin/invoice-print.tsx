'use client'

import React from 'react'
import type { Invoice, InvoiceItem } from '@/lib/types'
import { gel } from '@/lib/ui'

interface InvoicePrintProps {
  invoice: Invoice
  items: InvoiceItem[]
  onClose: () => void
}

export function InvoicePrint({ invoice, items, onClose }: InvoicePrintProps) {
  React.useEffect(() => {
    // triggering print slightly after mount to ensure layout is ready
    const timer = setTimeout(() => {
      window.print()
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="fixed inset-0 z-[9999] bg-white overflow-auto p-0 m-0 print:static print:inset-auto">
      {/* UI Overlay for closing on screen */}
      <div className="print:hidden fixed top-4 right-4 flex gap-4">
        <button 
          onClick={() => window.print()}
          className="bg-primary text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all"
        >
          დაბეჭდვა
        </button>
        <button 
          onClick={onClose}
          className="bg-slate-800 text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all"
        >
          დახურვა
        </button>
      </div>

      <div className="max-w-[210mm] min-h-[297mm] mx-auto bg-white p-[20mm] shadow-none print:shadow-none print:p-0">
        {/* Header */}
        <div className="flex justify-between items-start mb-12 border-b-2 border-slate-900 pb-8">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 mb-2">MARTELOUNGE</h1>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest leading-tight">
              Premium Gaming & Entertainment Hub
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">ინვოისი / INVOICE</h2>
            <p className="text-lg font-mono font-bold text-primary">#{invoice.invoice_number}</p>
            <p className="text-sm text-slate-500 mt-2">{new Date(invoice.issued_at).toLocaleDateString('ka-GE')}</p>
          </div>
        </div>

        {/* Info Blocks */}
        <div className="grid grid-cols-2 gap-12 mb-12">
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">გამყიდველი / FROM</h3>
            <div className="space-y-1">
              <p className="font-bold text-slate-900 italic">Martelounge Lounge Group</p>
              <p className="text-sm text-slate-600">თბილისი, საქართველო</p>
              <p className="text-sm text-slate-600 font-mono">ს/ნ: 405123456</p>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">მყიდველი / TO</h3>
            <div className="space-y-1">
              <p className="font-bold text-slate-900">{invoice.client_name}</p>
              {invoice.client_tin && <p className="text-sm text-slate-600 font-mono">ს/ნ: {invoice.client_tin}</p>}
            </div>
          </div>
        </div>

        {/* Table */}
        <table className="w-full mb-12 border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="py-4 text-left text-xs font-black uppercase text-slate-400">დასახელება / DESCRIPTION</th>
              <th className="py-4 text-right text-xs font-black uppercase text-slate-400">რაოდ. / QTY</th>
              <th className="py-4 text-right text-xs font-black uppercase text-slate-400">ფასი / PRICE</th>
              <th className="py-4 text-right text-xs font-black uppercase text-slate-400">ჯამი / TOTAL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <tr key={item.id || idx}>
                <td className="py-5 font-semibold text-slate-800">{item.description}</td>
                <td className="py-5 text-right font-mono text-slate-600">{item.qty}</td>
                <td className="py-5 text-right font-mono text-slate-600">{gel(item.unit_price)}</td>
                <td className="py-5 text-right font-mono font-bold text-slate-900">{gel(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end pt-8 border-t-2 border-slate-100">
          <div className="w-64 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">შუალედური ჯამი:</span>
              <span className="font-mono font-bold text-slate-800">{gel(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">დღგ (18%):</span>
              <span className="font-mono font-bold text-slate-800">{gel(invoice.vat_total)}</span>
            </div>
            <div className="flex justify-between pt-3 border-t border-slate-900">
              <span className="font-black uppercase tracking-tighter">სულ ჯამი:</span>
              <span className="text-2xl font-black font-mono text-slate-900">{gel(invoice.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-24 text-center">
          <div className="inline-block border-t border-slate-200 px-12 pt-4">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
              Powered by Playroom OS • martelounge.com
            </p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
            background: white !important;
          }
          .print-hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}
