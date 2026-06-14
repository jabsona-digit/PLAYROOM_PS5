'use client'

import { Bell, Menu, Search, Settings } from 'lucide-react'
import { usePlayroom } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { ModuleKey } from '@/lib/types'
import { VenueSwitcher } from './venue-switcher'
import { useBookingAlerts } from './booking-alerts'

const TITLES: Record<ModuleKey, { title: string; subtitle: string }> = {
  dashboard: { title: 'მთავარი', subtitle: 'ყველა კონსოლი ერთ ეკრანზე' },
  pos: { title: 'ბარი', subtitle: 'პროდუქტების სწრაფი გაყიდვა' },
  cashier: { title: 'კასა', subtitle: 'შემოსავალი კონსოლებისა და პერიოდების მიხედვით' },
  history: { title: 'ისტორია', subtitle: 'დასრულებული სესიების ჩანაწერები' },
  pricing: { title: 'ტარიფები', subtitle: 'ფასის ცვლილება მხოლოდ მომავალ სესიებზე ვრცელდება' },
  inventory: { title: 'საწყობი', subtitle: 'კატეგორიებისა და პროდუქციის მარაგების მართვა' },
  customers: { title: 'კლიენტები', subtitle: 'ლოიალობის პროგრამა, ქულები და ფასდაკლებები' },
  employees: { title: 'თანამშრომლები', subtitle: 'Clock In / Clock Out და ცვლების ჟურნალი' },
  settings: { title: 'პარამეტრები', subtitle: 'დაწესებულება, გაფრთხილებები და კონსოლების მართვა' },
  platform: { title: 'პლატფორმა (God Mode)', subtitle: 'ყველა ორგანიზაცია, გამოწერები და MRR' },
  billing: { title: 'გამოწერა', subtitle: 'პლანი, გამოყენება და ანგარიშსწორება' },
  accounting: { title: 'ბუღალტერია', subtitle: 'ფინანსური რეპორტები' },
  reservations: { title: 'ჯავშნები', subtitle: 'კონსოლების წინასწარი დაჯავშნა' },
  online_bookings: { title: 'ონლაინ ჯავშნები', subtitle: 'martelounge.ge-დან შემოსული ჯავშნები' },
  tournaments: { title: 'ტურნირები', subtitle: 'PS5 ტურნირები — ბადე, მატჩები, გამარჯვებული' },
  guide: { title: 'სახელმძღვანელო', subtitle: 'სრული გზამკვლევი — ყველა მოდული და პროცესი' },
  analytics: { title: 'ანალიტიკა', subtitle: 'RevPACH, კონსოლების ეფექტურობა და მოთხოვნის რუკა' },
}

export function Topbar({
  active,
  onMenuClick,
  onBellClick,
}: {
  active: ModuleKey
  onMenuClick?: () => void
  onBellClick?: () => void
}) {
  const meta = TITLES[active] ?? { title: '', subtitle: '' }
  const { consoles, pushToast } = usePlayroom()
  const { pendingCount } = useBookingAlerts()

  const expiring = consoles.filter(
    (c) => c.status === 'warning_5' || c.status === 'expired',
  )

  const ringBell = () => {
    if (expiring.length === 0) {
      pushToast('info', 'ყველა კონსოლი წესრიგშია')
      return
    }
    pushToast(
      'danger',
      `${expiring.length} კონსოლი იწურება: ${expiring.map((c) => c.name).join(', ')}`,
    )
  }

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {/* hamburger — mobile only, opens the sidebar drawer */}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="მენიუ"
          className="nm-btn flex size-11 shrink-0 items-center justify-center rounded-2xl md:hidden"
        >
          <Menu className="size-5 text-muted-foreground" />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-balance md:text-3xl">
            {meta.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{meta.subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <VenueSwitcher />
        <label className="nm-inset hidden items-center gap-2 rounded-2xl px-4 py-2.5 sm:flex">
          <Search className="size-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="ძიება..."
            className="w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground md:w-48"
          />
        </label>
        <button
          type="button"
          aria-label="შეტყობინებები"
          onClick={() => (pendingCount > 0 ? onBellClick?.() : ringBell())}
          title={pendingCount > 0 ? `${pendingCount} ახალი ონლაინ ჯავშანი` : undefined}
          className="nm-btn relative flex size-11 items-center justify-center rounded-2xl"
        >
          <Bell
            className={cn(
              'size-5',
              pendingCount > 0 ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          {pendingCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-w-[18px] animate-pulse items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-[var(--primary-foreground)] shadow-[0_0_10px_var(--primary)]">
              {pendingCount}
            </span>
          ) : expiring.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-[var(--status-expired)] px-1 text-[10px] font-bold text-white">
              {expiring.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          aria-label="პარამეტრები"
          className="nm-btn flex size-11 items-center justify-center rounded-2xl"
        >
          <Settings className="size-5 text-muted-foreground" />
        </button>
      </div>
    </header>
  )
}
