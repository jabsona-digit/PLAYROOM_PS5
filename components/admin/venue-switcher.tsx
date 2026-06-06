'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'

export function VenueSwitcher() {
  const { venues, currentVenueId, setCurrentVenue } = useOrg()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const current = venues.find((v) => v.id === currentVenueId)
  if (venues.length === 0) return null

  // single venue → static chip
  if (venues.length === 1) {
    return (
      <span className="nm-inset hidden items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold sm:flex">
        <MapPin className="size-4 text-primary" />
        {current?.name}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
      >
        <MapPin className="size-4 text-primary" />
        <span className="max-w-[140px] truncate">{current?.name ?? 'ფილიალი'}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {open ? (
        <div className="nm-raised absolute right-0 z-50 mt-2 w-56 rounded-2xl p-2">
          {venues.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setCurrentVenue(v.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold',
                v.id === currentVenueId ? 'nm-inset text-primary' : 'hover:bg-[var(--surface-2)]',
              )}
            >
              <span className="flex items-center gap-2">
                <MapPin className="size-4 text-muted-foreground" />
                {v.name}
              </span>
              {v.id === currentVenueId ? <Check className="size-4 text-primary" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
