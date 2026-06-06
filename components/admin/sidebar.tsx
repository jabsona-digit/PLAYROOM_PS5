'use client'

import {
  Gamepad2,
  LayoutDashboard,
  LogOut,
  Wallet,
  History,
  Tag,
  Users,
  Settings,
  Coffee,
  Package,
  Heart,
  Crown,
  CreditCard,
  Calculator,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import type { ModuleKey } from '@/lib/types'

const NAV: { key: ModuleKey; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'მთავარი', icon: LayoutDashboard },
  { key: 'pos', label: 'ბარი', icon: Coffee },
  { key: 'cashier', label: 'კასა', icon: Wallet },
  { key: 'history', label: 'ისტორია', icon: History },
  { key: 'pricing', label: 'ტარიფები', icon: Tag },
  { key: 'inventory', label: 'საწყობი', icon: Package },
  { key: 'customers', label: 'კლიენტები', icon: Heart },
  { key: 'employees', label: 'თანამშრომლები', icon: Users },
  { key: 'settings', label: 'პარამეტრები', icon: Settings },
  { key: 'billing', label: 'გამოწერა', icon: CreditCard },
  { key: 'accounting', label: 'ბუღალტერია', icon: Calculator },
  { key: 'reservations', label: 'ჯავშნები', icon: CalendarClock },
]

export function Sidebar({
  active,
  onSelect,
  email,
  onLogout,
}: {
  active: ModuleKey
  onSelect: (key: ModuleKey) => void
  email?: string
  onLogout: () => void
}) {
  const { isPlatformAdmin } = useOrg()
  const initial = email?.trim()?.[0]?.toUpperCase() ?? 'A'
  const nav = isPlatformAdmin
    ? [...NAV, { key: 'platform' as ModuleKey, label: 'პლატფორმა', icon: Crown }]
    : NAV
  return (
    <aside className="flex w-[88px] shrink-0 flex-col items-center gap-3 py-6 md:w-64 md:items-stretch md:px-5">
      {/* brand */}
      <div className="mb-4 flex items-center gap-3 md:px-1">
        <div className="nm-raised-sm flex size-12 items-center justify-center rounded-2xl">
          <Gamepad2 className="size-6 text-primary" />
        </div>
        <div className="hidden md:block">
          <p className="text-base font-extrabold leading-tight">Playroom</p>
          <p className="text-xs text-muted-foreground">PS5 Manager</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-3">
        {nav.map(({ key, label, icon: Icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group flex items-center justify-center gap-3 rounded-2xl px-3 py-3.5 text-sm font-semibold outline-none md:justify-start',
                isActive ? 'nm-daylight' : 'nm-btn',
              )}
            >
              <Icon
                className={cn(
                  'size-5 shrink-0 transition-colors',
                  isActive
                    ? 'text-primary drop-shadow-[0_0_8px_var(--primary)]'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span
                className={cn(
                  'hidden md:inline',
                  isActive ? 'text-primary text-glow' : 'text-foreground',
                )}
              >
                {label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* user + logout */}
      <div className="mt-3 space-y-2">
        <div className="nm-raised flex items-center gap-3 rounded-2xl p-3">
          <div className="relative shrink-0">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm font-bold uppercase text-primary">
              {initial}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-[var(--status-free)] ring-2 ring-[var(--surface)]" />
          </div>
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-sm font-bold leading-tight">
              {email ?? 'ადმინი'}
            </p>
            <p className="text-xs text-muted-foreground">შესული</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="nm-btn flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted-foreground md:justify-start"
        >
          <LogOut className="size-5 shrink-0" />
          <span className="hidden md:inline">გასვლა</span>
        </button>
      </div>
    </aside>
  )
}
