-- 0037 Tournaments (single elimination)
-- Venues run gaming tournaments (FIFA, Mortal Kombat, ...). Admin creates a
-- tournament, registers walk-in players, seeds a single-elim bracket (byes
-- auto-resolve), then reports match scores; winners auto-advance. RLS = staff.
-- Schema-compat: no enums (text + CHECK); console_id is integer.

create table if not exists public.tournaments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  venue_id      uuid not null references public.venues(id),
  name          text not null,
  game          text,
  format        text not null default 'single_elim' check (format in ('single_elim')),
  status        text not null default 'registration'
                  check (status in ('registration','active','completed','cancelled')),
  max_participants int,
  entry_fee     numeric(10,2) not null default 0,
  prize_pool    numeric(10,2) not null default 0,
  starts_at     timestamptz,
  bracket_size  int,
  winner_participant_id uuid,
  created_at    timestamptz not null default now()
);

create table if not exists public.tournament_participants (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  org_id        uuid not null references public.organizations(id),
  name          text not null,
  phone         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  org_id        uuid not null references public.organizations(id),
  round         int not null,
  position      int not null,
  p1_id         uuid references public.tournament_participants(id) on delete set null,
  p2_id         uuid references public.tournament_participants(id) on delete set null,
  winner_id     uuid references public.tournament_participants(id) on delete set null,
  score1        int,
  score2        int,
  console_id    integer references public.consoles(id),
  status        text not null default 'pending' check (status in ('pending','live','done')),
  next_match_id uuid references public.tournament_matches(id) on delete set null,
  next_slot     int,
  created_at    timestamptz not null default now()
);

-- winner FK (added after participants table exists)
alter table public.tournaments
  add constraint tournaments_winner_fkey
  foreign key (winner_participant_id) references public.tournament_participants(id) on delete set null;

create index if not exists t_org_idx        on public.tournaments (org_id, venue_id);
create index if not exists tp_tournament_idx on public.tournament_participants (tournament_id);
create index if not exists tm_tournament_idx on public.tournament_matches (tournament_id, round, position);

-- ── RLS: staff (org members) manage everything in their org ──────────────────
alter table public.tournaments            enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_matches     enable row level security;

drop policy if exists t_all on public.tournaments;
create policy t_all on public.tournaments
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

drop policy if exists tp_all on public.tournament_participants;
create policy tp_all on public.tournament_participants
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

drop policy if exists tm_all on public.tournament_matches;
create policy tm_all on public.tournament_matches
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- ── internal: advance a winner into the next match (or finish the tournament) ─
create or replace function public._advance_winner(p_match uuid, p_winner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare nm uuid; ns int; v_t uuid;
begin
  select next_match_id, next_slot, tournament_id into nm, ns, v_t
    from public.tournament_matches where id = p_match;
  if nm is null then
    update public.tournaments
       set winner_participant_id = p_winner, status = 'completed'
     where id = v_t;
  elsif ns = 1 then
    update public.tournament_matches set p1_id = p_winner where id = nm;
  else
    update public.tournament_matches set p2_id = p_winner where id = nm;
  end if;
end; $$;

revoke execute on function public._advance_winner(uuid, uuid) from public;

-- ── seed the bracket from registered participants ────────────────────────────
create or replace function public.seed_tournament(p_tournament uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_n int; v_b int; v_rounds int;
  r int; cnt int; pos int; half int; i int;
  v_parts uuid[]; m_id uuid; w uuid;
begin
  select org_id into v_org from public.tournaments where id = p_tournament;
  if v_org is null then raise exception 'tournament_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament) then
    raise exception 'already_seeded';
  end if;

  select array_agg(id order by random()) into v_parts
    from public.tournament_participants where tournament_id = p_tournament;
  v_n := coalesce(array_length(v_parts, 1), 0);
  if v_n < 2 then raise exception 'need_two_participants'; end if;

  v_b := 2; while v_b < v_n loop v_b := v_b * 2; end loop;       -- next power of 2
  v_rounds := 0; r := v_b; while r > 1 loop v_rounds := v_rounds + 1; r := r / 2; end loop;

  -- create every match slot, round 1..R
  r := 1; cnt := v_b / 2;
  while r <= v_rounds loop
    pos := 0;
    while pos < cnt loop
      insert into public.tournament_matches (tournament_id, org_id, round, position)
        values (p_tournament, v_org, r, pos);
      pos := pos + 1;
    end loop;
    r := r + 1; cnt := cnt / 2;
  end loop;

  -- link each match to its parent (where its winner goes)
  update public.tournament_matches m
     set next_match_id = parent.id,
         next_slot = case when (m.position % 2) = 0 then 1 else 2 end
    from public.tournament_matches parent
   where m.tournament_id = p_tournament and parent.tournament_id = p_tournament
     and parent.round = m.round + 1
     and parent.position = m.position / 2;

  -- place participants into round 1 (every match gets ≥1 player; extras fill slot 2)
  half := v_b / 2;
  for i in 0 .. half - 1 loop
    if i < v_n then
      update public.tournament_matches set p1_id = v_parts[i + 1]
       where tournament_id = p_tournament and round = 1 and position = i;
    end if;
  end loop;
  for i in half .. v_n - 1 loop
    update public.tournament_matches set p2_id = v_parts[i + 1]
     where tournament_id = p_tournament and round = 1 and position = (i - half);
  end loop;

  -- resolve byes (round-1 matches with a single player auto-advance)
  for m_id, w in
    select id, p1_id from public.tournament_matches
     where tournament_id = p_tournament and round = 1 and p1_id is not null and p2_id is null
  loop
    update public.tournament_matches set winner_id = w, status = 'done' where id = m_id;
    perform public._advance_winner(m_id, w);
  end loop;

  update public.tournaments set status = 'active', bracket_size = v_b where id = p_tournament;
end; $$;

grant execute on function public.seed_tournament(uuid) to authenticated;

-- ── report a match score → set winner → advance ──────────────────────────────
create or replace function public.report_match(p_match uuid, p_score1 int, p_score2 int)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_p1 uuid; v_p2 uuid; v_status text; w uuid;
begin
  select org_id, p1_id, p2_id, status into v_org, v_p1, v_p2, v_status
    from public.tournament_matches where id = p_match;
  if v_org is null then raise exception 'match_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_status = 'done' then raise exception 'already_reported'; end if;
  if v_p1 is null or v_p2 is null then raise exception 'match_not_ready'; end if;
  if p_score1 = p_score2 then raise exception 'no_draws'; end if;

  w := case when p_score1 > p_score2 then v_p1 else v_p2 end;
  update public.tournament_matches
     set score1 = p_score1, score2 = p_score2, winner_id = w, status = 'done'
   where id = p_match;
  perform public._advance_winner(p_match, w);
end; $$;

grant execute on function public.report_match(uuid, int, int) to authenticated;
