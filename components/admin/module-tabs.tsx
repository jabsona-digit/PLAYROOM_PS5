'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Mobile-only segmented tabs for admin modules. Our modules are long vertical stacks
// of `nm-raised` cards → on a phone that's a lot of scrolling. On < md we show a
// horizontal, scrollable tab bar and reveal only the active section; on md+ every
// section renders exactly as before (tab bar hidden) — desktop is untouched.
//
// Sections stay MOUNTED (hidden with CSS, never unmounted) so their internal state,
// effects and data-fetching keep working when you switch tabs. Keep <Modal>/portal
// elements OUTSIDE this component (at the module root) so they work from any tab.
//
// `desktopClassName` reproduces the module's ORIGINAL desktop wrapper so md+ looks
// identical — default is a single-column stack (`space-y-6`); pass the original grid
// (e.g. `grid gap-6 lg:grid-cols-2`) for grid modules like Settings. For a section
// that spanned all columns on desktop, set `wide: true` (adds `lg:col-span-2` to its
// wrapper) so the grid still matches.
export interface ModuleTab {
  id: string
  label: string
  icon?: ReactNode
  content: ReactNode
  wide?: boolean
}

export function ModuleTabs({
  tabs,
  initial,
  desktopClassName = 'space-y-6',
}: {
  tabs: ModuleTab[]
  initial?: string
  desktopClassName?: string
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id)

  return (
    <div>
      {/* mobile tab bar (hidden on desktop) */}
      <div
        role="tablist"
        className="md:hidden -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors',
              active === t.id ? 'nm-inset text-primary' : 'nm-btn text-muted-foreground',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* sections: one-at-a-time on mobile, original desktop layout on md+ */}
      <div className={desktopClassName}>
        {tabs.map((t) => (
          <div
            key={t.id}
            className={cn(
              active === t.id ? 'block' : 'hidden',
              'md:block',
              t.wide && 'lg:col-span-2',
            )}
          >
            {t.content}
          </div>
        ))}
      </div>
    </div>
  )
}
