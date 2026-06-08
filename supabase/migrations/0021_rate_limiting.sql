-- 0021: lightweight per-minute rate limiting on sensitive RPCs.
-- ratelimit.check(bucket, limit) increments a counter for the current minute and
-- raises 'rate_limit_exceeded' once the limit is passed. SECURITY DEFINER so it
-- writes the log regardless of caller; the log table itself is not client-accessible.

create schema if not exists ratelimit;
revoke all on schema ratelimit from public, anon;
grant usage on schema ratelimit to authenticated;  -- needed to call the function

create table if not exists ratelimit.log (
  bucket     text        not null,
  window_min timestamptz not null default date_trunc('minute', now()),
  hits       int         not null default 1,
  primary key (bucket, window_min)
);
revoke all on ratelimit.log from public, anon, authenticated;

create or replace function ratelimit.check(p_bucket text, p_limit int default 60)
returns void
language plpgsql
security definer
set search_path = ratelimit, public
as $$
declare
  v_hits int;
begin
  insert into ratelimit.log (bucket, window_min, hits)
  values (p_bucket, date_trunc('minute', now()), 1)
  on conflict (bucket, window_min) do update set hits = ratelimit.log.hits + 1
  returning hits into v_hits;

  if v_hits > p_limit then
    raise exception 'rate_limit_exceeded'
      using hint = format('limit %s/min for %s', p_limit, p_bucket);
  end if;
end;
$$;
revoke all on function ratelimit.check(text, int) from public, anon;
grant execute on function ratelimit.check(text, int) to authenticated;

-- prune old buckets every 10 minutes
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-ratelimit') then
    perform cron.unschedule('cleanup-ratelimit');
  end if;
end $$;
select cron.schedule(
  'cleanup-ratelimit',
  '*/10 * * * *',
  $$delete from ratelimit.log where window_min < now() - interval '30 minutes'$$
);

-- ---------------------------------------------------------------------------
-- Add ratelimit.check(...) as the first statement of each sensitive RPC.
-- Bodies are otherwise reproduced verbatim from the live definitions.
-- ---------------------------------------------------------------------------

-- start_session — 20/min per user
create or replace function public.start_session(p_console_id integer, p_plan_id integer, p_duration_min integer, p_customer_name text DEFAULT NULL::text, p_created_by integer DEFAULT NULL::integer, p_payment_method text DEFAULT 'cash'::text, p_bank text DEFAULT NULL::text)
returns sessions language plpgsql set search_path to 'public'
as $function$
declare
  v_price   numeric(10,2);
  v_org     uuid;
  v_venue   uuid;
  v_bank    text := p_bank;
  v_session public.sessions;
begin
  perform ratelimit.check('start_session:' || coalesce(auth.uid()::text, 'anon'), 20);
  if p_payment_method not in ('cash', 'card', 'transfer') then
    raise exception 'გადახდის მეთოდი არასწორია';
  end if;
  if p_payment_method = 'cash' then
    v_bank := null;
  elsif v_bank is null or v_bank not in ('TBC', 'BOG') then
    raise exception 'მიუთითე ბანკი (TBC ან BOG)';
  end if;

  select org_id, venue_id into v_org, v_venue
    from public.consoles where id = p_console_id;
  if v_org is null then raise exception 'კონსოლი ვერ მოიძებნა'; end if;

  select price_per_hour into v_price
    from public.pricing_plans where id = p_plan_id and is_active and org_id = v_org;
  if v_price is null then raise exception 'ტარიფი ვერ მოიძებნა ან გათიშულია'; end if;

  insert into public.sessions (
    org_id, venue_id, console_id, pricing_plan_id, customer_name, duration_min,
    ends_at, price_per_hour, price_total, created_by, payment_method, bank
  ) values (
    v_org, v_venue, p_console_id, p_plan_id, p_customer_name, p_duration_min,
    now() + make_interval(mins => p_duration_min),
    v_price, round((p_duration_min / 60.0) * v_price, 2), p_created_by,
    p_payment_method, v_bank
  )
  returning * into v_session;

  update public.consoles set status = 'active' where id = p_console_id;
  return v_session;
end;
$function$;

