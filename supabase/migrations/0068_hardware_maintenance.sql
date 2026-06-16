-- 0068 Predictive hardware maintenance — track console wear, warn before failure.
--
-- Gaming hardware (esp. DualSense controllers — stick drift ~400-600h) wears out.
-- We accumulate usage per console and surface a health score so the owner
-- replaces a controller BEFORE a customer hits drift. "Service" resets the wear
-- clock. Roadmap-v2 Epic #11.

alter table public.consoles
  add column if not exists total_sessions_count int not null default 0,
  add column if not exists total_hours_played   numeric(10,2) not null default 0,
  add column if not exists hours_since_service   numeric(10,2) not null default 0,  -- drives health; resets on service
  add column if not exists controller_replaced_at timestamptz;

alter table public.consoles
  add column if not exists hardware_health_score int generated always as (
    case
      when hours_since_service >= 600 then 20   -- critical
      when hours_since_service >= 400 then 50   -- warning
      when hours_since_service >= 200 then 75   -- good
      else 95                                    -- excellent
    end
  ) stored;

-- ---------------------------------------------------------------------------
-- Accrue usage when a session COMPLETES (real played time, capped at 24h to
-- ignore abandoned-session skew).
-- ---------------------------------------------------------------------------
create or replace function public.bump_console_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_hrs numeric;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    v_hrs := least(24, greatest(0, extract(epoch from (coalesce(new.ended_at, now()) - new.started_at)) / 3600.0));
    update public.consoles set
      total_sessions_count = coalesce(total_sessions_count, 0) + 1,
      hours_since_service   = coalesce(hours_since_service, 0) + v_hrs,
      total_hours_played    = coalesce(total_hours_played, 0) + v_hrs
    where id = new.console_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_bump_console_usage on public.sessions;
create trigger trg_bump_console_usage
  after update on public.sessions
  for each row execute function public.bump_console_usage();

-- ---------------------------------------------------------------------------
-- mark_controller_serviced — admin resets the wear clock after maintenance.
-- ---------------------------------------------------------------------------
create or replace function public.mark_controller_serviced(p_console_id int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from public.consoles where id = p_console_id;
  if v_org is null then raise exception 'console_not_found'; end if;
  if not (public.is_org_admin(v_org) or public.is_platform_admin()) then raise exception 'insufficient_privilege'; end if;
  update public.consoles set hours_since_service = 0, controller_replaced_at = now() where id = p_console_id;
end;
$$;

revoke all on function public.mark_controller_serviced(int) from public, anon;
grant execute on function public.mark_controller_serviced(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill from existing completed sessions so venues see real numbers now.
-- ---------------------------------------------------------------------------
update public.consoles c set
  total_sessions_count = sub.cnt,
  hours_since_service   = sub.hrs,
  total_hours_played    = sub.hrs
from (
  select console_id,
         count(*)::int as cnt,
         coalesce(sum(least(24, greatest(0, extract(epoch from (coalesce(ended_at, now()) - started_at)) / 3600.0))), 0) as hrs
  from public.sessions
  where status = 'completed'
  group by console_id
) sub
where c.id = sub.console_id;
