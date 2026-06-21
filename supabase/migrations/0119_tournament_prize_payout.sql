-- 0119 - Tournaments 2.0: the LAST money piece -> automatic PRIZE PAYOUT at champion-time.
-- Owner-chosen design (2026-06-21): 3rd place is decided by a World-Cup BRONZE MATCH (the two
-- semifinal losers play), and prizes are handed out via a "Award prizes" BUTTON in the admin.
--   1st = prize_pool        (money)  -> recorded as an EXPENSE (so P&L stays honest)
--   2nd = prize_second      (money)  -> the final's loser; also an EXPENSE
--   3rd = prize_third_minutes (free play-time) -> a new customer_credits row (redeemable later)
-- Online entrants are linked participant -> registration -> customer; walk-ins have no account
-- (manual=true: the operator hands the prize over directly). All three are recorded in
-- tournament_payouts (unique per place) so a payout is idempotent and never doubled.
-- Georgian appears in expense/credit text -> apply via the manual-escape path.

-- ── 1) schema ────────────────────────────────────────────────────────────────
alter table public.tournaments add column if not exists prizes_awarded_at timestamptz;

-- free play-time credit (the 3rd-place prize). Redeemable at the host venue on a future
-- booking/session; redemption (applying minutes) is a later piece -- this records the grant.
create table if not exists public.customer_credits (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  venue_id      uuid references public.venues(id) on delete set null,
  customer_id   uuid not null,                       -- = auth.uid() / marketplace_customers.id
  source        text not null default 'tournament_prize',
  tournament_id uuid references public.tournaments(id) on delete set null,
  minutes       int  not null check (minutes > 0),
  minutes_used  int  not null default 0,
  status        text not null default 'active' check (status in ('active','redeemed','expired')),
  note          text,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists cc_customer_active_idx on public.customer_credits (customer_id) where status = 'active';
alter table public.customer_credits enable row level security;
drop policy if exists cc_read on public.customer_credits;
create policy cc_read on public.customer_credits for select to authenticated
  using (customer_id = auth.uid() or public.is_org_member(org_id) or public.is_platform_admin());
revoke all on public.customer_credits from anon;
-- all writes go through the SECURITY DEFINER RPCs below (no insert/update policy)

-- the payout ledger: one row per (tournament, place) -> idempotent, auditable
create table if not exists public.tournament_payouts (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  org_id         uuid not null references public.organizations(id) on delete cascade,
  participant_id uuid,
  customer_id    uuid,
  place          int  not null,
  prize_type     text not null check (prize_type in ('money','free_minutes')),
  amount         numeric not null default 0,
  minutes        int  not null default 0,
  expense_id     uuid,
  credit_id      uuid,
  manual         boolean not null default false,     -- true = walk-in, handed over by hand
  created_at     timestamptz not null default now(),
  unique (tournament_id, place)
);
alter table public.tournament_payouts enable row level security;
drop policy if exists tpo_read on public.tournament_payouts;
create policy tpo_read on public.tournament_payouts for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
revoke all on public.tournament_payouts from anon;

-- ── 2) report_match v3: + bronze branch + auto-create the bronze match ───────
-- Adds a 'bronze' stage (3rd-place playoff): record its result but NEVER advance/overwrite the
-- champion. And when BOTH real semifinals finish, auto-create the bronze match between the two
-- losers (World-Cup style). Group + knockout behaviour is unchanged from 0106.
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

  -- group stage: draws allowed, standings computed, no bracket advancement
  if v_stage = 'group' then
    update public.tournament_matches
       set score1 = p_score1, score2 = p_score2, status = 'done',
           winner_id = case when p_score1 > p_score2 then v_p1
                            when p_score2 > p_score1 then v_p2 else null end
     where id = p_match;
    return;
  end if;

  -- bronze (3rd-place playoff): record result only -- do NOT advance, do NOT touch champion
  if v_stage = 'bronze' then
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

  -- World-Cup bronze: if THIS was a semifinal (it feeds the final, whose own next_match is null)
  -- and both feeding semifinals are now decided & real, spawn the 3rd-place playoff.
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

