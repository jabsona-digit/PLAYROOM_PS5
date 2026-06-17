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

// ── Venue-type / asset labels (multi-venue-type, migrations 0071/0072) ──────
// One source of truth for the words + icon + analytics metric per segment, so a
// billiard venue reads "მაგიდა / RevPATH / 🎱" instead of "კონსოლი / RevPACH / 🎮".
// Georgian declension: we keep singular + genitive (for "X-ის დამატება") + plural.
export type VenueType = 'playroom' | 'billiard' | 'karaoke' | 'vr' | 'mixed'

export const ASSET_LABELS: Record<VenueType, {
  singular: string; genitive: string; plural: string; metric: string; icon: string
}> = {
  playroom: { singular: 'კონსოლი', genitive: 'კონსოლის', plural: 'კონსოლები', metric: 'RevPACH', icon: '🎮' },
  billiard: { singular: 'მაგიდა',  genitive: 'მაგიდის',  plural: 'მაგიდები',  metric: 'RevPATH', icon: '🎱' },
  karaoke:  { singular: 'ოთახი',   genitive: 'ოთახის',   plural: 'ოთახები',   metric: 'RevPARH', icon: '🎤' },
  vr:       { singular: 'სადგური', genitive: 'სადგურის', plural: 'სადგურები', metric: 'RevPASH', icon: '🥽' },
  mixed:    { singular: 'ერთეული', genitive: 'ერთეულის', plural: 'ერთეულები', metric: 'RevPACH', icon: '🎯' },
}

/** Venue-level labels (header, add-button, analytics metric) from venues.venue_type. */
export const venueLabels = (venueType?: string | null) =>
  ASSET_LABELS[(venueType as VenueType)] ?? ASSET_LABELS.playroom

// Free-text console_type → its segment. PS5 variants are playroom; tables billiard.
const CONSOLE_CATEGORY: Record<string, VenueType> = {
  standard: 'playroom', coupe: 'playroom', vip: 'playroom',
  billiard: 'billiard', snooker: 'billiard',
}
export const consoleCategory = (consoleType?: string | null): VenueType =>
  CONSOLE_CATEGORY[consoleType ?? ''] ?? 'playroom'

// Does a tariff apply to a console? The tariff's asset class must match (or be null)
// AND its sub-type (console_type) must match (or be null = all sub-types in that class).
// So a VIP console shows VIP tariffs, a PS5 console shows PS5 tariffs — both playroom.
export const planAppliesToConsole = (
  plan: { category?: string | null; console_type?: string | null },
  consoleType?: string | null,
): boolean =>
  (plan.category == null || plan.category === consoleCategory(consoleType)) &&
  (plan.console_type == null || plan.console_type === (consoleType ?? 'standard'))

/** Per-asset labels (dashboard card icon + word) from consoles.console_type — so a
    mixed venue shows 🎮 კონსოლი and 🎱 მაგიდა side by side. */
export const consoleLabels = (consoleType?: string | null) =>
  ASSET_LABELS[consoleCategory(consoleType)]

// Exact console_type → display label (PS5 variants + billiard) for chips/badges.
export const CONSOLE_TYPE_LABEL: Record<string, string> = {
  standard: 'PS5', coupe: 'კუპე', vip: 'VIP', billiard: 'ბილიარდი', snooker: 'სნუკერი',
}
export const consoleTypeLabel = (consoleType?: string | null) =>
  CONSOLE_TYPE_LABEL[consoleType ?? ''] ?? (consoleType || 'PS5')

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
