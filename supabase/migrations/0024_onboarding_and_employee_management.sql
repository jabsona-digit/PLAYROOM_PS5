-- 0024: onboarding + staff management backend.
-- Fixes a real gap: employees.pin_hash is NOT NULL and clients can't write it,
-- so there was NO way to create an employee. Adds a create_employee RPC + the
-- org identification code + richer onboarding.

-- 1. company identification code on the org (Georgian საიდენტიფიკაციო კოდი).
alter table public.organizations add column if not exists identification_code text;

-- 2. create_employee — admin-only; hashes the PIN server-side; blocks duplicate
--    PINs within the org (so identify_by_pin stays unambiguous).
create or replace function public.create_employee(
  p_org_id uuid,
  p_name   text,
  p_role   text,
  p_pin    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id int;
begin
  if not public.is_org_admin(p_org_id) then raise exception 'unauthorized'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'invalid_state'; end if;
  if p_role not in ('owner', 'admin', 'manager', 'accountant', 'cashier', 'operator') then
    raise exception 'invalid_state';
  end if;
  if p_pin is null or length(p_pin) < 4 then raise exception 'invalid_state'; end if;

  if exists (
    select 1 from public.employees
    where org_id = p_org_id and is_active and pin_hash = crypt(p_pin, pin_hash)
  ) then
    raise exception 'pin_taken';
  end if;

  insert into public.employees (org_id, name, role, pin_hash, is_active)
  values (p_org_id, trim(p_name), p_role, crypt(p_pin, gen_salt('bf')), true)
  returning id into v_id;

  perform public.log_audit(p_org_id, null, 'employee.create', 'employee', v_id::text,
    jsonb_build_object('name', trim(p_name), 'role', p_role));

  return jsonb_build_object('ok', true, 'employee_id', v_id);
end;
$$;
revoke all on function public.create_employee(uuid, text, text, text) from public, anon;
grant execute on function public.create_employee(uuid, text, text, text) to authenticated;

-- 3. create_organization now accepts an optional identification code (onboarding
--    step 1). Replace the 2-arg version to avoid overload ambiguity.
drop function if exists public.create_organization(text, text);
create or replace function public.create_organization(
  p_org_name            text,
  p_venue_name          text,
  p_identification_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'ავტორიზაცია საჭიროა'; end if;
  if coalesce(trim(p_org_name), '') = '' then raise exception 'ორგანიზაციის სახელი სავალდებულოა'; end if;

  insert into public.organizations (name, identification_code)
    values (trim(p_org_name), nullif(trim(p_identification_code), ''))
    returning id into v_org;
  insert into public.venues (org_id, name)
    values (v_org, coalesce(nullif(trim(p_venue_name), ''), 'მთავარი ფილიალი'));
  insert into public.org_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.pricing_plans (org_id, name, type, controllers, price_per_hour) values
    (v_org, 'სტანდარტი', 'standard', 2, 5.00),
    (v_org, 'Pro',        'pro',      3, 7.00),
    (v_org, 'პრემიუმი',  'premium',  4, 8.00);
  return v_org;
end;
$$;
revoke all on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;
