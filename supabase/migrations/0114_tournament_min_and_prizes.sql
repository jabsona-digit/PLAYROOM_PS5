-- 0114 - Tournament economics: a minimum-participants gate (so the club never runs a
-- tournament at a loss — 4×20 GEL collected vs a 200 GEL prize = -120) + a 1st/2nd/3rd
-- prize structure (1st money, 2nd less money, 3rd free play-time minutes). The draw is
-- BLOCKED server-side until min_participants is met. ASCII only.

alter table public.tournaments
  add column if not exists min_participants    int,             -- null/0 = no minimum
  add column if not exists prize_second        numeric not null default 0,
  add column if not exists prize_third_minutes int     not null default 0;

-- draw v3: enforce min_participants (after walk-ins + checked-in online become participants)
create or replace function public.draw_tournament_groups(p_tournament uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_format text; v_min int; r record; v_pid uuid; v_n int; v_result jsonb;
begin
  select org_id, format, min_participants into v_org, v_format, v_min
    from public.tournaments where id = p_tournament;
  if v_org is null then raise exception 'tournament_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament) then
    raise exception 'already_drawn';
  end if;

  -- checked-in online registrations become participants (random order); walk-ins already are
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
  if coalesce(v_min, 0) > 0 and v_n < v_min then
    raise exception 'below_minimum:%:%', v_n, v_min;  -- frontend parses got:need
  end if;

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

-- expose the prize structure on the public marketplace view (drop+create: column order changed)
drop view if exists public.public_tournaments;
create view public.public_tournaments
with (security_invoker = false) as
select
  t.id, t.name, t.game, t.format, t.status,
  t.entry_fee, t.prize_pool, t.prize_second, t.prize_third_minutes, t.min_participants,
  t.starts_at, t.group_size, t.advance_per_group, t.max_participants,
  (select count(*) from public.tournament_participants p where p.tournament_id = t.id) as participant_count,
  case when v.is_published then v.slug else null end as venue_slug,
  v.name as venue_name, v.city as venue_city, v.cover_image_url as venue_cover, v.venue_type as venue_type
from public.tournaments t
left join public.venues v on v.id = t.venue_id
where t.is_public = true
  and t.status in ('seeking_host', 'registration', 'active', 'completed');
grant select on public.public_tournaments to anon, authenticated;
