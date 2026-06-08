-- 0023: employee salaries + process_payroll → posts wages into accounting (expenses).

-- 1. salary config per employee
alter table public.employees
  add column if not exists salary_type   text not null default 'hourly'
    check (salary_type in ('hourly', 'monthly', 'fixed')),
  add column if not exists salary_amount numeric(10,2) not null default 0
    check (salary_amount >= 0);

-- 2. process_payroll — compute each active employee's wage for a period and post it
--    as a 'salary' expense (so it flows into P&L). Admin-only, rate-limited, audited.
--    hourly  = hours worked in the period (completed shifts at the venue) × rate
--    monthly = the monthly amount (paid once per run)
--    fixed   = the fixed amount
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
  v_emp     record;
  v_amount  numeric(10,2);
  v_total   numeric(10,2) := 0;
  v_count   int := 0;
begin
  perform ratelimit.check('process_payroll:' || coalesce(auth.uid()::text, 'anon'), 10);

  if not public.is_org_admin(p_org_id) then
    raise exception 'unauthorized';
  end if;
  if p_from > p_to then
    raise exception 'invalid_state';
  end if;

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

  perform public.log_audit(
    p_org_id, p_venue_id, 'expense.add', 'payroll', p_org_id::text,
    jsonb_build_object('from', p_from, 'to', p_to, 'total', v_total, 'employees', v_count)
  );

  return jsonb_build_object('ok', true, 'total_paid', v_total, 'employees_paid', v_count);
end;
$$;

revoke all on function public.process_payroll(uuid, uuid, date, date) from public, anon;
grant execute on function public.process_payroll(uuid, uuid, date, date) to authenticated;
