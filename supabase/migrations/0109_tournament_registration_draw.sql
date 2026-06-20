-- 0109 - Tournaments 2.0 Phase 3: paid online registration -> QR pass -> scan check-in
-- (pay-at-venue) -> server-fair virtual draw -> group seeding + commission tracking.
-- Customers (marketplace_customers, id = auth.uid()) register online; each registration id
-- is the QR payload (client encodes 'MTLT:<id>'). The host operator scans -> checks in +
-- collects the entry fee at the venue. The draw randomly turns CHECKED-IN players into
-- tournament_participants and seeds the group stage (reuses 0106 seed_group_stage). ASCII only.

-- 1) registrations
create table if not exists public.tournament_registrations (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  customer_id    uuid not null,                       -- = auth.uid() / marketplace_customers.id
  display_name   text not null,
  phone          text,
  status         text not null default 'registered' check (status in ('registered', 'checked_in', 'cancelled')),
  paid_amount    numeric,
  paid_method    text,
  paid_at        timestamptz,
  checked_in_at  timestamptz,
  participant_id uuid,                                -- set by the draw
  created_at     timestamptz not null default now(),
  unique (tournament_id, customer_id)
);
create index if not exists idx_treg_tournament on public.tournament_registrations (tournament_id);
alter table public.tournament_registrations enable row level security;
drop policy if exists tr_read on public.tournament_registrations;
create policy tr_read on public.tournament_registrations for select to authenticated
  using (
    customer_id = auth.uid()
    or public.is_platform_admin()
    or public.is_org_member((select t.org_id from public.tournaments t where t.id = tournament_id))
  );
revoke all on public.tournament_registrations from anon;
-- all writes go through the SECURITY DEFINER RPCs below (no direct insert/update policy)

-- 2) register_for_tournament: customer signs up online (auth.uid())
create or replace function public.register_for_tournament(p_tournament uuid, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_status text; v_max int; v_cnt int; v_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;

  select status, max_participants into v_status, v_max
    from public.tournaments where id = p_tournament and is_public = true;
  if v_status is null then raise exception 'tournament_not_found'; end if;
  if v_status <> 'registration' then raise exception 'registration_closed'; end if;

  if v_max is not null then
    select count(*) into v_cnt from public.tournament_registrations
      where tournament_id = p_tournament and status in ('registered', 'checked_in');
    if v_cnt >= v_max
       and not exists (select 1 from public.tournament_registrations
                       where tournament_id = p_tournament and customer_id = v_uid) then
      raise exception 'tournament_full';
    end if;
  end if;

  insert into public.marketplace_customers (id, full_name, phone)
    values (v_uid, p_name, nullif(p_phone, ''))
    on conflict (id) do update
      set full_name = coalesce(nullif(excluded.full_name, ''), public.marketplace_customers.full_name),
          phone     = coalesce(nullif(excluded.phone, ''), public.marketplace_customers.phone);

  insert into public.tournament_registrations (tournament_id, customer_id, display_name, phone, status)
    values (p_tournament, v_uid, p_name, nullif(p_phone, ''), 'registered')
    on conflict (tournament_id, customer_id) do update
      set display_name = excluded.display_name,
          phone        = excluded.phone,
          status       = case when public.tournament_registrations.status = 'checked_in'
                              then 'checked_in' else 'registered' end
    returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.register_for_tournament(uuid, text, text) from public, anon;
grant execute on function public.register_for_tournament(uuid, text, text) to authenticated;

-- 3) get_my_tournament_registrations: customer's passes for /account
create or replace function public.get_my_tournament_registrations()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'registration_id', r.id, 'status', r.status, 'paid_amount', r.paid_amount,
      'name', t.name, 'game', t.game, 'starts_at', t.starts_at, 'entry_fee', t.entry_fee,
      't_status', t.status, 'venue_name', v.name, 'venue_city', v.city
    ) order by t.starts_at nulls last)
    from public.tournament_registrations r
    join public.tournaments t on t.id = r.tournament_id
    left join public.venues v on v.id = t.venue_id
    where r.customer_id = v_uid
  ), '[]'::jsonb);
end; $$;
revoke all on function public.get_my_tournament_registrations() from public, anon;
grant execute on function public.get_my_tournament_registrations() to authenticated;

-- 4) checkin_tournament_registration: operator scans the QR + collects fee at the venue
create or replace function public.checkin_tournament_registration(p_registration uuid, p_method text, p_amount numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_t uuid; v_status text; v_name text; v_phone text; v_fee numeric;
        v_tname text; v_already boolean := false; v_paid numeric;
begin
  select r.tournament_id, r.status, r.display_name, r.phone, t.org_id, t.entry_fee, t.name
    into v_t, v_status, v_name, v_phone, v_org, v_fee, v_tname
    from public.tournament_registrations r
    join public.tournaments t on t.id = r.tournament_id
    where r.id = p_registration;
  if v_t is null then raise exception 'registration_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_status = 'cancelled' then raise exception 'registration_cancelled'; end if;

  if v_status = 'checked_in' then
    v_already := true;
    select paid_amount into v_paid from public.tournament_registrations where id = p_registration;
  else
    update public.tournament_registrations
      set status = 'checked_in', paid_method = nullif(p_method, ''),
          paid_amount = coalesce(p_amount, v_fee), paid_at = now(), checked_in_at = now()
      where id = p_registration;
    v_paid := coalesce(p_amount, v_fee);
  end if;

  return jsonb_build_object('ok', true, 'already', v_already, 'display_name', v_name,
    'phone', v_phone, 'status', 'checked_in', 'paid_amount', v_paid, 'tournament', v_tname);
end; $$;
revoke all on function public.checkin_tournament_registration(uuid, text, numeric) from public, anon;
grant execute on function public.checkin_tournament_registration(uuid, text, numeric) to authenticated;

-- 5) get_tournament_registrations: operator/God-Mode list for the admin detail
create or replace function public.get_tournament_registrations(p_tournament uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.tournaments where id = p_tournament;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'display_name', display_name, 'phone', phone, 'status', status,
      'paid_amount', paid_amount, 'paid_method', paid_method, 'checked_in_at', checked_in_at
    ) order by created_at)
    from public.tournament_registrations where tournament_id = p_tournament
  ), '[]'::jsonb);
