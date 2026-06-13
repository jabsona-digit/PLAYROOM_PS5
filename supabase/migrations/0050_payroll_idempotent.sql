-- 0050 — Make payroll safe to wire into the UI: record each run + idempotency.
-- process_payroll posted 'salary' expenses but had no guard against being run
-- twice for the same period → double-charged wages. Add a payroll_runs ledger
-- with a UNIQUE (org, venue, period) and have process_payroll claim that row
-- first (raising 'payroll_already_run' on a repeat), then post expenses.

create table if not exists public.payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  venue_id       uuid not null references public.venues(id) on delete cascade,
  period_from    date not null,
  period_to      date not null,
  total_paid     numeric(12,2) not null default 0,
  employees_paid integer not null default 0,
  run_by         uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (org_id, venue_id, period_from, period_to)
);
create index if not exists payroll_runs_org_idx on public.payroll_runs(org_id, venue_id, period_from desc);

alter table public.payroll_runs enable row level security;
drop policy if exists "payroll_runs_select" on public.payroll_runs;
create policy "payroll_runs_select" on public.payroll_runs for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());
drop policy if exists "payroll_runs_write" on public.payroll_runs;
create policy "payroll_runs_write" on public.payroll_runs for all to authenticated
  using (is_org_admin(org_id) or is_platform_admin())
  with check (is_org_admin(org_id) or is_platform_admin());

create or replace function public.process_payroll(
  p_org_id   uuid,
  p_venue_id uuid,
  p_from     date,
  p_to       date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp    record;
  v_amount numeric(10,2);
  v_total  numeric(10,2) := 0;
  v_count  int := 0;
  v_run    uuid;
begin
  perform ratelimit.check('process_payroll:' || coalesce(auth.uid()::text, 'anon'), 10);

  if not public.is_org_admin(p_org_id) then
    raise exception 'unauthorized';
  end if;
  if p_from > p_to then
    raise exception 'invalid_state';
  end if;

  -- idempotency: one payroll run per (org, venue, period)
  begin
    insert into public.payroll_runs (org_id, venue_id, period_from, period_to, run_by)
    values (p_org_id, p_venue_id, p_from, p_to, auth.uid())
    returning id into v_run;
  exception when unique_violation then
    raise exception 'payroll_already_run';
  end;

  for v_emp in
    select e.id, e.name, e.salary_type, e.salary_amount,
           coalesce(sum(s.hours_worked) filter (
             where s.clock_out is not null
               and s.work_date between p_from and p_to
               and s.venue_id = p_venue_id
           ), 0) as hours
    from public.employees e
    left join public.shifts s on s.employee_id = e.id
    where e.org_id = p_org_id and e.is_active
    group by e.id, e.name, e.salary_type, e.salary_amount
  loop
    v_amount := case v_emp.salary_type
      when 'hourly'  then round(v_emp.hours * v_emp.salary_amount, 2)
      when 'monthly' then v_emp.salary_amount
      when 'fixed'   then v_emp.salary_amount
      else 0
    end;

    if v_amount > 0 then
      insert into public.expenses (org_id, venue_id, category, amount, description, expense_date, created_by)
      values (
        p_org_id, p_venue_id, 'salary', v_amount,
        format('ხელფასი: %s (%s — %s)', v_emp.name, p_from, p_to),
        p_to, auth.uid()
      );
      v_total := v_total + v_amount;
      v_count := v_count + 1;
    end if;
  end loop;

  update public.payroll_runs
     set total_paid = v_total, employees_paid = v_count
   where id = v_run;

  perform public.log_audit(
    p_org_id, p_venue_id, 'expense.add', 'payroll', p_org_id::text,
    jsonb_build_object('from', p_from, 'to', p_to, 'total', v_total, 'employees', v_count)
  );

  return jsonb_build_object('ok', true, 'total_paid', v_total, 'employees_paid', v_count);
end;
$$;

revoke all on function public.process_payroll(uuid, uuid, date, date) from public, anon;
grant execute on function public.process_payroll(uuid, uuid, date, date) to authenticated;
