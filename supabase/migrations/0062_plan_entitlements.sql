-- 0062 Plan entitlements — enforce subscription tier (trial / pro / enterprise).
--
-- Until now `organizations.plan` was cosmetic (billing display only); every tenant
-- saw every feature regardless of plan. This adds REAL enforcement via BEFORE
-- triggers on the underlying tables (so all code paths are covered, RPC or direct
-- insert) plus quantitative limits. Platform admins (God Mode) bypass everything.
-- Existing rows are grandfathered — triggers only fire on new INSERT/UPDATE, so
-- nobody loses data; an over-limit tenant just can't add MORE until they upgrade.
--
-- Feature map (mirrors billing.tsx / the in-app pricing card):
--   PRO+        : Bar/POS (bar_sales), Inventory (bar_products/categories),
--                 Customers, Accounting (expenses)
--   ENTERPRISE  : RS.GE fiscal (venues.fiscal_enabled)
-- Limits: venues trial 1 / pro 3 / ent ∞ ; consoles/venue trial 4 / pro 8 / ent ∞ ;
--         PIN employees trial 3 / pro+ ∞.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.org_plan(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select plan from public.organizations where id = p_org), 'trial')
$$;

create or replace function public.plan_rank(p text)
returns int language sql immutable as $$
  select case lower(coalesce(p, 'trial'))
           when 'enterprise' then 2
           when 'pro'        then 1
           else 0
         end
$$;

-- Raise unless the org's plan meets the minimum tier. Platform admins bypass.
create or replace function public.require_plan(p_org uuid, p_min text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_platform_admin() then return; end if;
  if public.plan_rank(public.org_plan(p_org)) < public.plan_rank(p_min) then
    raise exception 'plan_upgrade_required:%', p_min using errcode = 'P0001';
  end if;
end
$$;

-- Quantitative caps per plan (2147483647 = effectively unlimited).
create or replace function public.plan_limit(p_plan text, p_kind text)
returns int language sql immutable as $$
  select case p_kind
    when 'venues'    then case lower(coalesce(p_plan,'trial')) when 'enterprise' then 2147483647 when 'pro' then 3 else 1 end
    when 'consoles'  then case lower(coalesce(p_plan,'trial')) when 'enterprise' then 2147483647 when 'pro' then 8 else 4 end
    when 'employees' then case lower(coalesce(p_plan,'trial')) when 'enterprise' then 2147483647 when 'pro' then 2147483647 else 3 end
    else 2147483647 end
$$;

-- ---------------------------------------------------------------------------
-- 2. Feature gates (BEFORE INSERT/UPDATE triggers)
-- ---------------------------------------------------------------------------

-- Bar/POS, Inventory, Customers, Accounting → PRO+
create or replace function public.gate_pro_feature()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.require_plan(new.org_id, 'pro');
  return new;
end
$$;

drop trigger if exists trg_plan_bar_sale     on public.bar_sales;
drop trigger if exists trg_plan_bar_product  on public.bar_products;
drop trigger if exists trg_plan_bar_category on public.bar_categories;
drop trigger if exists trg_plan_customer     on public.customers;
drop trigger if exists trg_plan_expense      on public.expenses;
create trigger trg_plan_bar_sale     before insert on public.bar_sales     for each row execute function public.gate_pro_feature();
create trigger trg_plan_bar_product  before insert on public.bar_products  for each row execute function public.gate_pro_feature();
create trigger trg_plan_bar_category before insert on public.bar_categories for each row execute function public.gate_pro_feature();
create trigger trg_plan_customer     before insert on public.customers     for each row execute function public.gate_pro_feature();
create trigger trg_plan_expense      before insert on public.expenses      for each row execute function public.gate_pro_feature();

-- RS.GE fiscal → ENTERPRISE (only when turning it ON)
create or replace function public.gate_enterprise_fiscal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fiscal_enabled and (tg_op = 'INSERT' or old.fiscal_enabled is distinct from new.fiscal_enabled) then
    perform public.require_plan(new.org_id, 'enterprise');
  end if;
  return new;
end
$$;

drop trigger if exists trg_plan_fiscal on public.venues;
create trigger trg_plan_fiscal before insert or update on public.venues
  for each row execute function public.gate_enterprise_fiscal();

-- ---------------------------------------------------------------------------
-- 3. Quantitative limits
-- ---------------------------------------------------------------------------
create or replace function public.enforce_venue_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cnt int; v_cap int;
begin
  if public.is_platform_admin() then return new; end if;
  v_cap := public.plan_limit(public.org_plan(new.org_id), 'venues');
  select count(*) into v_cnt from public.venues where org_id = new.org_id;
  if v_cnt >= v_cap then
    raise exception 'plan_limit_reached:venues:%', v_cap using errcode = 'P0001';
  end if;
  return new;
end
$$;

create or replace function public.enforce_console_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cnt int; v_cap int;
begin
  if public.is_platform_admin() then return new; end if;
  v_cap := public.plan_limit(public.org_plan(new.org_id), 'consoles');
  select count(*) into v_cnt from public.consoles where venue_id = new.venue_id and deleted_at is null;
  if v_cnt >= v_cap then
    raise exception 'plan_limit_reached:consoles:%', v_cap using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- PIN employees only (user_id is null). Invited email members (user_id set, via
-- shift-on-login / accept_invite) are NOT capped here so logins never break.
create or replace function public.enforce_employee_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cnt int; v_cap int;
begin
  if new.user_id is not null then return new; end if;
  if public.is_platform_admin() then return new; end if;
  v_cap := public.plan_limit(public.org_plan(new.org_id), 'employees');
  select count(*) into v_cnt from public.employees where org_id = new.org_id and user_id is null;
  if v_cnt >= v_cap then
    raise exception 'plan_limit_reached:employees:%', v_cap using errcode = 'P0001';
  end if;
  return new;
end
$$;

drop trigger if exists trg_limit_venue    on public.venues;
drop trigger if exists trg_limit_console  on public.consoles;
drop trigger if exists trg_limit_employee on public.employees;
create trigger trg_limit_venue    before insert on public.venues    for each row execute function public.enforce_venue_limit();
create trigger trg_limit_console  before insert on public.consoles  for each row execute function public.enforce_console_limit();
create trigger trg_limit_employee before insert on public.employees for each row execute function public.enforce_employee_limit();
