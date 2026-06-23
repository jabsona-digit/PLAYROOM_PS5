-- 0129 - Loyalty identity (Phase A): tie a customer to a SESSION so points accrue,
-- harden customer creation, and let the operator scan/search a customer at session START.
-- Rules (owner, 2026-06-23): earn 1 point per GEL10 of SESSION spend (NOT bar);
-- 1 point = GEL1 value (redemption is a later step); phone mandatory; identity optional
-- at start ("guest" still allowed). Phase B (marketplace link + real passport QR) follows.

-- 1) sessions <- customer link (keep customer_name for guests / display)
alter table public.sessions
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists sessions_customer_idx on public.sessions(customer_id) where customer_id is not null;

-- 2) customer hardening: require a name + a VALID Georgian mobile (fixes junk-from-1-digit).
--    Normalizes the phone to 9 digits. Strict on INSERT; on UPDATE only re-checks a CHANGED
--    phone (so editing a legacy row's points isn't blocked by an old bad phone).
create or replace function public.validate_customer()
returns trigger language plpgsql set search_path = public as $$
declare v_phone text;
begin
  if coalesce(btrim(new.name), '') = '' then
    raise exception 'customer_name_required';
  end if;
  v_phone := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');           -- digits only
  if length(v_phone) = 12 and left(v_phone, 3) = '995' then v_phone := substr(v_phone, 4); end if;  -- drop +995
  if tg_op = 'INSERT' or new.phone is distinct from old.phone then
    if length(v_phone) <> 9 or left(v_phone, 1) <> '5' then
      raise exception 'invalid_phone';   -- Georgian mobile = 9 digits starting with 5
    end if;
  end if;
  new.phone := nullif(v_phone, '');
  return new;
end; $$;
drop trigger if exists trg_validate_customer on public.customers;
create trigger trg_validate_customer before insert or update on public.customers
  for each row execute function public.validate_customer();

-- 3) loyalty accrual: when a session COMPLETES with a linked customer, award points + a visit.
--    SESSION ONLY (not bar). Idempotent — fires once, on the not-completed -> completed transition.
create or replace function public.accrue_loyalty_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is not null
     and new.status = 'completed'
     and old.status is distinct from 'completed' then
    update public.customers
      set points      = points + floor(coalesce(new.price_total, 0) / 10)::int,  -- GEL10 -> 1 point
          total_spent = total_spent + coalesce(new.price_total, 0),
          visit_count = visit_count + 1
      where id = new.customer_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_accrue_loyalty_points on public.sessions;
create trigger trg_accrue_loyalty_points after update on public.sessions
  for each row execute function public.accrue_loyalty_points();

-- 4) start_session / start_open_session += p_customer_id (optional). Drop the 0021 signatures
--    and recreate with the extra trailing default param (avoids overload ambiguity).
drop function if exists public.start_session(integer, integer, integer, text, integer, text, text);
create function public.start_session(
  p_console_id integer, p_plan_id integer, p_duration_min integer,
  p_customer_name text default null, p_created_by integer default null,
  p_payment_method text default 'cash', p_bank text default null,
  p_customer_id uuid default null
) returns sessions language plpgsql set search_path to 'public' as $function$
declare v_price numeric(10,2); v_org uuid; v_venue uuid; v_bank text := p_bank; v_session public.sessions;
begin
  perform ratelimit.check('start_session:' || coalesce(auth.uid()::text, 'anon'), 20);
  if p_payment_method not in ('cash','card','transfer') then raise exception 'გადახდის მეთოდი არასწორია'; end if;
  if p_payment_method = 'cash' then v_bank := null;
  elsif v_bank is null or v_bank not in ('TBC','BOG') then raise exception 'მიუთითე ბანკი (TBC ან BOG)'; end if;
  select org_id, venue_id into v_org, v_venue from public.consoles where id = p_console_id;
  if v_org is null then raise exception 'კონსოლი ვერ მოიძებნა'; end if;
  select price_per_hour into v_price from public.pricing_plans where id = p_plan_id and is_active and org_id = v_org;
  if v_price is null then raise exception 'ტარიფი ვერ მოიძებნა ან გათიშულია'; end if;
  insert into public.sessions (
    org_id, venue_id, console_id, pricing_plan_id, customer_name, customer_id, duration_min,
    ends_at, price_per_hour, price_total, created_by, payment_method, bank
  ) values (
    v_org, v_venue, p_console_id, p_plan_id, p_customer_name, p_customer_id, p_duration_min,
    now() + make_interval(mins => p_duration_min),
    v_price, round((p_duration_min / 60.0) * v_price, 2), p_created_by, p_payment_method, v_bank
  ) returning * into v_session;
  update public.consoles set status = 'active' where id = p_console_id;
  return v_session;
end; $function$;
revoke all on function public.start_session(integer,integer,integer,text,integer,text,text,uuid) from public, anon;
grant execute on function public.start_session(integer,integer,integer,text,integer,text,text,uuid) to authenticated;

drop function if exists public.start_open_session(integer, integer, text, integer, text, text);
create function public.start_open_session(
  p_console_id integer, p_plan_id integer,
  p_customer_name text default null, p_created_by integer default null,
  p_payment_method text default 'cash', p_bank text default null,
  p_customer_id uuid default null
) returns sessions language plpgsql set search_path to 'public' as $function$
declare v_price numeric(10,2); v_org uuid; v_venue uuid; v_bank text := p_bank; v_session public.sessions;
begin
  perform ratelimit.check('start_open_session:' || coalesce(auth.uid()::text, 'anon'), 20);
  if p_payment_method not in ('cash','card','transfer') then raise exception 'გადახდის მეთოდი არასწორია'; end if;
  if p_payment_method = 'cash' then v_bank := null;
  elsif v_bank is null or v_bank not in ('TBC','BOG') then raise exception 'მიუთითე ბანკი (TBC ან BOG)'; end if;
  select org_id, venue_id into v_org, v_venue from public.consoles where id = p_console_id;
  if v_org is null then raise exception 'კონსოლი ვერ მოიძებნა'; end if;
  select price_per_hour into v_price from public.pricing_plans where id = p_plan_id and is_active and org_id = v_org;
  if v_price is null then raise exception 'ტარიფი ვერ მოიძებნა ან გათიშულია'; end if;
  insert into public.sessions (
    org_id, venue_id, console_id, pricing_plan_id, customer_name, customer_id, duration_min,
    ends_at, price_per_hour, price_total, created_by, payment_method, bank, is_open
  ) values (
    v_org, v_venue, p_console_id, p_plan_id, p_customer_name, p_customer_id, null,
    null, v_price, 0, p_created_by, p_payment_method, v_bank, true
  ) returning * into v_session;
  update public.consoles set status = 'active' where id = p_console_id;
  return v_session;
end; $function$;
revoke all on function public.start_open_session(integer,integer,text,integer,text,text,uuid) from public, anon;
grant execute on function public.start_open_session(integer,integer,text,integer,text,text,uuid) to authenticated;