end; $$;
revoke all on function public.get_tournament_registrations(uuid) from public, anon;
grant execute on function public.get_tournament_registrations(uuid) to authenticated;

-- 6) draw_tournament_groups: server-fair virtual draw -> participants -> seed group stage
create or replace function public.draw_tournament_groups(p_tournament uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_format text; r record; v_pid uuid; v_n int; v_result jsonb;
begin
  select org_id, format into v_org, v_format from public.tournaments where id = p_tournament;
  if v_org is null then raise exception 'tournament_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.tournament_participants where tournament_id = p_tournament) then
    raise exception 'already_drawn';
  end if;

  -- checked-in players become participants in RANDOM order (the fair "virtual draw")
  for r in
    select id, display_name, phone from public.tournament_registrations
     where tournament_id = p_tournament and status = 'checked_in'
     order by random()
  loop
    insert into public.tournament_participants (tournament_id, org_id, name, phone)
      values (p_tournament, v_org, r.display_name, r.phone) returning id into v_pid;
    update public.tournament_registrations set participant_id = v_pid where id = r.id;
  end loop;

  select count(*) into v_n from public.tournament_participants where tournament_id = p_tournament;
  if v_n < 2 then raise exception 'need_two_checked_in'; end if;

  if v_format = 'groups_knockout' then
    perform public.seed_group_stage(p_tournament);   -- shuffles into groups + builds round-robin
    select jsonb_build_object('format', 'groups_knockout', 'groups',
      coalesce(jsonb_agg(grp order by grp->>'group'), '[]'::jsonb)) into v_result
      from (
        select jsonb_build_object('group', g.label, 'players',
          coalesce((select jsonb_agg(pt.name order by pt.name)
                    from public.tournament_participants pt where pt.group_id = g.id), '[]'::jsonb)) as grp
        from public.tournament_groups g where g.tournament_id = p_tournament
      ) x;
  else
    perform public.seed_tournament(p_tournament);
    select jsonb_build_object('format', 'single_elim', 'players',
      coalesce(jsonb_agg(name order by created_at), '[]'::jsonb)) into v_result
      from public.tournament_participants where tournament_id = p_tournament;
  end if;

  return coalesce(v_result, jsonb_build_object('ok', true));
end; $$;
revoke all on function public.draw_tournament_groups(uuid) from public, anon;
grant execute on function public.draw_tournament_groups(uuid) to authenticated;

-- 7) set_tournament_commission: God Mode sets the platform commission %
create or replace function public.set_tournament_commission(p_tournament uuid, p_pct numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.tournaments
     set commission_pct = greatest(0, least(100, coalesce(p_pct, 0)))
   where id = p_tournament and creator_scope = 'platform';
end; $$;
revoke all on function public.set_tournament_commission(uuid, numeric) from public, anon;
grant execute on function public.set_tournament_commission(uuid, numeric) to authenticated;

-- 8) list_platform_tournaments v2: add registration counts + collected + commission_due
create or replace function public.list_platform_tournaments()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'game', t.game, 'status', t.status,
      'entry_fee', t.entry_fee, 'prize_pool', t.prize_pool, 'starts_at', t.starts_at,
      'agreed_amount', t.agreed_amount, 'is_public', t.is_public, 'commission_pct', t.commission_pct,
      'host_venue', (select v.name from public.venues v where v.id = t.venue_id),
      'host_org', (select g.name from public.organizations g where g.id = t.host_org_id),
      'registered_count', (select count(*) from public.tournament_registrations r
                            where r.tournament_id = t.id and r.status in ('registered', 'checked_in')),
      'checked_in_count', (select count(*) from public.tournament_registrations r
                           where r.tournament_id = t.id and r.status = 'checked_in'),
      'collected', (select coalesce(sum(r.paid_amount), 0) from public.tournament_registrations r
                    where r.tournament_id = t.id and r.status = 'checked_in'),
      'commission_due', round((select coalesce(sum(r.paid_amount), 0) from public.tournament_registrations r
                    where r.tournament_id = t.id and r.status = 'checked_in') * coalesce(t.commission_pct, 0) / 100.0, 2),
      'offers', (
        select jsonb_agg(jsonb_build_object(
          'id', o.id, 'status', o.status, 'note', o.note,
          'proposed_amount', o.proposed_amount, 'agreed_amount', o.agreed_amount,
          'venue', (select v.name from public.venues v where v.id = o.venue_id),
          'org', (select g.name from public.organizations g where g.id = o.org_id)
        ) order by o.created_at)
        from public.tournament_host_offers o where o.tournament_id = t.id)
    ) order by t.created_at desc)
    from public.tournaments t where t.creator_scope = 'platform'
  ), '[]'::jsonb);
end; $$;
revoke all on function public.list_platform_tournaments() from public, anon;
grant execute on function public.list_platform_tournaments() to authenticated;
