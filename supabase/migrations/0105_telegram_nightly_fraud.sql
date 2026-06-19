-- 0105 - fold operator under-ring flags into the org nightly Telegram brief.
--
-- get_operator_integrity (0095) is is_org_member-gated → unusable from the cron (no
-- auth.uid()). So we inline the same logic (service-role context): per operator
-- (created_by_user), avg joysticks on PLAYROOM sessions over trailing 30d vs the org
-- average; flag = >=5 sessions AND avg <= org_avg - 0.3. Appended to the 21:00 brief.

create or replace function public.telegram_nightly_briefs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_sess  numeric;
  v_cnt   int;
  v_bar   numeric;
  v_active int;
  v_today date := (now() at time zone 'Asia/Tbilisi')::date;
  v_fraud text;
  v_msg   text;
begin
  for r in select id, name from public.organizations where telegram_chat_id is not null loop
    select coalesce(sum(price_total), 0), count(*) into v_sess, v_cnt
      from public.sessions
      where org_id = r.id and status = 'completed' and refunded_at is null
        and (started_at at time zone 'Asia/Tbilisi')::date = v_today;
    select coalesce(sum(total), 0) into v_bar
      from public.bar_sales
      where org_id = r.id and voided_at is null
        and (created_at at time zone 'Asia/Tbilisi')::date = v_today;
    select count(*) into v_active from public.sessions where org_id = r.id and status = 'active';

    v_msg := '🌙 <b>ღამის ანგარიში</b> — ' || coalesce(r.name, '') || E'\n\n'
      || '💰 დღეს სულ: ₾' || to_char(v_sess + v_bar, 'FM999990.00') || E'\n'
      || '🎮 სესიები: ' || v_cnt || ' (₾' || to_char(v_sess, 'FM999990.00') || ')' || E'\n'
      || '🍹 ბარი: ₾' || to_char(v_bar, 'FM999990.00') || E'\n'
      || '🟢 ახლა აქტიური: ' || v_active;

    -- anti-fraud: operators ringing fewer joysticks than the org average (30d)
    v_fraud := null;
    with ps as (
      select s.created_by_user as uid, pp.controllers as j
      from public.sessions s
      join public.pricing_plans pp on pp.id = s.pricing_plan_id
      where s.org_id = r.id and s.created_by_user is not null
        and coalesce(pp.category, 'playroom') = 'playroom' and pp.controllers is not null
        and s.started_at >= now() - interval '30 days'
    ),
    av as (select avg(j) a from ps),
    ops as (select uid, count(*) cnt, avg(j) avgj from ps group by uid)
    select string_agg('• ' || coalesce(e.name, split_part(au.email, '@', 1))
                      || ' (−' || to_char((select a from av) - o.avgj, 'FM990.0') || ' ჯ)', E'\n')
      into v_fraud
    from ops o
    left join public.employees e on e.user_id = o.uid and e.org_id = r.id
    left join auth.users au on au.id = o.uid
    where o.cnt >= 5 and (select a from av) is not null and o.avgj <= (select a from av) - 0.3;

    if v_fraud is not null then
      v_msg := v_msg || E'\n\n🚨 <b>შესამოწმებელი — ჯოისტიკი</b>\n' || v_fraud
            || E'\n<i>საშუალოზე ნაკლებს რთავს — გადაამოწმე.</i>';
    end if;

    begin
      perform public.notify_telegram_org(r.id, 'daily_brief', v_msg);
    exception when others then null;
    end;
  end loop;
end;
$$;
revoke all on function public.telegram_nightly_briefs() from public, anon, authenticated;
