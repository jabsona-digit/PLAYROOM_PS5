'use client'

import { useEffect } from 'react'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Info,
  TimerOff,
  X,
} from 'lucide-react'
import { usePlayroom } from '@/lib/store'
import type { Toast, ToastType } from '@/lib/types'

const META: Record<ToastType, { color: string; Icon: typeof Info }> = {
  info: { color: 'var(--primary)', Icon: Info },
  success: { color: 'var(--status-free)', Icon: CheckCircle2 },
  warning: { color: 'var(--status-warning10)', Icon: BellRing },
  danger: { color: 'var(--status-warning5)', Icon: AlertTriangle },
  expired: { color: 'var(--status-expired)', Icon: TimerOff },
}

function ToastCard({ toast }: { toast: Toast }) {
  const { dismissToast } = usePlayroom()
  const { color, Icon } = META[toast.type]

  useEffect(() => {
    const id = setTimeout(() => dismissToast(toast.id), 4500)
    return () => clearTimeout(id)
  }, [toast.id, dismissToast])

  return (
    <div
      className="nm-raised pointer-events-auto flex items-start gap-3 rounded-2xl p-4 duration-300 animate-in fade-in slide-in-from-right-4"
      role="status"
      style={{
        boxShadow: `6px 6px 14px var(--nm-dark), -6px -6px 14px var(--nm-light), 0 0 0 1px color-mix(in oklch, ${color} 45%, transparent), 0 0 20px 1px color-mix(in oklch, ${color} 32%, transparent)`,
      }}
    >
      <span
        className="nm-inset flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{ color }}
      >
        <Icon className="size-5" />
      </span>
      <p className="flex-1 pt-1 text-sm font-semibold text-pretty">
        {toast.message}
      </p>
      <button
        type="button"
        aria-label="დახურვა"
        onClick={() => dismissToast(toast.id)}
        className="nm-btn flex size-7 shrink-0 items-center justify-center rounded-lg"
      >
        <X className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  )
}

export function ToastViewport() {
  const { toasts } = usePlayroom()
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-3">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  )
}