-- start_open_session — 20/min per user
create or replace function public.start_open_session(p_console_id integer, p_plan_id integer, p_customer_name text DEFAULT NULL::text, p_created_by integer DEFAULT NULL::integer, p_payment_method text DEFAULT 'cash'::text, p_bank text DEFAULT NULL::text)
returns sessions language plpgsql set search_path to 'public'
as $function$
declare
  v_price   numeric(10,2);
  v_org     uuid;
  v_venue   uuid;
  v_bank    text := p_bank;
  v_session public.sessions;
begin
  perform ratelimit.check('start_open_session:' || coalesce(auth.uid()::text, 'anon'), 20);
  if p_payment_method not in ('cash', 'card', 'transfer') then
    raise exception 'გადახდის მეთოდი არასწორია';
  end if;
  if p_payment_method = 'cash' then
    v_bank := null;
  elsif v_bank is null or v_bank not in ('TBC', 'BOG') then
    raise exception 'მიუთითე ბანკი (TBC ან BOG)';
  end if;

  select org_id, venue_id into v_org, v_venue
    from public.consoles where id = p_console_id;
  if v_org is null then raise exception 'კონსოლი ვერ მოიძებნა'; end if;

  select price_per_hour into v_price
    from public.pricing_plans where id = p_plan_id and is_active and org_id = v_org;
  if v_price is null then raise exception 'ტარიფი ვერ მოიძებნა ან გათიშულია'; end if;

  insert into public.sessions (
    org_id, venue_id, console_id, pricing_plan_id, customer_name, duration_min,
    ends_at, price_per_hour, price_total, created_by, payment_method, bank, is_open
  ) values (
    v_org, v_venue, p_console_id, p_plan_id, p_customer_name, null,
    null, v_price, 0, p_created_by, p_payment_method, v_bank, true
  )
  returning * into v_session;

  update public.consoles set status = 'active' where id = p_console_id;
  return v_session;
end;
$function$;

-- create_bar_sale (legacy jsonb overload, invoker) — 60/min per user
create or replace function public.create_bar_sale(p_venue_id uuid, p_payment_method text, p_bank text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_customer_name text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid, p_created_by integer DEFAULT NULL::integer)
returns uuid language plpgsql set search_path to 'public'
as $function$
declare
  v_org   uuid;
  v_bank  text := p_bank;
  v_sale  uuid;
  v_total numeric(10,2) := 0;
  v_item  jsonb;
  v_pid   int;
  v_qty   int;
  v_price numeric(10,2);
  v_cost  numeric(10,2);
  v_name  text;
begin
  perform ratelimit.check('create_bar_sale:' || coalesce(auth.uid()::text, 'anon'), 60);
  if p_payment_method not in ('cash', 'card', 'transfer') then
    raise exception 'გადახდის მეთოდი არასწორია';
  end if;
  if p_payment_method = 'cash' then
    v_bank := null;
  elsif v_bank is null or v_bank not in ('TBC', 'BOG') then
    raise exception 'მიუთითე ბანკი (TBC ან BOG)';
  end if;

  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'წვდომა აკრძალულია';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'კალათა ცარიელია';
  end if;
  if p_session_id is not null
     and not exists (select 1 from public.sessions where id = p_session_id and org_id = v_org) then
    raise exception 'სესია ვერ მოიძებნა';
  end if;

  insert into public.bar_sales (org_id, venue_id, payment_method, bank, customer_name, session_id, created_by, total)
    values (v_org, p_venue_id, p_payment_method, v_bank, p_customer_name, p_session_id, p_created_by, 0)
    returning id into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'product_id')::int;
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));
    select name, price, cost_price into v_name, v_price, v_cost
      from public.bar_products where id = v_pid and org_id = v_org and is_active;
    if v_price is null then raise exception 'პროდუქტი ვერ მოიძებნა'; end if;

    insert into public.bar_sale_items (org_id, sale_id, product_id, name, unit_price, unit_cost_price, qty, line_total)
      values (v_org, v_sale, v_pid, v_name, v_price, coalesce(v_cost, 0), v_qty, round(v_price * v_qty, 2));

    update public.bar_products
       set stock_quantity = stock_quantity - v_qty
     where id = v_pid;

    v_total := v_total + round(v_price * v_qty, 2);
  end loop;

  update public.bar_sales set total = v_total where id = v_sale;
  return v_sale;
end;
$function$;

-- create_bar_sale (current json+tip overload, definer) — 60/min per user
create or replace function public.create_bar_sale(p_venue_id uuid, p_payment_method text, p_items json, p_bank text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_created_by integer DEFAULT NULL::integer, p_tip numeric DEFAULT 0)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_org_id  uuid;
  v_sale_id uuid;
  v_total   numeric := 0;
  v_item    json;
  v_product record;
  v_line    numeric;
