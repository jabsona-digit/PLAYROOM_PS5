-- 0127 - Uptime self-check DE-BOUNCE: alert only after N CONSECUTIVE failed checks, so a
-- single transient blip (CF Worker cold-start, momentary 503) does not false-page the founder.
-- Recovery stays immediate (first success -> green). Prompted by a real transient 503 on
-- play.martelounge.ge (2026-06-22) that recovered within one cycle but still paged.

alter table public.platform_uptime_state add column if not exists fail_streak int not null default 0;

create or replace function public.platform_uptime_check()
returns void language plpgsql security definer set search_path = public as $$
declare
  r           record;
  v_status    int;
  v_timedout  boolean;
  v_err       text;
  v_ok        boolean;
  v_msg       text;
  v_threshold constant int := 2;  -- consecutive fails before declaring DOWN (~3-6 min at */3)
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
        set last_request_id = net.http_get(url := r.url, timeout_milliseconds := 8000),
            last_checked_at = now()
        where url = r.url;
    exception when others then null;
    end;
  end loop;
end; $$;
revoke all on function public.platform_uptime_check() from public, anon, authenticated;
