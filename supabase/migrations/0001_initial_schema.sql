-- Playroom Admin — initial schema (spec §2).
--
-- Auth model: Supabase Auth login. This is a single-venue internal tool, so all
-- signed-in staff share the same data: RLS grants the `authenticated` role full
-- access and `anon` gets nothing (login required). The employee PIN is stored as
-- a bcrypt hash and is never readable by clients — PIN checks happen server-side
-- through SECURITY DEFINER RPCs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.pricing_plans (
  id              serial primary key,
  name            varchar(100) not null,
  type            varchar(50)  not null check (type in ('standard', 'premium')),
  controllers     int          not null default 2,
  price_per_hour  numeric(10,2) not null check (price_per_hour >= 0),
  is_active       boolean      not null default true,
  updated_at      timestamptz  not null default now()
);

create table public.consoles (
  id           serial primary key,
  slot_number  int not null unique,
  name         varchar(50) not null,
  status       varchar(20) not null default 'free'
                 check (status in ('free', 'active', 'warning_10', 'warning_5', 'expired')),
  created_at   timestamptz not null default now()
);

create table public.employees (
  id          serial primary key,
  name        varchar(100) not null,
  pin_hash    text not null,                 -- bcrypt; never exposed to clients
  role        varchar(20) not null default 'operator' check (role in ('admin', 'operator')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  console_id       int not null references public.consoles(id) on delete cascade,
  pricing_plan_id  int not null references public.pricing_plans(id),
  customer_name    varchar(100),
  started_at       timestamptz not null default now(),
  ends_at          timestamptz not null,
  ended_at         timestamptz,
  duration_min     int not null,
  price_per_hour   numeric(10,2) not null,   -- snapshot of the plan at start
  price_total      numeric(10,2) not null,   -- base price; extensions tracked separately
  status           varchar(20) not null default 'active'
                     check (status in ('active', 'completed', 'cancelled')),
  notified_10      boolean not null default false,
  notified_5       boolean not null default false,
  created_by       int references public.employees(id),
  created_at       timestamptz not null default now()
);
create index sessions_console_id_idx on public.sessions (console_id);
create index sessions_status_idx     on public.sessions (status);
create index sessions_ended_at_idx   on public.sessions (ended_at);

create table public.session_extensions (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  extra_minutes  int not null,
  extra_price    numeric(10,2) not null,
  created_at     timestamptz not null default now()
);
create index session_extensions_session_id_idx on public.session_extensions (session_id);

create table public.shifts (
  id            uuid primary key default gen_random_uuid(),
  employee_id   int not null references public.employees(id) on delete cascade,
  clock_in      timestamptz not null default now(),
  clock_out     timestamptz,
  hours_worked  numeric(5,2),
  work_date     date not null default current_date,
  notes         text
);
create index shifts_work_date_idx   on public.shifts (work_date);
create index shifts_employee_id_idx on public.shifts (employee_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- auto hours_worked on clock-out
create or replace function public.calc_hours_worked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.clock_out is not null and old.clock_out is null then
    new.hours_worked := round(
      extract(epoch from (new.clock_out - new.clock_in)) / 3600.0, 2);
  end if;
  return new;
end;
$$;

create trigger trg_hours_worked
  before update on public.shifts
  for each row execute function public.calc_hours_worked();

-- ---------------------------------------------------------------------------
-- Business-logic RPCs (server-side price calculation = single source of truth)
-- ---------------------------------------------------------------------------

-- Start a session. Price is computed from the *current* active plan, so a price
-- change in admin applies immediately to new sessions (spec §13).
create or replace function public.start_session(
  p_console_id   int,
  p_plan_id      int,
  p_duration_min int,
  p_customer_name text default null,
  p_created_by   int default null
)
returns public.sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_price   numeric(10,2);
  v_session public.sessions;
begin
  select price_per_hour into v_price
    from public.pricing_plans where id = p_plan_id and is_active;
  if v_price is null then
    raise exception 'ტარიფი ვერ მოიძებნა ან გათიშულია';
  end if;

  insert into public.sessions (
    console_id, pricing_plan_id, customer_name, duration_min,
    ends_at, price_per_hour, price_total, created_by
  ) values (
    p_console_id, p_plan_id, p_customer_name, p_duration_min,
    now() + make_interval(mins => p_duration_min),
    v_price, round((p_duration_min / 60.0) * v_price, 2), p_created_by
  )
  returning * into v_session;

  update public.consoles set status = 'active' where id = p_console_id;
  return v_session;
end;
$$;

-- Extend the active session; extension price uses the session's locked rate.
create or replace function public.extend_session(p_session_id uuid, p_extra_min int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pph numeric(10,2);
begin
  select price_per_hour into v_pph from public.sessions where id = p_session_id;
  if v_pph is null then raise exception 'სესია ვერ მოიძებნა'; end if;

  insert into public.session_extensions (session_id, extra_minutes, extra_price)
    values (p_session_id, p_extra_min, round((p_extra_min / 60.0) * v_pph, 2));

  update public.sessions
     set ends_at = ends_at + make_interval(mins => p_extra_min)
   where id = p_session_id;
end;
$$;

-- End a session early and free the console.
create or replace function public.end_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_console int;
begin
  update public.sessions
     set status = 'completed', ended_at = now()
   where id = p_session_id and status = 'active'
   returning console_id into v_console;

  if v_console is not null then
    update public.consoles set status = 'free' where id = v_console;
  end if;
end;
$$;

-- Clock in / out by PIN. SECURITY DEFINER so it can read pin_hash (which clients
-- cannot select). search_path is locked and EXECUTE is limited to authenticated.
create or replace function public.clock_toggle(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
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

-- Set / reset an employee PIN (hashes server-side; raw PIN never stored).
create or replace function public.set_employee_pin(p_employee_id int, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.employees
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = p_employee_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting views (security_invoker = caller's RLS applies, spec §2.7 + §9)
-- ---------------------------------------------------------------------------

-- per-session revenue = base price + all extensions
create view public.session_revenue with (security_invoker = true) as
select
  s.*,
  s.price_total + coalesce(
    (select sum(se.extra_price) from public.session_extensions se
      where se.session_id = s.id), 0) as revenue
from public.sessions s;

create view public.console_stats with (security_invoker = true) as
select
  c.id, c.name, c.slot_number, c.status,
  count(sr.id) filter (where sr.status = 'completed') as total_sessions,
  round(coalesce(sum(sr.duration_min) filter (where sr.status = 'completed'), 0) / 60.0, 1) as total_hours,
  coalesce(sum(sr.revenue) filter (where sr.status = 'completed'), 0) as total_revenue
from public.consoles c
left join public.session_revenue sr on sr.console_id = c.id
group by c.id, c.name, c.slot_number, c.status
order by c.slot_number;

create view public.daily_revenue with (security_invoker = true) as
select
  c.slot_number, c.name,
  count(sr.id) as sessions_today,
  round(coalesce(sum(sr.duration_min), 0) / 60.0, 1) as hours_today,
  coalesce(sum(sr.revenue), 0) as revenue_today
from public.consoles c
left join public.session_revenue sr
  on sr.console_id = c.id
  and sr.status = 'completed'
  and date(sr.ended_at at time zone 'Asia/Tbilisi') = current_date
group by c.id, c.slot_number, c.name
order by c.slot_number;

create view public.period_revenue with (security_invoker = true) as
select
  coalesce(sum(revenue) filter (where date(ended_at at time zone 'Asia/Tbilisi') = current_date), 0) as today,
  coalesce(sum(revenue) filter (where ended_at >= date_trunc('week',  now())), 0) as this_week,
  coalesce(sum(revenue) filter (where ended_at >= date_trunc('month', now())), 0) as this_month,
  coalesce(sum(revenue), 0) as all_time
from public.session_revenue
where status = 'completed';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.pricing_plans      enable row level security;
alter table public.consoles           enable row level security;
alter table public.employees          enable row level security;
alter table public.sessions           enable row level security;
alter table public.session_extensions enable row level security;
alter table public.shifts             enable row level security;

-- internal tool: every signed-in staff member shares venue data
create policy "auth_all" on public.pricing_plans      for all to authenticated using (true) with check (true);
create policy "auth_all" on public.consoles           for all to authenticated using (true) with check (true);
create policy "auth_all" on public.sessions           for all to authenticated using (true) with check (true);
create policy "auth_all" on public.session_extensions for all to authenticated using (true) with check (true);
create policy "auth_all" on public.shifts             for all to authenticated using (true) with check (true);
create policy "auth_read" on public.employees         for select to authenticated using (true);
create policy "auth_write" on public.employees        for insert to authenticated with check (true);
create policy "auth_update" on public.employees       for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Grants — anon has no access; pin_hash is hidden even from authenticated
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;

-- PIN hash is only touched through clock_toggle / set_employee_pin
revoke select (pin_hash), insert (pin_hash), update (pin_hash)
  on public.employees from authenticated;

grant execute on function public.start_session(int, int, int, text, int) to authenticated;
grant execute on function public.extend_session(uuid, int)               to authenticated;
grant execute on function public.end_session(uuid)                       to authenticated;
grant execute on function public.clock_toggle(text)                      to authenticated;
grant execute on function public.set_employee_pin(int, text)             to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.consoles;
alter publication supabase_realtime add table public.sessions;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

insert into public.pricing_plans (name, type, controllers, price_per_hour) values
  ('სტანდარტი', 'standard', 2, 5.00),
  ('პრემიუმი',  'premium',  4, 8.00);

insert into public.consoles (slot_number, name) values
  (1, 'PS5 #1'), (2, 'PS5 #2'), (3, 'PS5 #3'), (4, 'PS5 #4');

insert into public.employees (name, pin_hash, role) values
  ('ნიკა ბერიძე',  crypt('1234', gen_salt('bf')), 'admin'),
  ('მარიამ კვარა', crypt('2580', gen_salt('bf')), 'operator');
