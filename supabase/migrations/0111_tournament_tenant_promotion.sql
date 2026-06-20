-- 0111 - Tournaments 2.0: tenant-initiated GLOBAL promotion (the mirror of host-bidding).
-- An owner creates a tournament in THEIR OWN venue and chooses "Global" -> a private request
-- goes to the platform admin (no other venues bid) -> platform approves with an agreed
-- commission % -> it becomes public on the marketplace. Owner proposes the %, platform agrees.
-- Global tournaments accept BOTH online registrations AND walk-in participants.
-- Reuses register/QR/check-in/draw/revenue. Georgian in notify bodies -> manual-escape apply.

-- 1) promotion lifecycle on the tournament itself (no separate table: request is 1:1)
alter table public.tournaments
  add column if not exists promotion_status        text,    -- null/local | pending | approved | rejected
  add column if not exists proposed_commission_pct  numeric, -- owner's proposed cut
  add column if not exists rejected_reason          text,
  add column if not exists promoted_at              timestamptz;

-- 2) public marketplace view: publish gate is now is_public alone (covers platform-hosted
--    AND approved tenant-global tournaments)
create or replace view public.public_tournaments
with (security_invoker = false) as
select
  t.id, t.name, t.game, t.format, t.status,
  t.entry_fee, t.prize_pool, t.starts_at, t.group_size, t.advance_per_group, t.max_participants,
  (select count(*) from public.tournament_participants p where p.tournament_id = t.id) as participant_count,
  case when v.is_published then v.slug else null end as venue_slug,
  v.name as venue_name, v.city as venue_city, v.cover_image_url as venue_cover, v.venue_type as venue_type
from public.tournaments t
left join public.venues v on v.id = t.venue_id
where t.is_public = true
  and t.status in ('seeking_host', 'registration', 'active', 'completed');
grant select on public.public_tournaments to anon, authenticated;