begin
  perform ratelimit.check('create_bar_sale:' || coalesce(auth.uid()::text, 'anon'), 60);
  select org_id into v_org_id from public.venues where id = p_venue_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  if p_tip < 0 then raise exception 'invalid_tip'; end if;

  insert into public.bar_sales
    (org_id, venue_id, payment_method, bank, session_id, tip_amount, total)
  values
    (v_org_id, p_venue_id, p_payment_method, p_bank, p_session_id, coalesce(p_tip, 0), 0)
  returning id into v_sale_id;

  for v_item in select * from json_array_elements(p_items) loop
    select id, price, cost_price, name, stock_quantity
    into v_product
    from public.bar_products
    where id = (v_item->>'product_id')::integer
      and org_id = v_org_id;

    if not found then raise exception 'product_not_found'; end if;
    if v_product.stock_quantity < (v_item->>'qty')::integer then
      raise exception 'insufficient_stock';
    end if;

    v_line := v_product.price * (v_item->>'qty')::integer;
    v_total := v_total + v_line;

    insert into public.bar_sale_items
      (org_id, sale_id, product_id, name, qty, unit_price, unit_cost_price, line_total)
    values
      (v_org_id, v_sale_id, v_product.id, v_product.name,
       (v_item->>'qty')::integer, v_product.price, v_product.cost_price, v_line);

    update public.bar_products
    set stock_quantity = stock_quantity - (v_item->>'qty')::integer
    where id = v_product.id;
  end loop;

  update public.bar_sales set total = v_total where id = v_sale_id;

  perform public.log_audit(
    v_org_id, p_venue_id,
    'bar_sale.create', 'bar_sale', v_sale_id::text,
    jsonb_build_object('total', v_total, 'tip', p_tip, 'method', p_payment_method)
  );

  return v_sale_id;
end;
$function$;

-- clock_toggle — 10/min per venue (PIN brute-force guard)
create or replace function public.clock_toggle(p_pin text, p_venue_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare
  v_org   uuid;
  v_emp   public.employees%rowtype;
  v_shift public.shifts%rowtype;
  v_hours numeric(5,2);
begin
  perform ratelimit.check('clock_toggle:' || p_venue_id::text, 10);
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null or not public.is_org_member(v_org) then
    return jsonb_build_object('ok', false, 'message', 'წვდომა აკრძალულია');
  end if;

  select * into v_emp from public.employees
   where is_active and org_id = v_org and pin_hash = crypt(p_pin, pin_hash)
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
    insert into public.shifts (org_id, venue_id, employee_id)
      values (v_org, p_venue_id, v_emp.id);
    return jsonb_build_object('ok', true, 'action', 'in', 'employee', v_emp.name);
  end if;
end;
$function$;

-- void_bar_sale — 10/min per user
create or replace function public.void_bar_sale(p_sale_id uuid, p_reason text DEFAULT NULL::text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_org_id   uuid;
  v_venue_id uuid;
begin
  perform ratelimit.check('void_bar_sale:' || coalesce(auth.uid()::text, 'anon'), 10);
  select org_id, venue_id
  into   v_org_id, v_venue_id
  from   public.bar_sales
  where  id = p_sale_id;

  if not found then
    raise exception 'not_found';
  end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  if not is_platform_admin() then
    if not exists (
      select 1 from public.org_members
      where  org_id  = v_org_id
        and  user_id = auth.uid()
        and  role in ('owner', 'admin', 'manager')
    ) then
      raise exception 'insufficient_privilege';
    end if;
  end if;

  if exists (
    select 1 from public.bar_sales
    where id = p_sale_id and voided_at is not null
  ) then
    raise exception 'already_voided';
  end if;

  update public.bar_sales
  set voided_at   = now(),
      void_reason = p_reason
  where id = p_sale_id;

  update public.bar_products bp
  set    stock_quantity = bp.stock_quantity + bsi.qty
  from   public.bar_sale_items bsi
  where  bsi.sale_id    = p_sale_id
    and  bsi.product_id = bp.id;

  perform public.log_audit(
    v_org_id, v_venue_id,
    'bar_sale.void', 'bar_sale', p_sale_id::text,
    jsonb_build_object('reason', p_reason)
  );
end;
$function$;
