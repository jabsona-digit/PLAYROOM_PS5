-- 0056 — Bar cost of goods sold (COGS) in the P&L (accrual basis, option B).
-- Inventory is an asset until sold; when a bar item sells, its cost
-- (bar_sale_items.unit_cost_price × qty) becomes COGS — an expense matched to the
-- sale. get_venue_pnl/monthly_pnl previously counted full bar revenue with NO cost,
-- overstating profit. Now they subtract bar_cogs (data already captured per sale).
-- NB: do NOT also record bar stock purchases as 'supplies' expenses — that would
-- double-count. The supplies category stays for non-inventory supplies.

create or replace function public.get_venue_pnl(p_venue_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_result jsonb;
begin
  select org_id into v_org_id from public.venues where id = p_venue_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  select jsonb_build_object(
    'session_revenue',   coalesce(s.revenue, 0),
    'session_tips',      coalesce(s.tips, 0),
    'session_refunds',   coalesce(s.refunds, 0),
    'bar_revenue',       coalesce(b.revenue, 0),
    'bar_tips',          coalesce(b.tips, 0),
    'bar_cogs',          coalesce(c.cogs, 0),
    'total_revenue',     coalesce(s.revenue, 0) + coalesce(b.revenue, 0),
    'total_expenses',    coalesce(e.total, 0),
    'net_profit',        coalesce(s.revenue, 0) + coalesce(b.revenue, 0)
                         - coalesce(s.refunds, 0) - coalesce(e.total, 0) - coalesce(c.cogs, 0),
    'expenses_by_category', coalesce(e.by_cat, '{}'::jsonb)
  )
  into v_result
  from
    (select sum(price_total) as revenue, sum(tip_amount) as tips,
            sum(coalesce(refund_amount, 0)) as refunds
     from public.sessions
     where venue_id = p_venue_id and started_at::date between p_from and p_to
       and status = 'completed') s
  cross join
    (select sum(total) as revenue, sum(tip_amount) as tips
     from public.bar_sales
     where venue_id = p_venue_id and created_at::date between p_from and p_to
       and voided_at is null) b
  cross join
    (select coalesce(sum(bi.unit_cost_price * bi.qty), 0) as cogs
     from public.bar_sale_items bi
     join public.bar_sales bs on bs.id = bi.sale_id
     where bs.venue_id = p_venue_id and bs.voided_at is null
       and bs.created_at::date between p_from and p_to) c
  cross join
    (select sum(cat_sum) as total, jsonb_object_agg(category, cat_sum) as by_cat
     from (
       select category, sum(amount) as cat_sum
       from public.expenses
       where venue_id = p_venue_id and expense_date between p_from and p_to
       group by category
     ) cats) e;

  return v_result;
end;
$function$;

-- monthly_pnl — add bar_cogs (appended column) + subtract it from net_profit
create or replace view public.monthly_pnl with (security_invoker = true) as
with session_agg as (
  select date_trunc('month'::text, sessions.started_at) as month,
         sessions.venue_id, sessions.org_id,
         sum(sessions.price_total) as session_revenue,
         sum(sessions.tip_amount) as session_tips,
         sum(coalesce(sessions.refund_amount, 0::numeric)) as session_refunds
  from public.sessions
  where sessions.status::text = 'completed'::text
  group by date_trunc('month'::text, sessions.started_at), sessions.venue_id, sessions.org_id
),
bar_agg as (
  select date_trunc('month'::text, bar_sales.created_at) as month,
         bar_sales.venue_id, bar_sales.org_id,
         sum(bar_sales.total) as bar_revenue,
         sum(bar_sales.tip_amount) as bar_tips
  from public.bar_sales
  where bar_sales.voided_at is null
  group by date_trunc('month'::text, bar_sales.created_at), bar_sales.venue_id, bar_sales.org_id
),
cogs_agg as (
  select date_trunc('month'::text, b.created_at) as month, b.venue_id, b.org_id,
         sum(bi.unit_cost_price * bi.qty) as bar_cogs
  from public.bar_sales b
  join public.bar_sale_items bi on bi.sale_id = b.id
  where b.voided_at is null
  group by date_trunc('month'::text, b.created_at), b.venue_id, b.org_id
),
expense_agg as (
  select date_trunc('month'::text, expenses.expense_date::timestamp with time zone) as month,
         expenses.venue_id, expenses.org_id,
         sum(expenses.amount) as total_expenses
  from public.expenses
  group by date_trunc('month'::text, expenses.expense_date::timestamp with time zone), expenses.venue_id, expenses.org_id
)
select coalesce(s.month, b.month, ex.month, cg.month) as month,
       coalesce(s.venue_id, b.venue_id, ex.venue_id, cg.venue_id) as venue_id,
       coalesce(s.org_id, b.org_id, ex.org_id, cg.org_id) as org_id,
       coalesce(s.session_revenue, 0::numeric) as session_revenue,
       coalesce(s.session_tips, 0::numeric) as session_tips,
       coalesce(s.session_refunds, 0::numeric) as session_refunds,
       coalesce(b.bar_revenue, 0::numeric) as bar_revenue,
       coalesce(b.bar_tips, 0::numeric) as bar_tips,
       coalesce(ex.total_expenses, 0::numeric) as total_expenses,
       coalesce(s.session_revenue, 0::numeric) + coalesce(b.bar_revenue, 0::numeric)
         - coalesce(s.session_refunds, 0::numeric) - coalesce(ex.total_expenses, 0::numeric)
         - coalesce(cg.bar_cogs, 0::numeric) as net_profit,
       coalesce(cg.bar_cogs, 0::numeric) as bar_cogs
from session_agg s
  full join bar_agg b on s.month = b.month and s.venue_id = b.venue_id
  full join expense_agg ex on coalesce(s.month, b.month) = ex.month
                          and coalesce(s.venue_id, b.venue_id) = ex.venue_id
  full join cogs_agg cg on coalesce(s.month, b.month, ex.month) = cg.month
                       and coalesce(s.venue_id, b.venue_id, ex.venue_id) = cg.venue_id;
