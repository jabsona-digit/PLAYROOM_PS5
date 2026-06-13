-- 0013_expenses_pnl
-- BACKFILLED from the live DB on 2026-06-13 (schema_migrations.statements,
-- original applied version 20260606183112). This migration ran in prod but its
-- file was never committed — restored verbatim so the repo can rebuild the
-- schema from scratch in dependency order. Do NOT re-apply to prod (already
-- applied). See memory accounting-schema-drift.


-- ============================================================
-- 0013: Expenses + P&L
-- expenses table, add_expense() / delete_expense() RPCs,
-- get_venue_pnl() RPC → jsonb, monthly_pnl view (security_invoker)
-- ============================================================

-- 1. expenses table
create table public.expenses (
  id           uuid        primary key default gen_random_uuid(),
  org_id       uuid        not null references public.organizations(id) on delete cascade,
  venue_id     uuid        references public.venues(id) on delete set null,
  category     text        not null,
  amount       numeric     not null check (amount > 0),
  description  text,
  expense_date date        not null default current_date,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  constraint expenses_category_check check (
    category in ('rent','salary','utilities','supplies','marketing','maintenance','other')
  )
);

create index expenses_org_id_idx        on public.expenses (org_id);
create index expenses_venue_date_idx    on public.expenses (venue_id, expense_date desc);

-- 2. RLS
alter table public.expenses enable row level security;

create policy "org member reads expenses"
  on public.expenses for select to authenticated
  using (is_org_member(org_id));

-- inserts only through SECURITY DEFINER RPCs
create policy "platform admin reads all expenses"
  on public.expenses for select to authenticated
  using (is_platform_admin());

