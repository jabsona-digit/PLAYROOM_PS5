-- 0027: monthly budgets + budget-vs-actual view.

create table if not exists public.venue_budgets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  venue_id       uuid not null references public.venues(id) on delete cascade,
  month          date not null,            -- first day of the month, e.g. 2026-06-01
  revenue_target numeric(10,2),
  expense_budget numeric(10,2),
  note           text,
  created_at     timestamptz not null default now(),
  unique (venue_id, month)
);

alter table public.venue_budgets enable row level security;
create policy "budget_select" on public.venue_budgets for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());
create policy "budget_write" on public.venue_budgets for all to authenticated
  using (is_org_admin(org_id) or is_platform_admin())
  with check (is_org_admin(org_id) or is_platform_admin());

-- budget vs actual (security_invoker → caller RLS applies). Actual revenue =
-- completed sessions + non-voided bar sales; actual expenses = expenses.
create or replace view public.budget_vs_actual with (security_invoker = true) as
select
  b.org_id,
  b.venue_id,
  b.month,
  b.revenue_target,
  b.expense_budget,
  coalesce(r.rev, 0) as actual_revenue,
  coalesce(e.exp, 0) as actual_expenses,
  coalesce(r.rev, 0) - coalesce(e.exp, 0) as actual_profit,
  case when b.revenue_target > 0
    then round(coalesce(r.rev, 0) / b.revenue_target * 100, 1) end as revenue_pct,
  case when b.expense_budget > 0
    then round(coalesce(e.exp, 0) / b.expense_budget * 100, 1) end as expense_pct
from public.venue_budgets b
left join (
  select venue_id, month, sum(rev) as rev
  from (
    select venue_id, date_trunc('month', started_at)::date as month, price_total as rev
      from public.sessions where status = 'completed'
    union all
    select venue_id, date_trunc('month', created_at)::date as month, total
      from public.bar_sales where voided_at is null
  ) x
  group by venue_id, month
) r on r.venue_id = b.venue_id and r.month = b.month
left join (
  select venue_id, date_trunc('month', expense_date)::date as month, sum(amount) as exp
  from public.expenses group by venue_id, date_trunc('month', expense_date)::date
) e on e.venue_id = b.venue_id and e.month = b.month;
