-- 0132 - Uptime self-check FALSE-FLAP fix. play.martelounge.ge is a cold-startable CF/OpenNext
-- Worker with (today) almost no traffic but the check itself, so it intermittently cold-starts
-- and answers in ~8s — right at the old 8000ms timeout. Result: timeout->down->up->down flapping
-- and frequent founder pages, even though the site is actually fine (real responses were ~7970ms).
-- Fix: (1) raise the liveness timeout to 20s — a cold Worker answers well under it, while a REAL
-- outage still returns nothing/5xx and is caught; (2) raise the de-bounce threshold 2 -> 3
-- (~9 min of consecutive failure before paging). Sentry's external 1-min monitor still covers
-- genuine fast outages. No schema change (fail_streak from 0127 reused).

create or replace function public.platform_uptime_check()
returns void language plpgsql security definer set search_path = public as $$
declare
  r           record;
  v_status    int;
  v_timedout  boolean;
  v_err       text;
  v_ok        boolean;
  v_msg       text;
  v_threshold constant int := 3;      -- consecutive fails before declaring DOWN (~9-12 min at */3)
  v_timeout   constant int := 20000;  -- ms; generous enough for a cold Worker render
begin
  -- PHASE 1: evaluate the previous round's responses, with de-bounce
  for r in select * from public.platform_uptime_state loop
    if r.last_request_id is not null then
      v_status := null; v_timedout := null; v_err := null;
      select status_code, timed_out, error_msg into v_status, v_timedout, v_err
        from net._http_response where id = r.last_request_id;
      v_ok := (v_status is not null and v_status between 200 and 499
               and coalesce(v_timedout, false) = false and v_err is null);

      if v_ok then
        if r.is_down then
          -- recovery: notify immediately
          v_msg := '🟢 <b>აღდგა</b>' || E'\n' || r.url
                || E'\n' || 'გათიშვის ხანგრძლივობა: ' || coalesce(to_char(now() - r.down_since, 'HH24:MI:SS'), '?')
                || E'\n' || to_char(now() at time zone 'Asia/Tbilisi', 'HH24:MI');
          begin perform public.notify_platform_telegram('uptime', v_msg); exception when others then null; end;
          update public.platform_uptime_state
            set is_down = false, down_since = null, fail_streak = 0, last_status = v_status, updated_at = now()
            where url = r.url;
        else
          update public.platform_uptime_state
            set fail_streak = 0, last_status = v_status, updated_at = now()
            where url = r.url;
        end if;
      else
        -- a failed check: bump the streak; only alert once it crosses the threshold
        if not r.is_down and r.fail_streak + 1 >= v_threshold then
          v_msg := '🔴 <b>საიტი არ პასუხობს</b>' || E'\n' || r.url
                || E'\n' || 'სტატუსი: ' || coalesce(v_status::text, coalesce(v_err, 'timeout/no-response'))
                || E'\n' || (r.fail_streak + 1)::text || ' ზედიზედ შემოწმება'
                || E'\n' || to_char(now() at time zone 'Asia/Tbilisi', 'HH24:MI');
          begin perform public.notify_platform_telegram('uptime', v_msg); exception when others then null; end;
          update public.platform_uptime_state
            set is_down = true, down_since = now(), fail_streak = r.fail_streak + 1, last_status = v_status, updated_at = now()
            where url = r.url;
        else
          update public.platform_uptime_state
            set fail_streak = r.fail_streak + 1, last_status = v_status, updated_at = now()
            where url = r.url;
        end if;
      end if;
    end if;
  end loop;

  -- PHASE 2: fire fresh checks for the next run
  for r in select url from public.platform_uptime_state loop
    begin
      update public.platform_uptime_state
        set last_request_id = net.http_get(url := r.url, timeout_milliseconds := v_timeout),
            last_checked_at = now()
        where url = r.url;
    exception when others then null;
    end;
  end loop;
end; $$;
revoke all on function public.platform_uptime_check() from public, anon, authenticated;
