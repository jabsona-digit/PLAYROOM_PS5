-- 0055 — Abandoned open sessions must NOT pollute revenue (#H2).
-- The 15-min kill switch closed open sessions left running > 24h as 'completed'
-- with a capped ~24h charge → fake revenue in P&L / cashier / analytics. Instead
-- mark them with a new status 'abandoned' and price_total = 0, so every revenue
-- query (all of which filter status = 'completed') excludes them automatically.
-- The console is still freed. (An in-app dashboard alert warns at 8h — frontend.)

alter table public.sessions drop constraint if exists sessions_status_check;
alter table public.sessions add constraint sessions_status_check
  check (status in ('active', 'completed', 'cancelled', 'abandoned'));

create or replace function private.kill_abandoned_open_sessions()
returns void language plpgsql security definer set search_path = public as $$
begin
  with killed as (
    update public.sessions s
    set status      = 'abandoned',
        ended_at    = now(),
        ends_at     = now(),
        price_total = 0          -- abandoned: unknown real playtime → no charge, excluded from revenue
    where s.is_open and s.status = 'active'
      and s.started_at < now() - interval '24 hours'
    returning s.console_id
  )
  update public.consoles c set status = 'free'
  where c.id in (select console_id from killed);
end;
$$;
