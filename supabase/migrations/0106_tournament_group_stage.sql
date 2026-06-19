-- 0106 - Tournaments 2.0 Phase 1: group stage (round-robin, 3/1/0) + knockout from groups.
-- Builds ON the existing single-elim engine (0037: seed_tournament / report_match /
-- _advance_winner) WITHOUT breaking it. New format 'groups_knockout': groups of N play
-- round-robin (draws allowed), top `advance_per_group` go to a knockout bracket.
-- ASCII only (group labels A,B,C…; the frontend prefixes "ჯგუფი").

-- 1) schema
alter table public.tournaments
  add column if not exists group_size        int  not null default 4,
  add column if not exists advance_per_group  int  not null default 2,
  add column if not exists phase              text;  -- null | 'groups' | 'knockout'

-- allow the new format (was single_elim-only)
alter table public.tournaments drop constraint if exists tournaments_format_check;
alter table public.tournaments
  add constraint tournaments_format_check check (format in ('single_elim', 'groups_knockout'));

alter table public.tournament_matches
  add column if not exists group_id uuid,
  add column if not exists stage    text not null default 'knockout';  -- existing single-elim = knockout
-- group matches have no bracket round/position
alter table public.tournament_matches alter column round drop not null;
alter table public.tournament_matches alter column position drop not null;

alter table public.tournament_participants
  add column if not exists group_id uuid;

create table if not exists public.tournament_groups (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  label         text not null,
  created_at    timestamptz not null default now()
);
alter table public.tournament_groups enable row level security;
create policy tg_member_read on public.tournament_groups for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
revoke all on public.tournament_groups from anon;

-- 2) seed_group_stage: shuffle, distribute evenly into groups, generate round-robin matches
create or replace function public.seed_group_stage(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid; v_gsize int; v_parts uuid[]; v_n int; v_ngroups int;
  g int; v_group uuid; v_members uuid[]; i int; j int;
begin
  select org_id, coalesce(group_size, 4) into v_org, v_gsize from public.tournaments where id = p_tournament;
  if v_org is null then raise exception 'tournament_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament) then raise exception 'already_seeded'; end if;

  select array_agg(id order by random()) into v_parts
    from public.tournament_participants where tournament_id = p_tournament;
  v_n := coalesce(array_length(v_parts, 1), 0);
  if v_n < 3 then raise exception 'need_three_participants'; end if;

  v_ngroups := ceil(v_n::numeric / greatest(v_gsize, 2));

  for g in 0 .. v_ngroups - 1 loop
    insert into public.tournament_groups (tournament_id, org_id, label)
      values (p_tournament, v_org, chr(65 + g)) returning id into v_group;
    -- round-robin distribution → even group sizes
    for i in 1 .. v_n loop
      if ((i - 1) % v_ngroups) = g then
        update public.tournament_participants set group_id = v_group where id = v_parts[i];
      end if;
    end loop;
    -- every pair within the group plays once
    select array_agg(id order by id) into v_members from public.tournament_participants where group_id = v_group;
    for i in 1 .. coalesce(array_length(v_members, 1), 0) loop
      for j in i + 1 .. coalesce(array_length(v_members, 1), 0) loop
        insert into public.tournament_matches (tournament_id, org_id, group_id, stage, p1_id, p2_id, status)
          values (p_tournament, v_org, v_group, 'group', v_members[i], v_members[j], 'pending');
      end loop;
    end loop;
  end loop;

  update public.tournaments set status = 'active', phase = 'groups' where id = p_tournament;
end;
$$;
revoke all on function public.seed_group_stage(uuid) from public, anon;
grant execute on function public.seed_group_stage(uuid) to authenticated;

-- 3) report_match v2: group matches allow draws + don't advance; knockout unchanged
create or replace function public.report_match(p_match uuid, p_score1 integer, p_score2 integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_p1 uuid; v_p2 uuid; v_status text; v_stage text; w uuid;
begin
  select org_id, p1_id, p2_id, status, coalesce(stage, 'knockout')
    into v_org, v_p1, v_p2, v_status, v_stage
    from public.tournament_matches where id = p_match;
  if v_org is null then raise exception 'match_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_status = 'done' then raise exception 'already_reported'; end if;
  if v_p1 is null or v_p2 is null then raise exception 'match_not_ready'; end if;

  if v_stage = 'group' then
    update public.tournament_matches
       set score1 = p_score1, score2 = p_score2, status = 'done',
           winner_id = case when p_score1 > p_score2 then v_p1
                            when p_score2 > p_score1 then v_p2 else null end
     where id = p_match;
    return;  -- standings are computed; no bracket advancement
  end if;

  if p_score1 = p_score2 then raise exception 'no_draws'; end if;  -- knockout needs a winner
  w := case when p_score1 > p_score2 then v_p1 else v_p2 end;
  update public.tournament_matches set score1 = p_score1, score2 = p_score2, winner_id = w, status = 'done' where id = p_match;
  perform public._advance_winner(p_match, w);
end;
$$;

-- 4) get_group_standings: per group, ranked rows (W=3, D=1, L=0; tiebreak points→GD→GF)
create or replace function public.get_group_standings(p_tournament uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from public.tournaments where id = p_tournament;
  if v_org is null then return jsonb_build_object('error', 'not_found'); end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'not_authorized' using errcode = '42501'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('group', label, 'group_id', gid, 'rows', rows) order by label)
    from (
      select g.id gid, g.label,
        (select jsonb_agg(row order by (row->>'points')::int desc, (row->>'gd')::int desc, (row->>'gf')::int desc)
           from (
             select jsonb_build_object(
               'participant_id', pt.id, 'participant', pt.name,
               'played', s.played, 'won', s.won, 'drawn', s.drawn, 'lost', s.lost,
               'gf', s.gf, 'ga', s.ga, 'gd', s.gf - s.ga, 'points', s.won * 3 + s.drawn
             ) as row
             from public.tournament_participants pt
             cross join lateral (
               select
                 count(*) filter (where m.status = 'done') as played,
                 count(*) filter (where m.status = 'done' and m.winner_id = pt.id) as won,
                 count(*) filter (where m.status = 'done' and m.winner_id is null) as drawn,
                 count(*) filter (where m.status = 'done' and m.winner_id is not null and m.winner_id <> pt.id) as lost,
                 coalesce(sum(case when m.p1_id = pt.id then m.score1 when m.p2_id = pt.id then m.score2 end) filter (where m.status = 'done'), 0) as gf,
                 coalesce(sum(case when m.p1_id = pt.id then m.score2 when m.p2_id = pt.id then m.score1 end) filter (where m.status = 'done'), 0) as ga
               from public.tournament_matches m
               where m.group_id = g.id and (m.p1_id = pt.id or m.p2_id = pt.id)
             ) s
             where pt.group_id = g.id
           ) x
        ) as rows
      from public.tournament_groups g where g.tournament_id = p_tournament
    ) grp
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_group_standings(uuid) from public, anon;
grant execute on function public.get_group_standings(uuid) to authenticated;