-- 3) submit_tournament_for_promotion: owner asks the platform to list their tournament
create or replace function public.submit_tournament_for_promotion(p_tournament uuid, p_commission numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_scope text; v_status text; v_pub boolean; v_name text; v_venue text; v_fee numeric; v_prize numeric; v_msg text;
begin
  select t.org_id, t.creator_scope, t.status, t.is_public, t.name, t.entry_fee, t.prize_pool, v.name
    into v_org, v_scope, v_status, v_pub, v_name, v_fee, v_prize, v_venue
    from public.tournaments t left join public.venues v on v.id = t.venue_id
    where t.id = p_tournament;
  if v_org is null then raise exception 'tournament_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_scope = 'platform' then raise exception 'use_host_bidding'; end if;
  if v_pub then raise exception 'already_public'; end if;
  if v_status <> 'registration' then raise exception 'already_started'; end if;

  update public.tournaments
     set promotion_status = 'pending', proposed_commission_pct = p_commission, rejected_reason = null
   where id = p_tournament;

  v_msg := '🌍 Global ტურნირის მოთხოვნა: „' || v_name || '"' ||
    case when v_venue is not null then E'\n🏠 ' || v_venue else '' end ||
    E'\n💰 საწევრო ' || coalesce(v_fee, 0)::text || ' GEL · პრიზი ' || coalesce(v_prize, 0)::text || ' GEL' ||
    E'\n🤝 შემოთავაზებული კომისია: ' || coalesce(p_commission, 0)::text || '%' ||
    E'\n\nGod Mode → Global მოთხოვნები — დაადასტურე ან უარყავი.';
  begin perform public.notify_platform_telegram('tournament', v_msg); exception when others then null; end;
end; $$;
revoke all on function public.submit_tournament_for_promotion(uuid, numeric) from public, anon;
grant execute on function public.submit_tournament_for_promotion(uuid, numeric) to authenticated;

-- 4) approve_tournament_promotion: platform agrees a final % and publishes
create or replace function public.approve_tournament_promotion(p_tournament uuid, p_commission numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_msg text;
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select org_id, name into v_org, v_name from public.tournaments
    where id = p_tournament and promotion_status = 'pending';
  if v_org is null then raise exception 'not_pending'; end if;

  update public.tournaments
     set promotion_status = 'approved', is_public = true,
         commission_pct = greatest(0, least(100, coalesce(p_commission, 0))), promoted_at = now()
   where id = p_tournament;

  v_msg := '✅ თქვენი ტურნირი „' || v_name || '" დადასტურდა და გამოქვეყნდა marketplace-ზე!' ||
    E'\n🤝 შეთანხმებული კომისია: ' || coalesce(p_commission, 0)::text || '%.' ||
    E'\nplay.martelounge.ge/tournaments — ონლაინ რეგისტრაცია ღიაა.';
  begin perform public.notify_telegram_org(v_org, 'tournament', v_msg); exception when others then null; end;
end; $$;
revoke all on function public.approve_tournament_promotion(uuid, numeric) from public, anon;
grant execute on function public.approve_tournament_promotion(uuid, numeric) to authenticated;

-- 5) reject_tournament_promotion: platform declines (tournament can still run locally)
create or replace function public.reject_tournament_promotion(p_tournament uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_msg text;
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  select org_id, name into v_org, v_name from public.tournaments
    where id = p_tournament and promotion_status = 'pending';
  if v_org is null then raise exception 'not_pending'; end if;

  update public.tournaments
     set promotion_status = 'rejected', is_public = false, rejected_reason = nullif(p_reason, '')
   where id = p_tournament;

  v_msg := '❌ ტურნირი „' || v_name || '" ვერ გამოქვეყნდა marketplace-ზე.' ||
    case when coalesce(p_reason, '') <> '' then E'\nმიზეზი: ' || p_reason else '' end ||
    E'\nშეგიძლია ჩაატარო ლოკალურად შენს playroom-ში.';
  begin perform public.notify_telegram_org(v_org, 'tournament', v_msg); exception when others then null; end;
end; $$;
revoke all on function public.reject_tournament_promotion(uuid, text) from public, anon;
grant execute on function public.reject_tournament_promotion(uuid, text) to authenticated;

-- 6) list_tenant_promotion_requests: God Mode queue of tenant-submitted global tournaments
create or replace function public.list_tenant_promotion_requests()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'game', t.game, 'status', t.status,
      'promotion_status', t.promotion_status, 'entry_fee', t.entry_fee, 'prize_pool', t.prize_pool,
      'starts_at', t.starts_at, 'proposed_commission_pct', t.proposed_commission_pct,
      'commission_pct', t.commission_pct, 'rejected_reason', t.rejected_reason,
      'venue', (select v.name from public.venues v where v.id = t.venue_id),
      'org', (select g.name from public.organizations g where g.id = t.org_id),
      'registered_count', (select count(*) from public.tournament_registrations r
                           where r.tournament_id = t.id and r.status in ('registered', 'checked_in')),
      'checked_in_count', (select count(*) from public.tournament_registrations r
                           where r.tournament_id = t.id and r.status = 'checked_in'),
      'collected', (select coalesce(sum(r.paid_amount), 0) from public.tournament_registrations r
                    where r.tournament_id = t.id and r.status = 'checked_in'),
      'commission_due', round((select coalesce(sum(r.paid_amount), 0) from public.tournament_registrations r
                    where r.tournament_id = t.id and r.status = 'checked_in') * coalesce(t.commission_pct, 0) / 100.0, 2)
    ) order by
      case t.promotion_status when 'pending' then 0 when 'approved' then 1 else 2 end,
      t.created_at desc)
    from public.tournaments t
    where t.creator_scope <> 'platform' and t.promotion_status is not null
  ), '[]'::jsonb);
end; $$;
revoke all on function public.list_tenant_promotion_requests() from public, anon;
grant execute on function public.list_tenant_promotion_requests() to authenticated;

-- 7) draw v2: include pre-existing WALK-IN participants alongside checked-in online players
create or replace function public.draw_tournament_groups(p_tournament uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_format text; r record; v_pid uuid; v_n int; v_result jsonb;
begin
  select org_id, format into v_org, v_format from public.tournaments where id = p_tournament;
  if v_org is null then raise exception 'tournament_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  -- already seeded? check MATCHES (participants may pre-exist as walk-ins)
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament) then
    raise exception 'already_drawn';
  end if;

  -- convert checked-in online registrations into participants (skip any already linked)
  for r in
    select id, display_name, phone from public.tournament_registrations
     where tournament_id = p_tournament and status = 'checked_in' and participant_id is null
     order by random()
  loop
    insert into public.tournament_participants (tournament_id, org_id, name, phone)
      values (p_tournament, v_org, r.display_name, r.phone) returning id into v_pid;
    update public.tournament_registrations set participant_id = v_pid where id = r.id;
  end loop;

  select count(*) into v_n from public.tournament_participants where tournament_id = p_tournament;
  if v_n < 2 then raise exception 'need_two_checked_in'; end if;

  if v_format = 'groups_knockout' then
    perform public.seed_group_stage(p_tournament);
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
