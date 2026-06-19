-- 0102 - Telegram push alerts (Phase 2, slices 2+3): low stock + nightly brief.
-- Reuses notify_telegram_org (0101): Vault token + pg_net, gated by link + telegram_alerts->>kind.

-- SLICE 2: low stock. Fires ONCE when a product's stock crosses from above its
-- configurable low_stock_threshold down to <= it (no spam on every subsequent sale).
create or replace function public.tg_low_stock_telegram_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock_quantity is not null and new.low_stock_threshold is not null
     and new.stock_quantity <= new.low_stock_threshold
     and (old.stock_quantity is null or old.stock_quantity > new.low_stock_threshold) then
    begin
      perform public.notify_telegram_org(new.org_id, 'low_stock',
        '📦 <b>მარაგი იწურება</b>' || E'\n' ||
        coalesce(new.name, '') || ' — დარჩა ' || new.stock_quantity ||
        ' (ზღვარი ' || new.low_stock_threshold || ')');
    exception when others then null;  -- never block a sale on a notify failure
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_low_stock_telegram_alert on public.bar_products;
create trigger trg_low_stock_telegram_alert
  after update of stock_quantity on public.bar_products
  for each row execute function public.tg_low_stock_telegram_alert();

-- SLICE 3: nightly brief at 21:00 Asia/Tbilisi (= 17:00 UTC). notify_telegram_org
-- itself checks the daily_brief toggle, so we loop every linked org.
create or replace function public.telegram_nightly_briefs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_sess   numeric;
  v_cnt    int;
  v_bar    numeric;
  v_active int;
  v_today  date := (now() at time zone 'Asia/Tbilisi')::date;
  v_msg    text;
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

    begin
      perform public.notify_telegram_org(r.id, 'daily_brief', v_msg);
    exception when others then null;
    end;
  end loop;
end;
$$;
revoke all on function public.telegram_nightly_briefs() from public, anon, authenticated;

-- schedule (idempotent: drop any existing job of the same name first)
do $$ begin perform cron.unschedule('telegram-nightly-brief'); exception when others then null; end $$;
select cron.schedule('telegram-nightly-brief', '0 17 * * *', 'select public.telegram_nightly_briefs()');
