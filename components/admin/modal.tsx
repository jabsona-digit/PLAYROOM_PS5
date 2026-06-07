'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  // Portal to <body> so the overlay escapes any transformed ancestor (e.g. the
  // animated console cards) — a `position: fixed` element is otherwise positioned
  // and stacked relative to a transformed parent, letting sibling cards cover it.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="დახურვა"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <div className="nm-raised relative z-10 w-full max-w-md rounded-3xl p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="დახურვა"
            className="nm-btn flex size-9 items-center justify-center rounded-xl"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
