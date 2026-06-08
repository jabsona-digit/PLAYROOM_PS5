-- 0020: P0 foundation — pg_cron, private schema, accountant role + helper,
-- and the abandoned open-session kill switch.
-- NOTE: deviates from v3 brief where noted (live schema uses text+CHECK, not enums;
-- end_session CAPS open duration at 24h instead of raising, so a long session can
-- still be closed cleanly). pg_net deferred until the anomaly detector is built.

-- 1. pg_cron (for scheduled jobs). Creates the `cron` schema.
create extension if not exists pg_cron;

-- 2. private schema for internal SECURITY DEFINER helpers (not callable by clients).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- 3. accountant role — read-only finance role. org_members.role is text+CHECK.
alter table public.org_members drop constraint if exists org_members_role_check;
alter table public.org_members add constraint org_members_role_check
  check (role in ('owner', 'admin', 'manager', 'accountant', 'cashier', 'operator'));

-- 4. is_org_accountant — finance access (owner/admin/accountant), suspension-aware
--    (consistent with is_org_member from migration 0017).
create or replace function public.is_org_accountant(p_org uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.org_members m
    join public.organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'accountant')
      and o.subscription_status <> 'canceled'
  );
$$;
revoke all on function public.is_org_accountant(uuid) from public, anon;
grant execute on function public.is_org_accountant(uuid) to authenticated;

-- 5. Kill switch: auto-close open (pay-as-you-go) sessions left running > 24h.
--    Price uses the session's locked rate, rounded UP to 5 min, capped at 24h —
--    identical math to end_session. Also frees the console.
create or replace function private.kill_abandoned_open_sessions()
returns void language plpgsql security definer set search_path = public as $$
begin
  with killed as (
    update public.sessions s
    set status       = 'completed',
        ended_at     = now(),
        ends_at      = now(),
        duration_min = least(1440, greatest(5, ceil(extract(epoch from (now() - s.started_at)) / 300.0)::int * 5)),
        price_total  = round(
          least(1440, greatest(5, ceil(extract(epoch from (now() - s.started_at)) / 300.0)::int * 5)) / 60.0
          * s.price_per_hour, 2)
    where s.is_open and s.status = 'active'
      and s.started_at < now() - interval '24 hours'
    returning s.console_id
  )
  update public.consoles c set status = 'free'
  where c.id in (select console_id from killed);
end;
$$;
revoke all on function private.kill_abandoned_open_sessions() from public, anon, authenticated;

-- schedule every 15 minutes (idempotent: drop existing job of the same name first)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'kill-abandoned-open-sessions') then
    perform cron.unschedule('kill-abandoned-open-sessions');
  end if;
end $$;
select cron.schedule(
  'kill-abandoned-open-sessions',
  '*/15 * * * *',
  'select private.kill_abandoned_open_sessions();'
);

-- 6. end_session: cap open-session billed time at 24h (1440 min) so an extremely
--    long open session still closes cleanly. Fixed sessions unchanged.
create or replace function public.end_session(p_session_id uuid, p_tip numeric default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id   uuid;
  v_is_open  boolean;
  v_started  timestamptz;
  v_pph      numeric(10,2);
  v_minutes  int;
begin
  select org_id, is_open, started_at, price_per_hour
    into v_org_id, v_is_open, v_started, v_pph
  from public.sessions where id = p_session_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;
  if p_tip < 0 then raise exception 'invalid_tip'; end if;

  if v_is_open then
    v_minutes := least(1440, greatest(5, ceil(extract(epoch from (now() - v_started)) / 300.0)::int * 5));
    update public.sessions
    set status       = 'completed',
        ended_at     = now(),
        ends_at      = now(),
        duration_min = v_minutes,
        price_total  = round((v_minutes / 60.0) * v_pph, 2),
        tip_amount   = coalesce(p_tip, 0)
    where id = p_session_id and status = 'active';
  else
    update public.sessions
    set status     = 'completed',
        ended_at   = now(),
        tip_amount = coalesce(p_tip, 0)
    where id = p_session_id and status = 'active';
  end if;

  if not found then raise exception 'not_active'; end if;

  update public.consoles set status = 'free'
  where id = (select console_id from public.sessions where id = p_session_id);
end;
$$;
