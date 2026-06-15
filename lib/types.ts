export type ConsoleStatus =
  | 'free'
  | 'active'
  | 'warning_10'
  | 'warning_5'
  | 'expired'
export type SessionStatus = 'active' | 'completed' | 'cancelled'
export type EmployeeRole = 'admin' | 'operator'
export type ModuleKey =
  | 'dashboard'
  | 'pos'
  | 'cashier'
  | 'history'
  | 'pricing'
  | 'inventory'
  | 'customers'
  | 'employees'
  | 'settings'
  | 'platform'
  | 'billing'
  | 'accounting'
  | 'reservations'
  | 'online_bookings'
  | 'tournaments'
  | 'guide'
  | 'analytics'

export interface AppSettings {
  venue_name: string
  currency: string
  warn_10_min: number
  warn_5_min: number
  auto_end_on_expire: boolean
  sound_alerts: boolean
}

export interface PricingPlan {
  id: number
  name: string
  type: 'standard' | 'pro' | 'premium' | 'custom'
  controllers: number
  price_per_hour: number
  is_active: boolean
  updated_at: string
}

export interface SessionExtension {
  id: string
  session_id: string
  extra_minutes: number
  extra_price: number
  created_at: string
}

export type PaymentMethod = 'cash' | 'card' | 'transfer'
export type Bank = 'TBC' | 'BOG'

export interface Session {
  id: string
  console_id: number
  pricing_plan_id: number
  customer_name?: string
  started_at: string
  ends_at: string | null
  ended_at?: string
  duration_min: number | null
  price_per_hour: number
  price_total: number
  tip_amount: number
  status: SessionStatus
  payment_method: PaymentMethod
  bank?: Bank | null
  is_open: boolean
  created_by_user?: string | null // auth user (operator) who created the session
  portal_code?: string | null // per-session In-Seat access code (PIN + QR), rotates each session
  extensions: SessionExtension[]
}

export interface ConsoleHardware {
  control_mode: 'manual' | 'cloud' | 'agent'
  driver: string
  target: 'tv' | 'console' | 'hdmi' | 'network'
  is_active: boolean
  desired_state: 'on' | 'off' | null
  last_known_state: 'on' | 'off' | 'unknown'
  last_seen_at: string | null
  config: Record<string, unknown>
}

export interface ConsoleUnit {
  id: number
  slot_number: number
  name: string
  status: ConsoleStatus
  active_session?: Session
  hardware?: ConsoleHardware
}

export interface Employee {
  id: number
  name: string
  role: OrgRole
  is_active: boolean
  salary_type: 'hourly' | 'monthly' | 'fixed'
  salary_amount: number
  user_id?: string | null // linked login (org_members) — for shift/attribution mapping
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner:      'მფლობელი',
  admin:      'ადმინი',
  manager:    'მენეჯერი',
  accountant: 'ბუღალტერი',
  cashier:    'მოლარე',
  operator:   'ოპერატორი',
}

export interface Shift {
  id: string
  employee_id: number
  employee_name: string
  clock_in: string
  clock_out?: string
  hours_worked?: number
  work_date: string
}

export type OrgRole = 'owner' | 'admin' | 'manager' | 'accountant' | 'cashier' | 'operator'

export interface Venue {
  id: string
  org_id: string
  name: string
  is_active: boolean
  is_vat_registered: boolean
}

export interface OrgMembership {
  org_id: string
  name: string
  plan: string
  role: OrgRole
}

export type AuditAction =
  | 'session.start' | 'session.end' | 'session.extend' | 'session.refund'
  | 'bar_sale.create' | 'bar_sale.void'
  | 'employee.clock_in' | 'employee.clock_out'
  | 'fiscal.enable' | 'fiscal.disable'
  | 'venue.rename'
  | 'expense.add' | 'expense.delete'
  | 'reservation.create' | 'reservation.confirm' | 'reservation.cancel'
  | 'console.delete' | 'customer.delete'

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'

export interface Reservation {
  id: string
  org_id: string
  venue_id: string
  console_id: number | null
  customer_name: string
  customer_phone: string | null
  start_time: string
  duration_min: number
  notes: string | null
  status: ReservationStatus
  session_id: string | null
  created_at: string
}

export type ExpenseCategory =
  | 'rent' | 'salary' | 'utilities' | 'supplies'
  | 'marketing' | 'maintenance' | 'other'

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent:        'ქირა',
  salary:      'ხელფასი',
  utilities:   'კომუნალური',
  supplies:    'მარაგები',
  marketing:   'მარკეტინგი',
  maintenance: 'ტექმომსახურება',
  other:       'სხვა',
}

export interface Expense {
  id: string
  org_id: string
  venue_id: string | null
  category: ExpenseCategory
  amount: number
  vat_amount: number | null
  description: string | null
  expense_date: string
  created_by: string | null
  created_at: string
}

export interface VatSummary {
  is_vat_registered: boolean
  gross_sales: number
  output_vat: number
  input_vat: number
  net_vat_payable: number
}

export interface ReconciliationResult {
  ok: boolean
  expected: number
  actual: number
  discrepancy: number
  alert: boolean
}

export interface Invoice {
  id: string
  org_id: string
  venue_id: string
  invoice_number: string
  client_name: string
  client_tin: string | null
  subtotal: number
  vat_total: number
  total_amount: number
  status: 'draft' | 'issued' | 'paid' | 'cancelled'
  issued_at: string
  created_at: string
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  description: string
  qty: number
  unit_price: number
  line_total: number
}

export interface VenueBudget {
  id: string
  venue_id: string
  month: string // yyyy-mm
  revenue_target: number
  expense_budget: number
}

export interface BudgetVsActual {
  venue_id: string
  month: string
  revenue_target: number | null
  actual_revenue: number
  revenue_pct: number | null
  expense_budget: number | null
  actual_expense: number
  expense_pct: number | null
}

export interface VenuePnl {
  session_revenue: number
  session_tips: number
  session_refunds: number
  bar_revenue: number
  bar_tips: number
  bar_cogs: number
  total_revenue: number
  total_expenses: number
  net_profit: number
  expenses_by_category: Partial<Record<ExpenseCategory, number>>
}

export interface MonthlyPnl {
  month: string
  venue_id: string
  org_id: string
  session_revenue: number
  session_tips: number
  session_refunds: number
  bar_revenue: number
  bar_tips: number
  total_expenses: number
  net_profit: number
  bar_cogs: number
}

export interface AuditLog {
  id: number
  org_id: string | null
  venue_id: string | null
  actor_id: string | null
  actor_email: string | null
  action: AuditAction | string
  entity_type: string
  entity_id: string
  payload: Record<string, unknown> | null
  created_at: string
}

export type ToastType = 'info' | 'success' | 'warning' | 'danger' | 'expired'

export interface Toast {
  id: string
  type: ToastType
  message: string
}
