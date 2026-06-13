-- 0042 — Bring monthly_pnl under version control (schema drift, see 0041).
-- This view (accounting "თვეების ისტორია" trend) existed only in the live DB and
-- had no migration. It is FUNCTIONALLY CORRECT and already carries
-- security_invoker=true (so RLS on sessions/bar_sales/expenses scopes it per
-- tenant — no cross-venue leak). This is a faithful copy of the live definition
-- (`create or replace view` → identical shape, effectively a no-op) so the repo
-- becomes the source of truth.

create or replace view public.monthly_pnl with (security_invoker = true) as
with session_agg as (
  select date_trunc('month'::text, sessions.started_at) as month,
         sessions.venue_id,
         sessions.org_id,
         sum(sessions.price_total) as session_revenue,
         sum(sessions.tip_amount) as session_tips,
         sum(coalesce(sessions.refund_amount, 0::numeric)) as session_refunds
  from public.sessions
  where sessions.status::text = 'completed'::text
  group by date_trunc('month'::text, sessions.started_at), sessions.venue_id, sessions.org_id
),
bar_agg as (
  select date_trunc('month'::text, bar_sales.created_at) as month,
         bar_sales.venue_id,
         bar_sales.org_id,
         sum(bar_sales.total) as bar_revenue,
         sum(bar_sales.tip_amount) as bar_tips
  from public.bar_sales
  where bar_sales.voided_at is null
  group by date_trunc('month'::text, bar_sales.created_at), bar_sales.venue_id, bar_sales.org_id
),
expense_agg as (
  select date_trunc('month'::text, expenses.expense_date::timestamp with time zone) as month,
         expenses.venue_id,
         expenses.org_id,
         sum(expenses.amount) as total_expenses
  from public.expenses
  group by date_trunc('month'::text, expenses.expense_date::timestamp with time zone), expenses.venue_id, expenses.org_id
)
select coalesce(s.month, b.month, ex.month) as month,
       coalesce(s.venue_id, b.venue_id, ex.venue_id) as venue_id,
       coalesce(s.org_id, b.org_id, ex.org_id) as org_id,
       coalesce(s.session_revenue, 0::numeric) as session_revenue,
       coalesce(s.session_tips, 0::numeric) as session_tips,
       coalesce(s.session_refunds, 0::numeric) as session_refunds,
       coalesce(b.bar_revenue, 0::numeric) as bar_revenue,
       coalesce(b.bar_tips, 0::numeric) as bar_tips,
       coalesce(ex.total_expenses, 0::numeric) as total_expenses,
       coalesce(s.session_revenue, 0::numeric) + coalesce(s.session_tips, 0::numeric)
         + coalesce(b.bar_revenue, 0::numeric) + coalesce(b.bar_tips, 0::numeric)
         - coalesce(s.session_refunds, 0::numeric) - coalesce(ex.total_expenses, 0::numeric) as net_profit
from session_agg s
  full join bar_agg b on s.month = b.month and s.venue_id = b.venue_id
  full join expense_agg ex on coalesce(s.month, b.month) = ex.month
                          and coalesce(s.venue_id, b.venue_id) = ex.venue_id;
