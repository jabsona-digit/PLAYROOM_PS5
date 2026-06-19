-- 0107 - Tournaments 2.0 Phase 2: platform-created tournaments + venue host-bidding.
-- Platform admin (God Mode) creates a tournament with NO host yet (status 'seeking_host');
-- ALL linked tenant owners get a Telegram invite + see it under "hosting opportunities";
-- owners submit a host OFFER (venue + proposed terms); platform accepts ONE → host org/venue
-- set, status -> 'registration', the winner is notified. Platform never custodies funds
-- (pay-at-venue; agreed_amount = the hosting deal). Builds on 0037 + 0106. Georgian in bodies.

-- 1) schema: tournaments can be platform-owned + host-less until accepted
alter table public.tournaments
  add column if not exists creator_scope text    not null default 'tenant',
  add column if not exists is_public     boolean not null default false,
  add column if not exists host_org_id   uuid references public.organizations(id),
  add column if not exists commission_pct numeric not null default 0,
  add column if not exists agreed_amount  numeric;

-- platform tournaments have no org/venue until a host is accepted
alter table public.tournaments alter column org_id   drop not null;
alter table public.tournaments alter column venue_id drop not null;

alter table public.tournaments drop constraint if exists tournaments_creator_scope_check;
alter table public.tournaments
  add constraint tournaments_creator_scope_check check (creator_scope in ('tenant', 'platform'));

-- add 'seeking_host' to the lifecycle (registration here = open for player sign-ups)
alter table public.tournaments drop constraint if exists tournaments_status_check;
alter table public.tournaments
  add constraint tournaments_status_check
  check (status in ('seeking_host', 'registration', 'active', 'completed', 'cancelled'));

-- 2) host offers (one per org per tournament)
create table if not exists public.tournament_host_offers (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  venue_id        uuid not null references public.venues(id) on delete cascade,
  status          text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'withdrawn')),
  note            text,
  proposed_amount numeric,
  agreed_amount   numeric,
  created_at      timestamptz not null default now(),
  unique (tournament_id, org_id)
);
alter table public.tournament_host_offers enable row level security;
drop policy if exists tho_read on public.tournament_host_offers;
drop policy if exists tho_write on public.tournament_host_offers;
create policy tho_read on public.tournament_host_offers for select to authenticated
  using (public.is_platform_admin() or public.is_org_admin(org_id));
create policy tho_write on public.tournament_host_offers for all to authenticated
  using (public.is_platform_admin() or public.is_org_admin(org_id))
  with check (public.is_platform_admin() or public.is_org_admin(org_id));
revoke all on public.tournament_host_offers from anon;

-- 3) RLS: platform admin can manage tournaments (incl. host-less ones); tenants keep their org
drop policy if exists t_all on public.tournaments;
drop policy if exists t_read on public.tournaments;
drop policy if exists t_ins on public.tournaments;
drop policy if exists t_upd on public.tournaments;
drop policy if exists t_del on public.tournaments;
create policy t_read on public.tournaments for select to authenticated
  using (public.is_platform_admin() or public.is_org_member(org_id));
create policy t_ins on public.tournaments for insert to authenticated
  with check (public.is_platform_admin() or public.is_org_member(org_id));
create policy t_upd on public.tournaments for update to authenticated
  using (public.is_platform_admin() or public.is_org_member(org_id))
  with check (public.is_platform_admin() or public.is_org_member(org_id));
create policy t_del on public.tournaments for delete to authenticated
  using (public.is_platform_admin() or public.is_org_member(org_id));

-- 4) make sure every linked org receives tournament invites by default
update public.organizations
   set telegram_alerts = coalesce(telegram_alerts, '{}'::jsonb) || '{"tournament":true}'::jsonb
 where not (coalesce(telegram_alerts, '{}'::jsonb) ? 'tournament');

