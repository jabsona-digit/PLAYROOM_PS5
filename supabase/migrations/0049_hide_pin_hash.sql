-- 0049 — Actually hide employees.pin_hash from client roles.
-- 0048's `revoke select (pin_hash)` was a no-op: in Postgres a TABLE-level SELECT
-- grant overrides a column-level revoke. The correct pattern is to drop the table
-- grant and re-grant SELECT on every column EXCEPT pin_hash. RLS (employees_select)
-- still scopes rows to the caller's org; this just removes the brute-forceable
-- 4-digit-PIN hash from what any client can read. Definer RPCs (identify_by_pin,
-- clock_toggle, create_employee, set_employee_pin) run as owner and are unaffected.

revoke select on public.employees from anon, authenticated;
grant select (id, name, role, is_active, created_at, org_id, salary_type, salary_amount)
  on public.employees to authenticated;
