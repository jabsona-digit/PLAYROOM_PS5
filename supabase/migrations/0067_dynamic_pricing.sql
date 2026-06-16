-- 0067 Dynamic pricing engine — owner-configured, time/occupancy-based rates.
--
-- Hotel-style yield management for gaming: the owner defines rules (a day/time
-- window, optional occupancy band, and a multiplier). The session's hourly rate
-- is adjusted at start. Main use = Happy Hour (fill dead zones with a discount);
-- optional surge for peaks. Default = no rules = nothing changes.
--
-- Applied SERVER-SIDE via a BEFORE-INSERT trigger on `sessions` so every start
-- path (start_session / start_open_session / AI / future) is covered without
-- rewriting the core RPCs. The same `dynamic_price_quote` feeds the UI badge.

create table public.dynamic_pricing_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  venue_id      uuid not null references public.venues(id)        on delete cascade,
  name          text not null,
  rule_type     text not null default 'happy_hour' check (rule_type in ('happy_hour', 'surge', 'custom')),
  days_of_week  int[] not null default '{}',         -- 0=Sun..6=Sat (Postgres dow); empty = every day
  time_from     time,                                 -- local (Asia/Tbilisi); null = all day
  time_to       time,                                 -- supports overnight windows (from > to)
  occupancy_min int,                                  -- optional band (% of consoles busy), null = ignore
  occupancy_max int,
  multiplier    numeric(4,2) not null default 1.00 check (multiplier > 0 and multiplier <= 5),
  priority      int not null default 0,               -- highest matching rule wins
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index dynamic_pricing_rules_venue_idx on public.dynamic_pricing_rules(venue_id) where is_active;

alter table public.dynamic_pricing_rules enable row level security;
create policy "dpr_member_read" on public.dynamic_pricing_rules for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
create policy "dpr_admin_write" on public.dynamic_pricing_rules for all to authenticated
  using (public.is_org_admin(org_id) or public.is_platform_admin())
  with check (public.is_org_admin(org_id) or public.is_platform_admin());
revoke all on public.dynamic_pricing_rules from anon;

-- ---------------------------------------------------------------------------
-- dynamic_price_quote — effective price + which rule applied (for trigger + UI)
-- ---------------------------------------------------------------------------
create or replace function public.dynamic_price_quote(
  p_venue_id uuid,
  p_base     numeric,
  p_when     timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_local    timestamp;
  v_dow      int;
  v_time     time;
  v_consoles int;
  v_active   int;
  v_occ      int;
  v_rule     public.dynamic_pricing_rules;
begin
  if p_base is null or p_base <= 0 then
    return jsonb_build_object('price', p_base, 'base', p_base, 'multiplier', 1.0);
  end if;

  v_local := p_when at time zone 'Asia/Tbilisi';   -- wall-clock local time
  v_dow   := extract(dow from v_local)::int;        -- 0=Sun..6=Sat
  v_time  := v_local::time;

  select count(*) into v_consoles from public.consoles where venue_id = p_venue_id and deleted_at is null;
  select count(*) into v_active   from public.sessions where venue_id = p_venue_id and status = 'active';
  v_occ := case when v_consoles > 0 then round(100.0 * v_active / v_consoles)::int else 0 end;

  select * into v_rule from public.dynamic_pricing_rules r
    where r.venue_id = p_venue_id
      and r.is_active
      and (coalesce(array_length(r.days_of_week, 1), 0) = 0 or v_dow = any(r.days_of_week))
      and (
        r.time_from is null or r.time_to is null
        or (case when r.time_from <= r.time_to
                 then (v_time >= r.time_from and v_time < r.time_to)
                 else (v_time >= r.time_from or v_time < r.time_to) end)
      )
      and (r.occupancy_min is null or v_occ >= r.occupancy_min)
      and (r.occupancy_max is null or v_occ <= r.occupancy_max)
    order by r.priority desc, abs(1 - r.multiplier) desc
    limit 1;

  if v_rule.id is null then
    return jsonb_build_object('price', round(p_base, 2), 'base', round(p_base, 2), 'multiplier', 1.0, 'occupancy', v_occ);
  end if;

  return jsonb_build_object(
    'price', round(p_base * v_rule.multiplier, 2),
    'base', round(p_base, 2),
    'multiplier', v_rule.multiplier,
    'rule_name', v_rule.name,
    'rule_type', v_rule.rule_type,
    'occupancy', v_occ
  );
end;
$$;

revoke all on function public.dynamic_price_quote(uuid, numeric, timestamptz) from public, anon;
grant execute on function public.dynamic_price_quote(uuid, numeric, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: apply the effective rate to every new session (server-authoritative)
-- ---------------------------------------------------------------------------
create or replace function public.apply_dynamic_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_eff numeric;
begin
  if new.price_per_hour is not null and new.price_per_hour > 0 then
    v_eff := (public.dynamic_price_quote(new.venue_id, new.price_per_hour, coalesce(new.started_at, now())) ->> 'price')::numeric;
    if v_eff is not null and v_eff is distinct from new.price_per_hour then
      new.price_per_hour := v_eff;
      -- fixed sessions: recompute the upfront total (open sessions settle at end)
      if not coalesce(new.is_open, false) and new.duration_min is not null then
        new.price_total := round((new.duration_min / 60.0) * v_eff, 2);
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_dynamic_pricing on public.sessions;
create trigger trg_apply_dynamic_pricing
  before insert on public.sessions
  for each row execute function public.apply_dynamic_pricing();