-- 5) create_platform_tournament: God Mode creates a seeking_host tournament + invites all owners
create or replace function public.create_platform_tournament(
  p_name text, p_game text, p_format text, p_group_size int, p_advance int,
  p_entry_fee numeric, p_prize_pool numeric, p_starts_at timestamptz, p_max int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; o record; v_msg text;
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.tournaments (name, game, format, group_size, advance_per_group,
      entry_fee, prize_pool, starts_at, max_participants, status, creator_scope, is_public)
    values (p_name, nullif(p_game, ''), coalesce(p_format, 'groups_knockout'),
      coalesce(p_group_size, 4), coalesce(p_advance, 2),
      coalesce(p_entry_fee, 0), coalesce(p_prize_pool, 0), p_starts_at, p_max,
      'seeking_host', 'platform', true)
    returning id into v_id;

  v_msg := '🏆 ახალი პლატფორმის ტურნირი: ' || p_name ||
    case when coalesce(p_game, '') <> '' then ' (' || p_game || ')' else '' end ||
    E'\n💰 საწევრო ' || coalesce(p_entry_fee, 0)::text || ' GEL · პრიზი ' || coalesce(p_prize_pool, 0)::text || ' GEL' ||
    case when p_starts_at is not null
      then E'\n📅 ' || to_char(p_starts_at at time zone 'Asia/Tbilisi', 'DD.MM.YYYY HH24:MI') else '' end ||
    E'\n\nუმასპინძლეთ თქვენს სივრცეში — პანელი → ტურნირები → ჰოსტინგის შესაძლებლობები.';

  for o in select id from public.organizations where telegram_chat_id is not null loop
    begin perform public.notify_telegram_org(o.id, 'tournament', v_msg); exception when others then null; end;
  end loop;
  return v_id;
end; $$;
revoke all on function public.create_platform_tournament(text, text, text, int, int, numeric, numeric, timestamptz, int) from public, anon;
grant execute on function public.create_platform_tournament(text, text, text, int, int, numeric, numeric, timestamptz, int) to authenticated;

-- 6) submit_host_offer: an org admin offers their venue to host
create or replace function public.submit_host_offer(p_tournament uuid, p_venue_id uuid, p_note text, p_proposed numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_status text; v_id uuid;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null then raise exception 'venue_not_found'; end if;
  if not public.is_org_admin(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select status into v_status from public.tournaments where id = p_tournament and creator_scope = 'platform';
  if v_status is null then raise exception 'tournament_not_found'; end if;
  if v_status <> 'seeking_host' then raise exception 'not_open_for_offers'; end if;

  insert into public.tournament_host_offers (tournament_id, org_id, venue_id, note, proposed_amount, status)
    values (p_tournament, v_org, p_venue_id, nullif(p_note, ''), p_proposed, 'offered')
    on conflict (tournament_id, org_id) do update
      set venue_id = excluded.venue_id, note = excluded.note,
          proposed_amount = excluded.proposed_amount, status = 'offered', created_at = now()
    returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.submit_host_offer(uuid, uuid, text, numeric) from public, anon;
grant execute on function public.submit_host_offer(uuid, uuid, text, numeric) to authenticated;

-- 7) accept_host_offer: God Mode picks ONE offer → host set, registration opens, winner notified
create or replace function public.accept_host_offer(p_offer uuid, p_agreed numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare v_t uuid; v_org uuid; v_venue uuid; v_name text; v_msg text;
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select tournament_id, org_id, venue_id into v_t, v_org, v_venue
    from public.tournament_host_offers where id = p_offer;
  if v_t is null then raise exception 'offer_not_found'; end if;

  update public.tournaments
     set org_id = v_org, venue_id = v_venue, host_org_id = v_org,
         agreed_amount = p_agreed, status = 'registration'
   where id = v_t and status = 'seeking_host';
  if not found then raise exception 'tournament_not_seeking'; end if;

  update public.tournament_host_offers set status = 'declined' where tournament_id = v_t and id <> p_offer;
  update public.tournament_host_offers set status = 'accepted', agreed_amount = p_agreed where id = p_offer;

  select name into v_name from public.tournaments where id = v_t;
  v_msg := '🏆 თქვენი ვენიუ შეირჩა ტურნირის „' || v_name || '" უმასპინძლებლად!' ||
    E'\nშეთანხმებული თანხა: ' || coalesce(p_agreed, 0)::text || ' GEL.' ||
    E'\nტურნირი გამოჩნდება play.martelounge.ge-ზე. პანელი → ტურნირები.';
  begin perform public.notify_telegram_org(v_org, 'tournament', v_msg); exception when others then null; end;
end; $$;
revoke all on function public.accept_host_offer(uuid, numeric) from public, anon;
grant execute on function public.accept_host_offer(uuid, numeric) to authenticated;

-- 8) list_hosting_opportunities: tenant-facing open platform tournaments + my org's offer
create or replace function public.list_hosting_opportunities()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'game', t.game, 'format', t.format,
      'entry_fee', t.entry_fee, 'prize_pool', t.prize_pool, 'starts_at', t.starts_at,
      'group_size', t.group_size, 'advance_per_group', t.advance_per_group,
      'my_offer', (
        select jsonb_build_object('id', o.id, 'status', o.status, 'venue_id', o.venue_id,
                 'proposed_amount', o.proposed_amount, 'agreed_amount', o.agreed_amount)
        from public.tournament_host_offers o
        where o.tournament_id = t.id and public.is_org_admin(o.org_id)
        order by o.created_at desc limit 1)
    ) order by t.starts_at nulls last, t.created_at desc)
    from public.tournaments t
    where t.creator_scope = 'platform' and t.status = 'seeking_host'
  ), '[]'::jsonb);
end; $$;
revoke all on function public.list_hosting_opportunities() from public, anon;
grant execute on function public.list_hosting_opportunities() to authenticated;

-- 9) list_platform_tournaments: God Mode dashboard — all platform tournaments + their offers
create or replace function public.list_platform_tournaments()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'game', t.game, 'status', t.status,
      'entry_fee', t.entry_fee, 'prize_pool', t.prize_pool, 'starts_at', t.starts_at,
      'agreed_amount', t.agreed_amount, 'is_public', t.is_public,
      'host_venue', (select v.name from public.venues v where v.id = t.venue_id),
      'host_org', (select g.name from public.organizations g where g.id = t.host_org_id),
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
