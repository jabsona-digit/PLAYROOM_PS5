-- 0041 — Fix get_venue_pnl crash (accounting P&L showed all zeros).
-- The expenses CTE aliased its per-category sum as `cat_sum`, but the outer
-- aggregate referenced a non-existent `amount` column → the whole function
-- raised "column amount does not exist" on EVERY call. The accounting UI
-- swallows the RPC error (`const { data } = await rpc(...)`), so pnl stayed
-- null and every figure rendered as ₾0.00 — hiding real session + bar revenue
-- and expenses. Fix: sum the derived `cat_sum`.
--
-- NB: this function pre-existed only in the live DB (schema drift — never had a
-- migration). This migration brings it under version control with the fix.

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
    'total_revenue',     coalesce(s.revenue, 0) + coalesce(s.tips, 0) + coalesce(b.revenue, 0) + coalesce(b.tips, 0),
    'total_expenses',    coalesce(e.total, 0),
    'net_profit',        coalesce(s.revenue, 0) + coalesce(s.tips, 0) + coalesce(b.revenue, 0) + coalesce(b.tips, 0) - coalesce(s.refunds, 0) - coalesce(e.total, 0),
    'expenses_by_category', coalesce(e.by_cat, '{}'::jsonb)
  )
  into v_result
  from
    (select
       sum(price_total)  as revenue,
       sum(tip_amount)   as tips,
       sum(coalesce(refund_amount, 0)) as refunds
     from public.sessions
     where venue_id = p_venue_id
       and started_at::date between p_from and p_to
       and status = 'completed'
    ) s
  cross join
    (select
       sum(total)      as revenue,
       sum(tip_amount) as tips
     from public.bar_sales
     where venue_id = p_venue_id
       and created_at::date between p_from and p_to
       and voided_at is null
    ) b
  cross join
    (select
       sum(cat_sum) as total,                          -- FIX: was sum(amount)
       jsonb_object_agg(category, cat_sum) as by_cat
     from (
       select category, sum(amount) as cat_sum
       from public.expenses
       where venue_id = p_venue_id
         and expense_date between p_from and p_to
       group by category
     ) cats
    ) e;

  return v_result;
end;
$function$;
