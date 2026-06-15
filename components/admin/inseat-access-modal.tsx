'use client'

import { QRCodeSVG } from 'qrcode.react'
import { Modal } from './modal'
import { useOrg } from '@/lib/org'
import { KeyRound, ScanLine } from 'lucide-react'

// Shown to the operator for an active session: the per-session PIN + a QR that
// embeds it (&k=). Hand either to the customer — both unlock the In-Seat portal
// only for the current session (see migration 0061 / app/p/page.tsx).
export function InSeatAccessModal({
  open,
  onClose,
  consoleId,
  consoleName,
  code,
}: {
  open: boolean
  onClose: () => void
  consoleId: number
  consoleName: string
  code: string
}) {
  const { currentVenueId } = useOrg()
  if (!open || !currentVenueId) return null

  const url = `https://app.martelounge.ge/p?v=${currentVenueId}&c=${consoleId}&k=${code}`

  return (
    <Modal open={open} onClose={onClose} title={`In-Seat წვდომა — ${consoleName}`}>
      <div className="flex flex-col items-center gap-5 text-center">
        <p className="text-sm text-muted-foreground">
          მიეცი კლიენტს ეს კოდი ან ანახე QR. მოქმედებს მხოლოდ ამ სესიის განმავლობაში —
          დასრულებისას ავტომატურად უქმდება.
        </p>

        <div className="w-full">
          <p className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <KeyRound className="size-3.5 text-primary" /> PIN კოდი
          </p>
          <div className="nm-inset rounded-2xl py-4">
            <p className="font-mono text-4xl font-black tracking-[0.3em] text-primary">{code}</p>
          </div>
        </div>

        <div className="w-full">
          <p className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <ScanLine className="size-3.5 text-primary" /> ან დაასკანერე
          </p>
          <div className="inline-block rounded-2xl bg-white p-4 shadow-sm">
            <QRCodeSVG value={url} size={150} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