-- ── 3) internal: grant one prize (money -> expense, free-time -> credit) + ledger row ─
create or replace function public._grant_tournament_prize(
  p_tournament uuid, p_org uuid, p_venue uuid, p_tname text,
  p_place int, p_participant uuid, p_type text, p_amount numeric, p_minutes int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cust uuid; v_pname text; v_exp uuid; v_credit uuid; v_manual boolean := false; v_lbl text;
begin
  select name into v_pname from public.tournament_participants where id = p_participant;
  -- participant -> customer via their registration (walk-ins have no registration -> null)
  select customer_id into v_cust from public.tournament_registrations
    where tournament_id = p_tournament and participant_id = p_participant limit 1;

  v_lbl := case p_place when 1 then '1-ლი' when 2 then 'მე-2' when 3 then 'მე-3' else p_place::text end;

  if p_type = 'money' then
    -- cash leaving the venue -> record an expense so net profit reflects the prize
    if p_venue is not null and p_amount > 0 then
      insert into public.expenses (org_id, venue_id, category, amount, description, expense_date, created_by)
        values (p_org, p_venue, 'other', p_amount,
                'ტურნირის პრიზი (' || v_lbl || ' ადგილი): ' || coalesce(v_pname, '—') || ' — ' || p_tname,
                current_date, auth.uid())
        returning id into v_exp;
    end if;
    v_manual := v_cust is null;                  -- walk-in: operator hands the cash directly
  elsif p_type = 'free_minutes' then
    if v_cust is not null and p_minutes > 0 then
      insert into public.customer_credits (org_id, venue_id, customer_id, source, tournament_id, minutes, note)
        values (p_org, p_venue, v_cust, 'tournament_prize', p_tournament, p_minutes,
                'ტურნირის მე-3 ადგილი: ' || p_tname)
        returning id into v_credit;
    else
      v_manual := true;                          -- walk-in / no account: free time given by hand
    end if;
  end if;

  insert into public.tournament_payouts
    (tournament_id, org_id, participant_id, customer_id, place, prize_type, amount, minutes, expense_id, credit_id, manual)
    values (p_tournament, p_org, p_participant, v_cust, p_place, p_type, p_amount, p_minutes, v_exp, v_credit, v_manual);

  return jsonb_build_object('place', p_place, 'name', coalesce(v_pname, '—'),
    'type', p_type, 'amount', p_amount, 'minutes', p_minutes, 'manual', v_manual);
end; $$;
revoke all on function public._grant_tournament_prize(uuid, uuid, uuid, text, int, uuid, text, numeric, int) from public, anon;

-- ── 4) award_tournament_prizes: the "Award prizes" button -> pays 1st/2nd/3rd ─
create or replace function public.award_tournament_prizes(p_tournament uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_venue uuid; v_name text; v_awarded timestamptz;
  v_champ uuid; v_prize1 numeric; v_prize2 numeric; v_min3 int;
  v_final_id uuid; v_fp1 uuid; v_fp2 uuid; v_second uuid;
  v_bronze_id uuid; v_bronze_status text; v_third uuid;
  v_awards jsonb := '[]'::jsonb;
begin
  select org_id, venue_id, name, prizes_awarded_at, winner_participant_id,
         coalesce(prize_pool, 0), coalesce(prize_second, 0), coalesce(prize_third_minutes, 0)
    into v_org, v_venue, v_name, v_awarded, v_champ, v_prize1, v_prize2, v_min3
    from public.tournaments where id = p_tournament;
  if v_org is null then raise exception 'tournament_not_found'; end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_champ is null then raise exception 'no_champion'; end if;
  if v_awarded is not null or exists (select 1 from public.tournament_payouts where tournament_id = p_tournament) then
    raise exception 'already_awarded';
  end if;

  -- 2nd place = the FINAL's loser (final = the knockout match with no next match)
  select id, p1_id, p2_id into v_final_id, v_fp1, v_fp2
    from public.tournament_matches
   where tournament_id = p_tournament and coalesce(stage, 'knockout') = 'knockout'
     and next_match_id is null and status = 'done'
   order by round desc nulls last limit 1;
  if v_final_id is not null then
    v_second := case when v_champ = v_fp1 then v_fp2 else v_fp1 end;
  end if;

  -- 3rd place = bronze match winner; fallback = the lone real semifinal loser (bye case)
  select id, status into v_bronze_id, v_bronze_status
    from public.tournament_matches where tournament_id = p_tournament and stage = 'bronze' limit 1;
  if v_bronze_id is not null then
    if v_bronze_status <> 'done' then raise exception 'bronze_pending'; end if;
    select winner_id into v_third from public.tournament_matches where id = v_bronze_id;
  elsif v_final_id is not null then
    select case when sf.winner_id = sf.p1_id then sf.p2_id else sf.p1_id end into v_third
      from public.tournament_matches sf
     where sf.tournament_id = p_tournament and coalesce(sf.stage, 'knockout') = 'knockout'
       and sf.next_match_id = v_final_id and sf.status = 'done'
       and sf.p1_id is not null and sf.p2_id is not null
     limit 1;
  end if;

  if v_champ is not null and v_prize1 > 0 then
    v_awards := v_awards || public._grant_tournament_prize(p_tournament, v_org, v_venue, v_name, 1, v_champ, 'money', v_prize1, 0);
  end if;
  if v_second is not null and v_prize2 > 0 then
    v_awards := v_awards || public._grant_tournament_prize(p_tournament, v_org, v_venue, v_name, 2, v_second, 'money', v_prize2, 0);
  end if;
  if v_third is not null and v_min3 > 0 then
    v_awards := v_awards || public._grant_tournament_prize(p_tournament, v_org, v_venue, v_name, 3, v_third, 'free_minutes', 0, v_min3);
  end if;

  update public.tournaments set prizes_awarded_at = now() where id = p_tournament;
  return jsonb_build_object('ok', true, 'awards', v_awards);
end; $$;
revoke all on function public.award_tournament_prizes(uuid) from public, anon;
grant execute on function public.award_tournament_prizes(uuid) to authenticated;

-- ── 5) get_my_credits: the player's free play-time on /account ────────────────
create or replace function public.get_my_credits()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'minutes', c.minutes, 'minutes_used', c.minutes_used,
      'remaining', greatest(0, c.minutes - c.minutes_used), 'status', c.status,
      'note', c.note, 'venue_name', v.name, 'venue_city', v.city,
      'created_at', c.created_at, 'expires_at', c.expires_at
    ) order by c.created_at desc)
    from public.customer_credits c
    left join public.venues v on v.id = c.venue_id
    where c.customer_id = v_uid and c.status = 'active'
  ), '[]'::jsonb);
end; $$;
revoke all on function public.get_my_credits() from public, anon;
grant execute on function public.get_my_credits() to authenticated;
