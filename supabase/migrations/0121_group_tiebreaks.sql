-- 0121 - Fair group-stage tiebreaks (owner question 2026-06-22: "what if a whole group of 4
-- finishes all 0-0 draws?"). Before: when players were level on points/GD/GF, WHO advanced
-- was arbitrary (DB row order) - a real fairness gap whenever 2+ players tie at the cutoff.
--
-- Hybrid resolution (owner-approved): for players tied AT THE QUALIFICATION BOUNDARY -
--   1) head-to-head: if exactly 2 tie for 1 slot and one beat the other in the group, they go;
--   2) PENALTIES: if those 2 drew, a penalty decider (stage='tiebreak') is auto-created; the
--      operator runs penalties in-game and reports the winner -> they advance;
--   3) LOTS (virtual draw): a 3+ way / multi-slot dead-heat is broken by a stable random draw
--      (md5(participant_id)) so the tournament never jams.
-- start_knockout_from_groups now RETURNS jsonb: {ok:true,seeded} or {ok:false,tiebreak_required}.
-- ASCII only (UI labels live in the frontend).

-- ── 1) report_match: treat 'tiebreak' like 'bronze' (record result, never advance/champion) ─
create or replace function public.report_match(p_match uuid, p_score1 integer, p_score2 integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_t uuid; v_p1 uuid; v_p2 uuid; v_status text; v_stage text; w uuid;
  v_nm uuid; v_final uuid;
begin
  select org_id, tournament_id, p1_id, p2_id, status, coalesce(stage, 'knockout'), next_match_id
    into v_org, v_t, v_p1, v_p2, v_status, v_stage, v_nm
    from public.tournament_matches where id = p_match;
  if v_org is null then raise exception 'match_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_status = 'done' then raise exception 'already_reported'; end if;
  if v_p1 is null or v_p2 is null then raise exception 'match_not_ready'; end if;

  -- group stage: draws allowed, standings computed, no advancement
  if v_stage = 'group' then
    update public.tournament_matches
       set score1 = p_score1, score2 = p_score2, status = 'done',
           winner_id = case when p_score1 > p_score2 then v_p1
                            when p_score2 > p_score1 then v_p2 else null end
     where id = p_match;
    return;
  end if;

  -- bronze (3rd-place) & tiebreak (penalty decider): record result only, no advance, no champion
  if v_stage in ('bronze', 'tiebreak') then
    if p_score1 = p_score2 then raise exception 'no_draws'; end if;
    w := case when p_score1 > p_score2 then v_p1 else v_p2 end;
    update public.tournament_matches
       set score1 = p_score1, score2 = p_score2, winner_id = w, status = 'done' where id = p_match;
    return;
  end if;

  -- knockout: needs a winner; advance the bracket
  if p_score1 = p_score2 then raise exception 'no_draws'; end if;
  w := case when p_score1 > p_score2 then v_p1 else v_p2 end;
  update public.tournament_matches
     set score1 = p_score1, score2 = p_score2, winner_id = w, status = 'done' where id = p_match;
  perform public._advance_winner(p_match, w);

  -- World-Cup bronze: this was a semifinal (feeds the final) & both semifinals decided -> spawn it
  if v_nm is not null
     and (select next_match_id from public.tournament_matches where id = v_nm) is null then
    v_final := v_nm;
    if not exists (select 1 from public.tournament_matches
                   where tournament_id = v_t and stage = 'bronze')
       and not exists (
         select 1 from public.tournament_matches sf
         where sf.tournament_id = v_t and coalesce(sf.stage, 'knockout') = 'knockout'
           and sf.next_match_id = v_final
           and (sf.status <> 'done' or sf.p1_id is null or sf.p2_id is null)
       ) then
      insert into public.tournament_matches (tournament_id, org_id, stage, status, p1_id, p2_id)
      select v_t, v_org, 'bronze', 'pending',
             (select loser_id from (
                select case when sf.winner_id = sf.p1_id then sf.p2_id else sf.p1_id end as loser_id,
                       row_number() over (order by sf.position) rn
                from public.tournament_matches sf
                where sf.tournament_id = v_t and coalesce(sf.stage, 'knockout') = 'knockout'
                  and sf.next_match_id = v_final) z where rn = 1),
             (select loser_id from (
                select case when sf.winner_id = sf.p1_id then sf.p2_id else sf.p1_id end as loser_id,
                       row_number() over (order by sf.position) rn
                from public.tournament_matches sf
                where sf.tournament_id = v_t and coalesce(sf.stage, 'knockout') = 'knockout'
                  and sf.next_match_id = v_final) z where rn = 2);
    end if;
  end if;
end; $$;
grant execute on function public.report_match(uuid, integer, integer) to authenticated;

-- ── 2) start_knockout_from_groups v2: tiebreak-aware qualifier selection -> jsonb status ─
drop function if exists public.start_knockout_from_groups(uuid);
create function public.start_knockout_from_groups(p_tournament uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_adv int; v_open int;
  v_stand jsonb; g_rec record; mrow record;
  v_qual_acc jsonb := '[]'::jsonb;   -- {pid, qrank, grp} per qualifier
  v_missing jsonb := '[]'::jsonb;    -- {a, b, group} penalty deciders still to play
  v_quals uuid[]; v_n int; v_b int; v_rounds int;
  r int; cnt int; pos int; half int; i int; m_id uuid; w uuid;
begin
  select org_id, coalesce(advance_per_group, 2) into v_org, v_adv from public.tournaments where id = p_tournament;
  if v_org is null then raise exception 'tournament_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select count(*) into v_open from public.tournament_matches
    where tournament_id = p_tournament and stage = 'group' and status <> 'done';
  if v_open > 0 then raise exception 'group_stage_incomplete'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament and stage = 'knockout') then
    raise exception 'knockout_already_started';
  end if;

  v_stand := public.get_group_standings(p_tournament);

  -- per group: take the clear qualifiers; resolve a boundary tie via h2h / penalties / lots
  for g_rec in select value as grp from jsonb_array_elements(v_stand) loop
    declare
      v_label text := g_rec.grp->>'group';
      v_rows  jsonb := g_rec.grp->'rows';
      v_cnt   int := jsonb_array_length(v_rows);
      bp int; bgd int; bgf int; n_above int; n_boundary int; slots int;
      a_id uuid; b_id uuid; v_hwin uuid; v_hstat text; v_twin uuid; v_tstat text; k int; lot uuid;
    begin
      if v_cnt <= v_adv then
        for k in 0 .. v_cnt - 1 loop
          v_qual_acc := v_qual_acc || jsonb_build_object('pid', v_rows->k->>'participant_id', 'qrank', k + 1, 'grp', v_label);
        end loop;
        continue;
      end if;

      -- boundary = the stats of the player sitting on the last qualifying slot
      bp  := (v_rows->(v_adv - 1)->>'points')::int;
      bgd := (v_rows->(v_adv - 1)->>'gd')::int;
      bgf := (v_rows->(v_adv - 1)->>'gf')::int;
      select count(*) into n_above from jsonb_array_elements(v_rows) e
        where ((e->>'points')::int, (e->>'gd')::int, (e->>'gf')::int) > (bp, bgd, bgf);
      select count(*) into n_boundary from jsonb_array_elements(v_rows) e
        where ((e->>'points')::int, (e->>'gd')::int, (e->>'gf')::int) = (bp, bgd, bgf);
      slots := v_adv - n_above;

      -- the players strictly above the boundary always qualify
      for k in 0 .. n_above - 1 loop
        v_qual_acc := v_qual_acc || jsonb_build_object('pid', v_rows->k->>'participant_id', 'qrank', k + 1, 'grp', v_label);
      end loop;

      if n_boundary <= slots then
        for k in n_above .. n_above + n_boundary - 1 loop
          v_qual_acc := v_qual_acc || jsonb_build_object('pid', v_rows->k->>'participant_id', 'qrank', k + 1, 'grp', v_label);
        end loop;
        continue;
      end if;

      -- a real tie for the last slot(s): n_boundary > slots
      if slots = 1 and n_boundary = 2 then
        a_id := (v_rows->(n_above)->>'participant_id')::uuid;
        b_id := (v_rows->(n_above + 1)->>'participant_id')::uuid;
        -- 1) head-to-head: their direct group match
        select winner_id, status into v_hwin, v_hstat from public.tournament_matches
          where tournament_id = p_tournament and stage = 'group' and status = 'done'
            and ((p1_id = a_id and p2_id = b_id) or (p1_id = b_id and p2_id = a_id)) limit 1;
        if v_hwin is not null then
          v_qual_acc := v_qual_acc || jsonb_build_object('pid', v_hwin, 'qrank', v_adv, 'grp', v_label);
        else
          -- 2) drew -> penalties: use the decider if already played, else flag it as missing
          select winner_id, status into v_twin, v_tstat from public.tournament_matches
            where tournament_id = p_tournament and stage = 'tiebreak'
              and ((p1_id = a_id and p2_id = b_id) or (p1_id = b_id and p2_id = a_id)) limit 1;
          if v_tstat = 'done' and v_twin is not null then
            v_qual_acc := v_qual_acc || jsonb_build_object('pid', v_twin, 'qrank', v_adv, 'grp', v_label);
          else
            v_missing := v_missing || jsonb_build_object('a', a_id, 'b', b_id, 'group', v_label);
          end if;
        end if;
      else
        -- 3) lots (virtual draw): break a 3+ way / multi-slot dead-heat by a stable random order
        for lot in
          select (e->>'participant_id')::uuid from jsonb_array_elements(v_rows) e
          where ((e->>'points')::int, (e->>'gd')::int, (e->>'gf')::int) = (bp, bgd, bgf)
          order by md5(e->>'participant_id') limit slots
        loop
          v_qual_acc := v_qual_acc || jsonb_build_object('pid', lot, 'qrank', v_adv, 'grp', v_label);
        end loop;
      end if;
    end;
  end loop;

  -- any penalty deciders still needed? create them + enter the tiebreak phase, stop here.
  if jsonb_array_length(v_missing) > 0 then
    for mrow in select value as v from jsonb_array_elements(v_missing) loop
      if not exists (
        select 1 from public.tournament_matches
        where tournament_id = p_tournament and stage = 'tiebreak'
          and ((p1_id = (mrow.v->>'a')::uuid and p2_id = (mrow.v->>'b')::uuid)
            or (p1_id = (mrow.v->>'b')::uuid and p2_id = (mrow.v->>'a')::uuid))
      ) then
        insert into public.tournament_matches (tournament_id, org_id, stage, status, p1_id, p2_id)
          values (p_tournament, v_org, 'tiebreak', 'pending', (mrow.v->>'a')::uuid, (mrow.v->>'b')::uuid);
      end if;
    end loop;
    update public.tournaments set phase = 'tiebreak' where id = p_tournament;
    return jsonb_build_object('ok', false, 'tiebreak_required', true, 'count', jsonb_array_length(v_missing));
  end if;

  -- finalize qualifier order (rank then group, like the original) and seed the bracket
  select array_agg((e->>'pid')::uuid order by (e->>'qrank')::int, e->>'grp')
    into v_quals from jsonb_array_elements(v_qual_acc) e;
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
  return jsonb_build_object('ok', true, 'seeded', true, 'qualifiers', v_n);
end; $$;
revoke all on function public.start_knockout_from_groups(uuid) from public, anon;
grant execute on function public.start_knockout_from_groups(uuid) to authenticated;