-- 5) start_knockout_from_groups: top advance_per_group qualify → seed knockout bracket
create or replace function public.start_knockout_from_groups(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid; v_adv int; v_quals uuid[]; v_n int; v_b int; v_rounds int;
  r int; cnt int; pos int; half int; i int; m_id uuid; w uuid; v_open int;
begin
  select org_id, coalesce(advance_per_group, 2) into v_org, v_adv from public.tournaments where id = p_tournament;
  if v_org is null then raise exception 'tournament_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select count(*) into v_open from public.tournament_matches where tournament_id = p_tournament and stage = 'group' and status <> 'done';
  if v_open > 0 then raise exception 'group_stage_incomplete'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament and stage = 'knockout') then raise exception 'knockout_already_started'; end if;

  -- qualifiers (v1 seeding: by rank then group; same-group R1 avoidance is a later refinement)
  select array_agg(pid order by rnk, grp) into v_quals from (
    select (rw->>'participant_id')::uuid pid, gg->>'group' grp,
           row_number() over (partition by gg->>'group'
             order by (rw->>'points')::int desc, (rw->>'gd')::int desc, (rw->>'gf')::int desc) rnk
    from jsonb_array_elements(public.get_group_standings(p_tournament)) gg
    cross join lateral jsonb_array_elements(gg->'rows') rw
  ) q where rnk <= v_adv;

  v_n := coalesce(array_length(v_quals, 1), 0);
  if v_n < 2 then raise exception 'need_two_qualifiers'; end if;

  v_b := 2; while v_b < v_n loop v_b := v_b * 2; end loop;
  v_rounds := 0; r := v_b; while r > 1 loop v_rounds := v_rounds + 1; r := r / 2; end loop;

  r := 1; cnt := v_b / 2;
  while r <= v_rounds loop
    pos := 0;
    while pos < cnt loop
      insert into public.tournament_matches (tournament_id, org_id, round, position, stage)
        values (p_tournament, v_org, r, pos, 'knockout');
      pos := pos + 1;
    end loop;
    r := r + 1; cnt := cnt / 2;
  end loop;

  update public.tournament_matches m
     set next_match_id = parent.id, next_slot = case when (m.position % 2) = 0 then 1 else 2 end
    from public.tournament_matches parent
   where m.tournament_id = p_tournament and m.stage = 'knockout'
     and parent.tournament_id = p_tournament and parent.stage = 'knockout'
     and parent.round = m.round + 1 and parent.position = m.position / 2;

  half := v_b / 2;
  for i in 0 .. half - 1 loop
    if i < v_n then
      update public.tournament_matches set p1_id = v_quals[i + 1]
       where tournament_id = p_tournament and stage = 'knockout' and round = 1 and position = i;
    end if;
  end loop;
  for i in half .. v_n - 1 loop
    update public.tournament_matches set p2_id = v_quals[i + 1]
     where tournament_id = p_tournament and stage = 'knockout' and round = 1 and position = (i - half);
  end loop;

  for m_id, w in
    select id, p1_id from public.tournament_matches
     where tournament_id = p_tournament and stage = 'knockout' and round = 1 and p1_id is not null and p2_id is null
  loop
    update public.tournament_matches set winner_id = w, status = 'done' where id = m_id;
    perform public._advance_winner(m_id, w);
  end loop;

  update public.tournaments set phase = 'knockout', bracket_size = v_b where id = p_tournament;
end;
$$;
revoke all on function public.start_knockout_from_groups(uuid) from public, anon;
grant execute on function public.start_knockout_from_groups(uuid) to authenticated;