-- 3. add_expense()
create or replace function public.add_expense(
  p_venue_id     uuid,
  p_category     text,
  p_amount       numeric,
  p_description  text    default null,
  p_expense_date date    default current_date
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id     uuid;
  v_expense_id uuid;
begin
  select org_id into v_org_id
  from   public.venues where id = p_venue_id;

  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  if not is_platform_admin() then
    if not exists (
      select 1 from public.org_members
      where org_id  = v_org_id
        and user_id = auth.uid()
        and role in ('owner','admin','manager')
    ) then raise exception 'insufficient_privilege'; end if;
  end if;

  if p_category not in ('rent','salary','utilities','supplies','marketing','maintenance','other') then
    raise exception 'invalid_category';
  end if;

  insert into public.expenses (org_id, venue_id, category, amount, description, expense_date, created_by)
  values (v_org_id, p_venue_id, p_category, p_amount, p_description, p_expense_date, auth.uid())
  returning id into v_expense_id;

  perform public.log_audit(
    v_org_id, p_venue_id,
    'expense.add', 'expense', v_expense_id::text,
    jsonb_build_object('category', p_category, 'amount', p_amount, 'date', p_expense_date)
  );

  return v_expense_id;
end;
$$;

grant execute on function public.add_expense(uuid, text, numeric, text, date) to authenticated;

-- 4. delete_expense()
create or replace function public.delete_expense(
  p_expense_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id   uuid;
  v_venue_id uuid;
  v_amount   numeric;
  v_category text;
begin
  select org_id, venue_id, amount, category
  into   v_org_id, v_venue_id, v_amount, v_category
  from   public.expenses where id = p_expense_id;

  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  if not is_platform_admin() then
    if not exists (
      select 1 from public.org_members
      where org_id  = v_org_id
        and user_id = auth.uid()
        and role in ('owner','admin','manager')
    ) then raise exception 'insufficient_privilege'; end if;
  end if;

  delete from public.expenses where id = p_expense_id;

  perform public.log_audit(
    v_org_id, v_venue_id,
    'expense.delete', 'expense', p_expense_id::text,
    jsonb_build_object('category', v_category, 'amount', v_amount)
  );
end;
$$;

grant execute on function public.delete_expense(uuid) to authenticated;

-- 5. get_venue_pnl(venue_id, from, to) → jsonb
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
    'session_revenue',       coalesce(s.session_revenue, 0),
    'session_refunds',       coalesce(s.session_refunds, 0),
    'bar_revenue',           coalesce(b.bar_revenue, 0),
    'total_revenue',         coalesce(s.session_revenue, 0)
                             - coalesce(s.session_refunds, 0)
                             + coalesce(b.bar_revenue, 0),
    'total_expenses',        coalesce(e.total_expenses, 0),
    'net_profit',            coalesce(s.session_revenue, 0)
                             - coalesce(s.session_refunds, 0)
                             + coalesce(b.bar_revenue, 0)
                             - coalesce(e.total_expenses, 0),
    'expenses_by_category',  coalesce(e.by_category, '{}'::jsonb)
  )
  into v_result
  from
    -- session revenue & refunds
    (select
       coalesce(sum(price_total) filter (where status = 'completed'), 0)  as session_revenue,
       coalesce(sum(refund_amount) filter (where refunded_at is not null), 0) as session_refunds
     from public.sessions
     where venue_id = p_venue_id
       and started_at >= p_from::timestamptz
       and started_at <  (p_to  + interval '1 day')
    ) s,
    -- bar revenue (voided excluded)
    (select coalesce(sum(total), 0) as bar_revenue
     from public.bar_sales
     where venue_id  = p_venue_id
       and voided_at is null
       and created_at >= p_from::timestamptz
       and created_at <  (p_to  + interval '1 day')
    ) b,
    -- expenses
    (select
       coalesce(sum(amount), 0)                                    as total_expenses,
       coalesce(
         jsonb_object_agg(category, cat_total order by category),
         '{}'::jsonb
       )                                                           as by_category
     from (
       select category, sum(amount) as cat_total
       from public.expenses
       where venue_id     = p_venue_id
         and expense_date >= p_from
         and expense_date <= p_to
       group by category
     ) cats
    ) e;

  return v_result;
end;
$$;

grant execute on function public.get_venue_pnl(uuid, date, date) to authenticated;

-- 6. monthly_pnl view (security_invoker — RLS on underlying tables applies automatically)
create or replace view public.monthly_pnl
  with (security_invoker = true)
as
with session_agg as (
  select
    venue_id, org_id,
    date_trunc('month', started_at)::date          as month,
    coalesce(sum(price_total) filter (where status = 'completed'), 0)           as session_revenue,
    coalesce(sum(refund_amount) filter (where refunded_at is not null), 0)      as session_refunds
  from public.sessions
  group by venue_id, org_id, date_trunc('month', started_at)::date
),
bar_agg as (
  select
    venue_id, org_id,
    date_trunc('month', created_at)::date as month,
    coalesce(sum(total), 0)               as bar_revenue
  from public.bar_sales
  where voided_at is null
  group by venue_id, org_id, date_trunc('month', created_at)::date
),
expense_agg as (
  select
    venue_id, org_id,
    date_trunc('month', expense_date::timestamptz)::date as month,
    coalesce(sum(amount), 0)                              as total_expenses
  from public.expenses
  group by venue_id, org_id, date_trunc('month', expense_date::timestamptz)::date
)
select
  coalesce(s.month,    b.month,    e.month)    as month,
  coalesce(s.venue_id, b.venue_id, e.venue_id) as venue_id,
  coalesce(s.org_id,   b.org_id,   e.org_id)   as org_id,
  coalesce(s.session_revenue, 0)               as session_revenue,
  coalesce(s.session_refunds, 0)               as session_refunds,
  coalesce(b.bar_revenue, 0)                   as bar_revenue,
  coalesce(e.total_expenses, 0)                as total_expenses,
  coalesce(s.session_revenue, 0)
    - coalesce(s.session_refunds, 0)
    + coalesce(b.bar_revenue, 0)
    - coalesce(e.total_expenses, 0)            as net_profit
from      session_agg  s
full join bar_agg      b on s.venue_id = b.venue_id and s.month = b.month
full join expense_agg  e
  on coalesce(s.venue_id, b.venue_id) = e.venue_id
 and coalesce(s.month,    b.month)    = e.month;
