-- 0048 — Harden the employees / shifts chain (staff-feature audit).
-- Findings:
--  (a) employees + shifts RLS were `[ALL] is_org_member`, so ANY org member could
--      INSERT/UPDATE/DELETE staff directly — bypassing the admin-only RPCs — e.g.
--      raise their own role to owner, change salaries, or forge shifts (payroll
--      integrity). Tighten WRITES to is_org_admin; keep READS at is_org_member
--      (roster + clock UI + hasEmployees check still work for any session).
--  (b) employees.pin_hash (bcrypt of a 4-digit PIN → trivially brute-forceable)
--      was readable by any member via RLS. Clients never need it — every PIN check
--      runs through SECURITY DEFINER RPCs (identify_by_pin / clock_toggle) that
--      bypass RLS — so revoke column-level read AND write from client roles. Only
--      the definer RPCs (running as owner) may touch pin_hash.
--  (c) set_employee_pin didn't block duplicate PINs (create_employee does), which
--      can make identify_by_pin ambiguous. Add the guard + a min-length check.

-- (a) employees: read = member, write = admin
drop policy if exists "org_scope" on public.employees;
create policy "employees_select" on public.employees for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());
create policy "employees_write" on public.employees for all to authenticated
  using (is_org_admin(org_id) or is_platform_admin())
  with check (is_org_admin(org_id) or is_platform_admin());

-- shifts: read = member, write = admin (clock_toggle is SECURITY DEFINER → unaffected)
drop policy if exists "org_scope" on public.shifts;
create policy "shifts_select" on public.shifts for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());
create policy "shifts_write" on public.shifts for all to authenticated
  using (is_org_admin(org_id) or is_platform_admin())
  with check (is_org_admin(org_id) or is_platform_admin());

-- (b) pin_hash is server-only — clients never select or write it directly
revoke select (pin_hash), insert (pin_hash), update (pin_hash)
  on public.employees from anon, authenticated;

-- (c) set_employee_pin: min length + block duplicate PIN within the org
create or replace function public.set_employee_pin(p_employee_id integer, p_pin text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_org uuid;
begin
  select org_id into v_org from public.employees where id = p_employee_id;
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception 'წვდომა აკრძალულია';
  end if;
  if p_pin is null or length(p_pin) < 4 then
    raise exception 'invalid_state';
  end if;
  if exists (
    select 1 from public.employees
    where org_id = v_org and is_active and id <> p_employee_id
      and pin_hash = crypt(p_pin, pin_hash)
  ) then
    raise exception 'pin_taken';
  end if;
  update public.employees
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = p_employee_id;
end;
$function$;
