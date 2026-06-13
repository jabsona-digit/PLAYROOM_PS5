-- 0040 — Platform billing control (God Mode tenant-billing).
-- Billing is MANUAL (WhatsApp/bank-transfer invoice), so the core action is the
-- platform owner recording a payment, which extends the tenant's paid period and
-- reactivates a suspended/overdue tenant. This migration adds:
--   * organizations.current_period_end  — paid-until / next-due date
--   * platform_payments                 — per-tenant payment log (platform-only)
--   * plan_monthly_price(text)          — single source of truth for plan prices
--   * mark_tenant_paid(...)             — record a payment + extend period + reactivate
--   * platform_org_overview (recreated) — + current_period_end / monthly_amount /
--                                          last_payment_at / total_paid
-- "Overdue" is a DERIVED state (current_period_end < now) — we don't auto-flip
-- subscription_status, the owner sees the red badge and acts on it.

-- ---------------------------------------------------------------------------
-- 1. Paid-until on the tenant
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists current_period_end timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Plan price — keep DB + UI in sync (Pro ₾45 / Enterprise ₾65, Trial free)
-- ---------------------------------------------------------------------------
create or replace function public.plan_monthly_price(p_plan text)
returns numeric language sql immutable as $$
  select case p_plan
    when 'pro' then 45
    when 'enterprise' then 65
    else 0
  end::numeric;
$$;
revoke all on function public.plan_monthly_price(text) from public, anon;
grant execute on function public.plan_monthly_price(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Payment log (platform-only)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_payments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  amount       numeric(12,2) not null default 0,
  months       integer not null default 1,
  plan         text,                       -- plan snapshot at time of payment
  period_start timestamptz not null,
  period_end   timestamptz not null,
  method       text not null default 'transfer'
                 check (method in ('cash', 'card', 'transfer')),
  note         text,
  recorded_by  uuid references auth.users(id),
  paid_at      timestamptz not null default now()
);
create index if not exists platform_payments_org_id_idx on public.platform_payments(org_id);

alter table public.platform_payments enable row level security;
drop policy if exists "platform_payments_all" on public.platform_payments;
create policy "platform_payments_all" on public.platform_payments for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. mark_tenant_paid — the core God-Mode action.
--    Extends from the later of (current period end, now) so paying early stacks
--    onto the remaining period, while paying late just resets from today.
-- ---------------------------------------------------------------------------
create or replace function public.mark_tenant_paid(
  p_org    uuid,
  p_months integer default 1,
  p_amount numeric default null,
  p_method text default 'transfer',
  p_note   text default null
)
returns public.platform_payments
language plpgsql security definer set search_path = public as $$
declare
  v_plan   text;
  v_start  timestamptz;
  v_end    timestamptz;
  v_amount numeric;
  v_row    public.platform_payments;
begin
  if not is_platform_admin() then
    raise exception 'unauthorized';
  end if;
  if p_months < 1 or p_months > 36 then
    raise exception 'invalid_months';
  end if;

  select plan, greatest(coalesce(current_period_end, now()), now())
    into v_plan, v_start
    from public.organizations
   where id = p_org
   for update;
  if not found then raise exception 'org_not_found'; end if;

  v_end    := v_start + make_interval(months => p_months);
  v_amount := coalesce(p_amount, public.plan_monthly_price(v_plan) * p_months);

  insert into public.platform_payments
    (org_id, amount, months, plan, period_start, period_end, method, note, recorded_by)
  values
    (p_org, v_amount, p_months, v_plan, v_start, v_end, p_method, p_note, auth.uid())
  returning * into v_row;

  -- extend the paid period + lift any suspension / trial / past_due
  update public.organizations
     set current_period_end = v_end,
         subscription_status = 'active'
   where id = p_org;

  return v_row;
end;
$$;
revoke all on function public.mark_tenant_paid(uuid, integer, numeric, text, text) from public, anon;
grant execute on function public.mark_tenant_paid(uuid, integer, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Recreate the God-Mode overview view with billing columns.
--    security_invoker => platform_admin sees all orgs (passes RLS everywhere);
--    a normal member sees only their own row (harmless).
-- ---------------------------------------------------------------------------
drop view if exists public.platform_org_overview;
create view public.platform_org_overview with (security_invoker = true) as
select
  o.id,
  o.name,
  o.plan,
  o.subscription_status,
  o.trial_ends_at,
  o.current_period_end,
  public.plan_monthly_price(o.plan)                                as monthly_amount,
  o.created_at,
  (select count(*) from public.org_members m where m.org_id = o.id) as member_count,
  (select count(*) from public.venues v where v.org_id = o.id)      as venue_count,
  coalesce((select sum(s.price_total) from public.sessions s
              where s.org_id = o.id and s.status = 'completed'), 0)
  + coalesce((select sum(b.total) from public.bar_sales b where b.org_id = o.id), 0)
                                                                   as total_revenue,
  (select max(p.paid_at) from public.platform_payments p where p.org_id = o.id) as last_payment_at,
  coalesce((select sum(p.amount) from public.platform_payments p where p.org_id = o.id), 0)
                                                                   as total_paid
from public.organizations o
order by o.created_at desc;

grant select on public.platform_org_overview to authenticated;
