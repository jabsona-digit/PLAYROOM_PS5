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
  type: 'standard' | 'premium'
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
  ends_at: string
  ended_at?: string
  duration_min: number
  price_per_hour: number
  price_total: number
  tip_amount: number
  status: SessionStatus
  payment_method: PaymentMethod
  bank?: Bank | null
  extensions: SessionExtension[]
}

export interface ConsoleUnit {
  id: number
  slot_number: number
  name: string
  status: ConsoleStatus
  active_session?: Session
}

export interface Employee {
  id: number
  name: string
  role: EmployeeRole
  is_active: boolean
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

export type OrgRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'operator'

export interface Venue {
  id: string
  org_id: string
  name: string
  is_active: boolean
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
  description: string | null
  expense_date: string
  created_by: string | null
  created_at: string
}

export interface VenuePnl {
  session_revenue: number
  session_tips: number
  session_refunds: number
  bar_revenue: number
  bar_tips: number
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
