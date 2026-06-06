-- pgcrypto lives in the `extensions` schema on Supabase, so the SECURITY DEFINER
-- functions that call crypt()/gen_salt() must include it in search_path
-- (otherwise clock_toggle fails with "function crypt(text, text) does not exist").
-- Also adds covering indexes for the remaining foreign keys (perf advisor).

create or replace function public.clock_toggle(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_emp   public.employees%rowtype;
  v_shift public.shifts%rowtype;
  v_hours numeric(5,2);
begin
  select * into v_emp from public.employees
   where is_active and pin_hash = crypt(p_pin, pin_hash)
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'PIN არასწორია');
  end if;

  select * into v_shift from public.shifts
   where employee_id = v_emp.id and clock_out is null
   order by clock_in desc limit 1;

  if found then
    update public.shifts set clock_out = now()
     where id = v_shift.id
     returning hours_worked into v_hours;
    return jsonb_build_object('ok', true, 'action', 'out',
      'employee', v_emp.name, 'hours_worked', v_hours);
  else
    insert into public.shifts (employee_id) values (v_emp.id);
    return jsonb_build_object('ok', true, 'action', 'in', 'employee', v_emp.name);
  end if;
end;
$$;

create or replace function public.set_employee_pin(p_employee_id int, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.employees
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = p_employee_id;
end;
$$;

create index if not exists sessions_pricing_plan_id_idx on public.sessions (pricing_plan_id);
create index if not exists sessions_created_by_idx      on public.sessions (created_by);
