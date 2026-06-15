'use client'

import { QRCodeSVG } from 'qrcode.react'
import { Modal } from './modal'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { Printer } from 'lucide-react'

export function QrPrintModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { consoles } = usePlayroom()
  const { currentVenueId } = useOrg()

  if (!open || !currentVenueId) return null

  const handlePrint = () => {
    window.print()
  }

  return (
    <Modal open={open} onClose={onClose} title="QR კოდების ბეჭდვა">
      <div className="space-y-6 flex flex-col">
        <p className="text-sm text-muted-foreground">
          დაბეჭდეთ ეს QR კოდები და განათავსეთ მაგიდებზე. მომხმარებლები შეძლებენ სკანირებას "In-Seat Ordering"-ისთვის.
        </p>

        <div className="print:block grid grid-cols-2 gap-6 overflow-y-auto max-h-[50vh] pb-4">
          {consoles.map((c) => {
            const url = `https://app.martelounge.ge/p?v=${currentVenueId}&c=${c.id}`
            return (
              <div
                key={c.id}
                className="nm-inset flex flex-col items-center justify-center p-6 rounded-3xl print:nm-none print:border-2 print:border-black print:rounded-3xl print:p-8 print:break-inside-avoid"
              >
                <div className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                  <QRCodeSVG value={url} size={120} />
                </div>
                <h4 className="font-black text-lg text-primary print:text-black">
                  {c.name}
                </h4>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest print:text-gray-500">
                  სკანირება შეკვეთისთვის
                </p>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={handlePrint}
          className="nm-daylight w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-primary print:hidden mt-2"
        >
          <Printer className="size-5" />
          ამობეჭდვა 
        </button>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          [role="dialog"] {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            box-shadow: none !important;
            background: white !important;
          }
          [role="dialog"] * {
            visibility: visible;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:text-black {
            color: black !important;
          }
        }
      `}</style>
    </Modal>
  )
}
