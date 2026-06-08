-- 0022: PIN-gate backend. Identify the employee at a terminal by PIN and return
-- their role so the frontend can route to the right dashboards.

-- 1. Widen employees.role to the full role set (was admin|operator) so the PIN
--    gate can route operator / accountant / owner etc. Mirrors org_members roles.
alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees add constraint employees_role_check
  check (role in ('owner', 'admin', 'manager', 'accountant', 'cashier', 'operator'));

-- 2. identify_by_pin — returns {ok, employee_id, employee_name, role, org_id, venue_id}.
--    NEVER returns pin_hash. Soft-returns (ok:false) on bad PIN so the failed-attempt
--    audit row survives (a RAISE would roll it back). Rate-limited per venue
--    (brute-force guard). Caller must already be a member of the venue's org.
create or replace function public.identify_by_pin(p_pin text, p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
  v_emp    public.employees%rowtype;
begin
  perform ratelimit.check('identify_by_pin:' || p_venue_id::text, 10);

  select org_id into v_org_id from public.venues where id = p_venue_id;
  if v_org_id is null then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  if not public.is_org_member(v_org_id) and not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_emp from public.employees
  where org_id = v_org_id and is_active and pin_hash = crypt(p_pin, pin_hash)
  limit 1;

  if not found then
    perform public.log_audit(v_org_id, p_venue_id, 'pin_gate.failed', 'venue',
      p_venue_id::text, jsonb_build_object('reason', 'pin_mismatch'));
    return jsonb_build_object('ok', false, 'error', 'invalid_pin');
  end if;

  perform public.log_audit(v_org_id, p_venue_id, 'pin_gate.success', 'employee',
    v_emp.id::text, '{}'::jsonb);

  return jsonb_build_object(
    'ok',            true,
    'employee_id',   v_emp.id,
    'employee_name', v_emp.name,
    'role',          v_emp.role,
    'org_id',        v_org_id,
    'venue_id',      p_venue_id
  );
end;
$$;

revoke all on function public.identify_by_pin(text, uuid) from public, anon;
grant execute on function public.identify_by_pin(text, uuid) to authenticated;
