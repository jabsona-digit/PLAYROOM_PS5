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
  Globe,
  Trophy,
  Lock,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg, useModuleAccess } from '@/lib/org'
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
  { key: 'online_bookings', label: 'ონლაინ ჯავშნები', icon: Globe },
  { key: 'tournaments', label: 'ტურნირები', icon: Trophy },
]

function NavButton({ item, active, onSelect }: { 
  item: { key: ModuleKey; label: string; icon: LucideIcon }; 
  active: boolean; 
  onSelect: (key: ModuleKey) => void 
}) {
  const hasAccess = useModuleAccess(item.key)
  if (!hasAccess) return null

  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-2xl px-3 py-3.5 text-sm font-semibold outline-none',
        active ? 'nm-daylight' : 'nm-btn',
      )}
    >
      <Icon
        className={cn(
          'size-5 shrink-0 transition-colors',
          active
            ? 'text-primary drop-shadow-[0_0_8px_var(--primary)]'
            : 'text-muted-foreground group-hover:text-foreground',
        )}
      />
      <span className={cn(active ? 'text-primary text-glow' : 'text-foreground')}>
        {item.label}
      </span>
    </button>
  )
}

export function Sidebar({
  active,
  onSelect,
  email,
  onLogout,
  open,
  onClose,
}: {
  active: ModuleKey
  onSelect: (key: ModuleKey) => void
  email?: string
  onLogout: () => void
  open: boolean
  onClose: () => void
}) {
  const { isPlatformAdmin, activeEmployee, activeRole, lockTerminal, hasEmployees } = useOrg()
  const initial = (activeEmployee?.name ?? email ?? 'A').trim()?.[0]?.toUpperCase()
  const nav = isPlatformAdmin
    ? [...NAV, { key: 'platform' as ModuleKey, label: 'პლატფორმა', icon: Crown }]
    : NAV

  return (
    <>
      {/* Mobile backdrop — tapping it closes the drawer */}
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          // layout
          'flex shrink-0 flex-col gap-3 overflow-y-auto px-5 py-3 md:py-6',
          // mobile: fixed full-height drawer that slides in from the left
          'fixed inset-y-0 left-0 z-40 w-72 transition-transform duration-300 ease-in-out',
          'rounded-r-[2rem]',
          open ? 'translate-x-0' : '-translate-x-full',
          // desktop: static inside the flex card, always visible, no extra styling
          'md:static md:w-64 md:translate-x-0 md:rounded-none md:shadow-none',
          // mobile-only: surface background + right-side shadow for depth
          'max-md:bg-[var(--surface-2)] max-md:shadow-[8px_0_48px_rgba(0,0,0,0.6)]',
        )}
      >
        {/* brand */}
        <div className="mb-4 flex items-center gap-3 px-1">
          <div className="nm-raised-sm flex size-12 items-center justify-center rounded-2xl">
            <Gamepad2 className="size-6 text-primary" />
          </div>
          <div>
            <p className="text-base font-extrabold leading-tight">Martelounge</p>
            <p className="text-xs text-muted-foreground">Gaming OS</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-3">
          {nav.map((item) => (
            <NavButton
              key={item.key}
              item={item}
              active={active === item.key}
              onSelect={onSelect}
            />
          ))}
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
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">
                {activeEmployee?.name ?? email ?? 'ადმინი'}
              </p>
              <p className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-wider">
                {activeRole ?? 'შესული'}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {hasEmployees && (
              <button
                type="button"
                onClick={lockTerminal}
                title="ჩაკეტვა / მომხმარებლის შეცვლა"
                className="nm-btn flex size-11 items-center justify-center rounded-2xl text-primary"
              >
                <Lock className="size-5" />
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="nm-btn flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted-foreground"
            >
              <LogOut className="size-5 shrink-0" />
              <span>გასვლა</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
