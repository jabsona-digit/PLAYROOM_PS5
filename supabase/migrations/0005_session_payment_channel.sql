-- Capture the payment channel on each session (cash / card / transfer) and, for
-- non-cash, the receiving bank (TBC / BOG). Same enum will be reused by bar POS
-- sales so accounting can union everything into one payments ledger.

alter table public.sessions
  add column payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'transfer')),
  add column bank text check (bank in ('TBC', 'BOG'));

alter table public.sessions
  add constraint sessions_bank_consistency
  check (
    (payment_method = 'cash' and bank is null) or
    (payment_method <> 'cash' and bank is not null)
  );

-- start_session gains payment params (drop old signature first to avoid overload)
drop function if exists public.start_session(int, int, int, text, int);
create or replace function public.start_session(
  p_console_id     int,
  p_plan_id        int,
  p_duration_min   int,
  p_customer_name  text default null,
  p_created_by     int default null,
  p_payment_method text default 'cash',
  p_bank           text default null
)
returns public.sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_price   numeric(10,2);
  v_org     uuid;
  v_venue   uuid;
  v_bank    text := p_bank;
  v_session public.sessions;
begin
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
$$;

revoke all on function public.start_session(int, int, int, text, int, text, text) from public, anon;
grant execute on function public.start_session(int, int, int, text, int, text, text) to authenticated;
