import type { ConsoleStatus, PaymentMethod } from './types'

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: 'ქეში',
  card: 'ბარათი',
  transfer: 'გადარიცხვა',
}

export const statusMeta: Record<
  ConsoleStatus,
  { label: string; color: string; dot: string }
> = {
  free: {
    label: 'თავისუფალია',
    color: 'var(--status-free)',
    dot: 'bg-[var(--status-free)]',
  },
  active: {
    label: 'მიმდინარეობს',
    color: 'var(--status-active)',
    dot: 'bg-[var(--status-active)]',
  },
  warning_10: {
    label: '10 წუთი დარჩა',
    color: 'var(--status-warning10)',
    dot: 'bg-[var(--status-warning10)]',
  },
  warning_5: {
    label: '5 წუთი დარჩა',
    color: 'var(--status-warning5)',
    dot: 'bg-[var(--status-warning5)]',
  },
  expired: {
    label: 'დრო ამოიწურა',
    color: 'var(--status-expired)',
    dot: 'bg-[var(--status-expired)]',
  },
}

// Currency symbol is configurable in Settings. We keep it in a module-level
// singleton so the pure `gel()` formatter (used in ~12 call sites) honours the
// setting without threading it through every component. The provider syncs this
// on each render via setCurrencySymbol, so it is always current before children
// render.
let _currency = '₾'

export function setCurrencySymbol(symbol: string) {
  if (symbol) _currency = symbol
}

export function gel(n: number) {
  return `${_currency}${n.toFixed(2)}`
}

// Translate the plan-enforcement errors raised by migration 0062 triggers into
// friendly Georgian. Returns the original message for anything unrelated.
export function planErrorText(msg: string): string {
  if (!msg) return 'შეცდომა. სცადეთ თავიდან.'
  if (msg.includes('plan_upgrade_required:enterprise')) return 'ეს ფუნქცია ENTERPRISE გეგმაშია — გადადი „გამოწერა"-ში.'
  if (msg.includes('plan_upgrade_required')) return 'ეს ფუნქცია PRO გეგმიდან ხელმისაწვდომია — გადადი „გამოწერა"-ში.'
  if (msg.includes('hardware_required')) return 'ამ კონსოლზე ჯერ დააკონფიგურირე Hardware კონტროლი (პარამეტრები → 🔌 Hardware), ან გამორთე მოთხოვნა.'
  const lim = msg.match(/plan_limit_reached:(\w+):(\d+)/)
  if (lim) {
    const kind: Record<string, string> = { venues: 'ფილიალების', consoles: 'კონსოლების', employees: 'თანამშრომლების' }
    return `მიღწეულია ${kind[lim[1]] ?? ''} ლიმიტი (${lim[2]}) თქვენი გეგმისთვის — გადადი უფრო მაღალ გეგმაზე.`
  }
  return msg
}

/** Local-time epoch for the start of today / this week (Mon) / this month. */
export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function startOfWeek() {
  const d = new Date()
  const fromMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - fromMonday)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function startOfMonth() {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Open (pay-as-you-go) session billing: round elapsed time UP to the nearest
    5 minutes, minimum 5. Mirrors the `end_session` RPC so the live estimate on
    the card matches the amount the server actually charges. */
export function openBillableMinutes(elapsedMs: number) {
  return Math.max(5, Math.ceil(Math.max(0, elapsedMs) / 1000 / 60 / 5) * 5)
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function timeOfDay(iso: string) {
  return new Date(iso).toLocaleTimeString('ka-GE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('ka-GE', {
    day: '2-digit',
    month: 'short',
  })
}
