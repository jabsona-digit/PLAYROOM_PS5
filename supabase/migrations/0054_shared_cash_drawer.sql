-- 0054 — Phase 2 (step 3): shared, DB-backed cash drawer (one open per venue).
-- The cashier "ცვლა" was LOCAL React state per device but read SHARED venue cash,
-- so two operators each opening a drawer double-counted. Move the drawer into the
-- DB: ONE open drawer per venue (opening float + opened_at), visible to everyone;
-- expected cash is computed from opened_at → now; close reconciles once and logs
-- to cash_reconciliations (existing audit trail).

create table if not exists public.cash_drawers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  venue_id      uuid not null references public.venues(id) on delete cascade,
  status        text not null default 'open' check (status in ('open', 'closed')),
  opened_by     uuid references auth.users(id),
  opened_at     timestamptz not null default now(),
  opening_cash  numeric(10,2) not null default 0,
  closed_by     uuid references auth.users(id),
  closed_at     timestamptz,
  closing_cash  numeric(10,2),
  expected_cash numeric(10,2),
  difference    numeric(10,2),
  note          text
);
-- at most ONE open drawer per venue
create unique index if not exists cash_drawers_one_open_per_venue
  on public.cash_drawers(venue_id) where status = 'open';
create index if not exists cash_drawers_venue_idx on public.cash_drawers(venue_id, opened_at desc);

alter table public.cash_drawers enable row level security;
drop policy if exists "cash_drawers_rw" on public.cash_drawers;
create policy "cash_drawers_rw" on public.cash_drawers for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());

-- expected physical cash in the drawer for a window: opening float + cash sales
-- (incl. cash tips, which physically land in the drawer) since it opened.
create or replace function public.cash_expected(p_venue_id uuid, p_from timestamptz, p_to timestamptz, p_opening numeric)
returns numeric
language sql
security definer
set search_path = public
as $$
  select round(coalesce(p_opening, 0)
    + coalesce((select sum(price_total + coalesce(tip_amount, 0))
        from public.sessions
        where venue_id = p_venue_id and payment_method = 'cash' and status = 'completed'
          and refunded_at is null and ended_at between p_from and p_to), 0)
    + coalesce((select sum(total + coalesce(tip_amount, 0))
        from public.bar_sales
        where venue_id = p_venue_id and payment_method = 'cash'
          and voided_at is null and created_at between p_from and p_to), 0), 2);
$$;

-- opener display name (linked employee name, else email local-part)
create or replace function public.cash_opener_name(p_org uuid, p_uid uuid)
returns text language sql security definer set search_path = public, auth as $$
  select coalesce(
    (select name from public.employees where user_id = p_uid and org_id = p_org limit 1),
    (select split_part(email, '@', 1) from auth.users where id = p_uid)
  );
$$;

create or replace function public.open_cash_drawer(p_venue_id uuid, p_opening_cash numeric default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null or not is_org_member(v_org) then raise exception 'unauthorized'; end if;

  if exists (select 1 from public.cash_drawers where venue_id = p_venue_id and status = 'open') then
    return jsonb_build_object('ok', false, 'error', 'already_open');
  end if;

  insert into public.cash_drawers (org_id, venue_id, opened_by, opening_cash)
  values (v_org, p_venue_id, auth.uid(), coalesce(p_opening_cash, 0))
  returning id into v_id;

  perform public.log_audit(v_org, p_venue_id, 'cash.drawer_open', 'cash_drawer', v_id::text,
    jsonb_build_object('opening', coalesce(p_opening_cash, 0)));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.open_cash_drawer(uuid, numeric) from public, anon;
grant execute on function public.open_cash_drawer(uuid, numeric) to authenticated;

create or replace function public.get_open_drawer(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_d   public.cash_drawers%rowtype;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null or not is_org_member(v_org) then raise exception 'unauthorized'; end if;

  select * into v_d from public.cash_drawers
   where venue_id = p_venue_id and status = 'open' limit 1;
  if not found then return jsonb_build_object('ok', true, 'open', false); end if;

  return jsonb_build_object(
    'ok', true, 'open', true,
    'id', v_d.id,
    'opened_at', v_d.opened_at,
    'opening_cash', v_d.opening_cash,
    'opened_by', public.cash_opener_name(v_org, v_d.opened_by),
    'expected_cash', public.cash_expected(p_venue_id, v_d.opened_at, now(), v_d.opening_cash)
  );
end;
$$;
revoke all on function public.get_open_drawer(uuid) from public, anon;
grant execute on function public.get_open_drawer(uuid) to authenticated;

create or replace function public.close_cash_drawer(p_venue_id uuid, p_closing_cash numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid;
  v_d        public.cash_drawers%rowtype;
  v_expected numeric(10,2);
  v_diff     numeric(10,2);
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null or not is_org_member(v_org) then raise exception 'unauthorized'; end if;

  select * into v_d from public.cash_drawers
   where venue_id = p_venue_id and status = 'open' limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_open_drawer'); end if;

  v_expected := public.cash_expected(p_venue_id, v_d.opened_at, now(), v_d.opening_cash);
  v_diff     := round(coalesce(p_closing_cash, 0) - v_expected, 2);

  update public.cash_drawers
     set status = 'closed', closed_by = auth.uid(), closed_at = now(),
         closing_cash = coalesce(p_closing_cash, 0), expected_cash = v_expected,
         difference = v_diff, note = p_note
   where id = v_d.id;

  -- keep the existing reconciliation audit trail
  insert into public.cash_reconciliations
    (org_id, venue_id, shift_id, period_from, period_to, expected_cash, actual_cash, note, reconciled_by)
  values
    (v_org, p_venue_id, null, v_d.opened_at, now(), v_expected, coalesce(p_closing_cash, 0), p_note, auth.uid());

  perform public.log_audit(v_org, p_venue_id, 'cash.drawer_close', 'cash_drawer', v_d.id::text,
    jsonb_build_object('expected', v_expected, 'actual', coalesce(p_closing_cash, 0), 'difference', v_diff));

  return jsonb_build_object('ok', true, 'expected', v_expected, 'actual', coalesce(p_closing_cash, 0),
    'difference', v_diff, 'alert', abs(v_diff) > 5);
end;
$$;
revoke all on function public.close_cash_drawer(uuid, numeric, text) from public, anon;
grant execute on function public.close_cash_drawer(uuid, numeric, text) to authenticated;
