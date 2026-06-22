-- 0124 - Self-hosted uptime monitor -> founder Telegram (P1-4 complement).
-- Sentry already watches both sites (external, catches Supabase-down too) and emails.
-- This adds a fast Telegram ping for CF/site outages, reusing notify_platform_telegram (0103).
-- Design: pg_cron every 3 min. pg_net is async, so we use a 2-phase loop:
--   Phase 1 = evaluate the PREVIOUS round's responses (net._http_response) and alert ONLY on
--             state transitions (up->down, down->up) so we never spam while a site stays down.
--   Phase 2 = fire fresh GETs whose responses Phase 1 reads next run.

-- 1) allow the 'uptime' alert kind through notify_platform_telegram (toggle-gated by alerts->>kind)
alter table public.platform_telegram_config
  alter column alerts set default '{"new_tenant":true,"daily_digest":true,"uptime":true}'::jsonb;
update public.platform_telegram_config
  set alerts = alerts || '{"uptime":true}'::jsonb
  where id = 1 and not (alerts ? 'uptime');

-- 2) per-URL state (de-dup: alert on transition, not every tick)
create table if not exists public.platform_uptime_state (
  url             text primary key,
  is_down         boolean not null default false,
  last_request_id bigint,
  last_status     int,
  down_since      timestamptz,
  last_checked_at timestamptz,
  updated_at      timestamptz default now()
);
alter table public.platform_uptime_state enable row level security;
revoke all on public.platform_uptime_state from anon, authenticated;

insert into public.platform_uptime_state (url) values
  ('https://app.martelounge.ge'),
  ('https://play.martelounge.ge')
on conflict (url) do nothing;

-- 3) the checker (service-role / cron only)
create or replace function public.platform_uptime_check()
returns void language plpgsql security definer set search_path = public as $$
declare
  r          record;
  v_status   int;
  v_timedout boolean;
  v_err      text;
  v_ok       boolean;
  v_msg      text;
begin
  -- PHASE 1: read the previous round's async responses and alert on transitions
  for r in select * from public.platform_uptime_state loop
    if r.last_request_id is not null then
      v_status := null; v_timedout := null; v_err := null;
      select status_code, timed_out, error_msg
        into v_status, v_timedout, v_err
        from net._http_response where id = r.last_request_id;

      -- "up" = server answered with 2xx/3xx/4xx, not timed out, no transport error.
      -- "down" = 5xx, no response yet/at all, timeout, or transport error.
      v_ok := (v_status is not null and v_status between 200 and 499
               and coalesce(v_timedout, false) = false and v_err is null);

      if not v_ok and not r.is_down then
        v_msg := '🔴 <b>საიტი არ პასუხობს</b>' || E'\n' || r.url
              || E'\n' || 'სტატუსი: ' || coalesce(v_status::text, coalesce(v_err, 'timeout/no-response'))
              || E'\n' || to_char(now() at time zone 'Asia/Tbilisi', 'HH24:MI');
        begin perform public.notify_platform_telegram('uptime', v_msg); exception when others then null; end;
        update public.platform_uptime_state
          set is_down = true, down_since = now(), last_status = v_status, updated_at = now()
          where url = r.url;
      elsif v_ok and r.is_down then
        v_msg := '🟢 <b>აღდგა</b>' || E'\n' || r.url
              || E'\n' || 'გათიშვის ხანგრძლივობა: ' || coalesce(to_char(now() - r.down_since, 'HH24:MI:SS'), '?')
              || E'\n' || to_char(now() at time zone 'Asia/Tbilisi', 'HH24:MI');
        begin perform public.notify_platform_telegram('uptime', v_msg); exception when others then null; end;
        update public.platform_uptime_state
          set is_down = false, down_since = null, last_status = v_status, updated_at = now()
          where url = r.url;
      else
        update public.platform_uptime_state
          set last_status = v_status, updated_at = now()
          where url = r.url;
      end if;
    end if;
  end loop;

  -- PHASE 2: fire fresh checks for the next run
  for r in select url from public.platform_uptime_state loop
    begin
      update public.platform_uptime_state
        set last_request_id = net.http_get(url := r.url, timeout_milliseconds := 8000),
            last_checked_at = now()
        where url = r.url;
    exception when others then null;
    end;
  end loop;
end; $$;
revoke all on function public.platform_uptime_check() from public, anon, authenticated;

-- 4) schedule every 3 minutes (detection ~3-6 min; Sentry's 1-min play monitor covers the fast path)
do $$ begin perform cron.unschedule('platform-uptime-check'); exception when others then null; end $$;
select cron.schedule('platform-uptime-check', '*/3 * * * *', 'select public.platform_uptime_check()');
