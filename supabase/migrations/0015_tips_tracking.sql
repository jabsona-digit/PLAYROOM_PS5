-- 0015_tips_tracking
-- BACKFILLED from the live DB on 2026-06-13 (schema_migrations.statements,
-- original applied version 20260606185321). This migration ran in prod but its
-- file was never committed — restored verbatim so the repo can rebuild the
-- schema from scratch in dependency order. Do NOT re-apply to prod (already
-- applied). See memory accounting-schema-drift.


-- ============================================================
-- 0015: Tips Tracking
-- Add tip_amount to sessions and bar_sales.
-- Tips are voluntary — default 0, never negative.
-- Included in cashier revenue totals and P&L.
-- ============================================================

alter table public.sessions
  add column tip_amount numeric not null default 0 check (tip_amount >= 0);

alter table public.bar_sales
  add column tip_amount numeric not null default 0 check (tip_amount >= 0);

-- ============================================================
-- Update end_session() to accept an optional tip
-- Replaces existing function (same signature + new p_tip param)
-- ============================================================
create or replace function public.end_session(
  p_session_id uuid,
  p_tip        numeric default 0
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id   uuid;
  v_venue_id uuid;
begin
  select org_id, venue_id into v_org_id, v_venue_id
  from public.sessions where id = p_session_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  if p_tip < 0 then raise exception 'invalid_tip'; end if;

  update public.sessions
  set
    status    = 'completed',
    ended_at  = now(),
    tip_amount = coalesce(p_tip, 0)
  where id = p_session_id
    and status = 'active';

  if not found then raise exception 'not_active'; end if;

  update public.consoles
  set status = 'free'
  where id = (select console_id from public.sessions where id = p_session_id);
end;
$$;

grant execute on function public.end_session(uuid, numeric) to authenticated;

-- ============================================================
-- Update create_bar_sale() to accept an optional tip
-- ============================================================
create or replace function public.create_bar_sale(
  p_venue_id       uuid,
  p_payment_method text,
  p_items          json,
  p_bank           text    default null,
  p_session_id     uuid    default null,
  p_customer_name  text    default null,
  p_created_by     integer default null,
  p_tip            numeric default 0
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id  uuid;
  v_sale_id uuid;
  v_total   numeric := 0;
  v_item    json;
  v_product record;
  v_line    numeric;
begin
  select org_id into v_org_id from public.venues where id = p_venue_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  if p_tip < 0 then raise exception 'invalid_tip'; end if;

  -- insert sale header (total filled after items)
  insert into public.bar_sales
    (org_id, venue_id, payment_method, bank, session_id, tip_amount, total)
  values
    (v_org_id, p_venue_id, p_payment_method, p_bank, p_session_id, coalesce(p_tip, 0), 0)
  returning id into v_sale_id;

  -- process line items
  for v_item in select * from json_array_elements(p_items) loop
    select id, price, cost_price, name, stock_quantity
    into v_product
    from public.bar_products
    where id = (v_item->>'product_id')::integer
      and org_id = v_org_id;

    if not found then raise exception 'product_not_found'; end if;
    if v_product.stock_quantity < (v_item->>'qty')::integer then
      raise exception 'insufficient_stock';
    end if;

    v_line := v_product.price * (v_item->>'qty')::integer;
    v_total := v_total + v_line;

    insert into public.bar_sale_items
      (sale_id, product_id, name, qty, unit_price, unit_cost_price, line_total)
    values
      (v_sale_id, v_product.id, v_product.name,
       (v_item->>'qty')::integer, v_product.price, v_product.cost_price, v_line);

    update public.bar_products
    set stock_quantity = stock_quantity - (v_item->>'qty')::integer
    where id = v_product.id;
  end loop;

  -- update total
  update public.bar_sales set total = v_total where id = v_sale_id;

  perform public.log_audit(
    v_org_id, p_venue_id,
    'bar_sale.create', 'bar_sale', v_sale_id::text,
    jsonb_build_object('total', v_total, 'tip', p_tip, 'method', p_payment_method)
  );

  return v_sale_id;
end;
$$;

grant execute on function public.create_bar_sale(uuid, text, json, text, uuid, text, integer, numeric) to authenticated;

-- ============================================================
-- Update get_venue_pnl() to include tips in revenue
-- ============================================================
create or replace function public.get_venue_pnl(
  p_venue_id uuid,
  p_from     date,
  p_to       date
) returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
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
       sum(amount) as total,
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
$$;

grant execute on function public.get_venue_pnl(uuid, date, date) to authenticated;

-- ============================================================
-- Refresh monthly_pnl view to include tips
-- ============================================================
drop view if exists public.monthly_pnl;

create view public.monthly_pnl
  with (security_invoker = true)
as
with session_agg as (
  select
    date_trunc('month', started_at) as month,
    venue_id,
    org_id,
    sum(price_total)                                 as session_revenue,
    sum(tip_amount)                                  as session_tips,
    sum(coalesce(refund_amount, 0))                  as session_refunds
  from public.sessions
  where status = 'completed'
  group by 1, 2, 3
),
bar_agg as (
  select
    date_trunc('month', created_at) as month,
    venue_id,
    org_id,
    sum(total)      as bar_revenue,
    sum(tip_amount) as bar_tips
  from public.bar_sales
  where voided_at is null
  group by 1, 2, 3
),
expense_agg as (
  select
    date_trunc('month', expense_date::timestamptz) as month,
    venue_id,
    org_id,
    sum(amount) as total_expenses
  from public.expenses
  group by 1, 2, 3
)
select
  coalesce(s.month,   b.month,   ex.month)     as month,
  coalesce(s.venue_id, b.venue_id, ex.venue_id) as venue_id,
  coalesce(s.org_id,  b.org_id,  ex.org_id)    as org_id,
  coalesce(s.session_revenue, 0)                as session_revenue,
  coalesce(s.session_tips, 0)                   as session_tips,
  coalesce(s.session_refunds, 0)                as session_refunds,
  coalesce(b.bar_revenue, 0)                    as bar_revenue,
  coalesce(b.bar_tips, 0)                       as bar_tips,
  coalesce(ex.total_expenses, 0)                as total_expenses,
  (
    coalesce(s.session_revenue, 0) + coalesce(s.session_tips, 0) +
    coalesce(b.bar_revenue, 0)     + coalesce(b.bar_tips, 0) -
    coalesce(s.session_refunds, 0) - coalesce(ex.total_expenses, 0)
  )                                             as net_profit
from session_agg s
full outer join bar_agg  b  on  s.month = b.month and s.venue_id = b.venue_id
full outer join expense_agg ex on coalesce(s.month, b.month) = ex.month
                               and coalesce(s.venue_id, b.venue_id) = ex.venue_id;
