-- 0101 - Telegram push alerts (Phase 2, slice 1: new online booking).
--
-- DB -> pg_net -> Telegram API. The bot token lives in Vault (secret 'telegram_bot_token',
-- created out-of-band, never in git). notify_telegram_org checks the org is linked
-- (telegram_chat_id) AND the per-kind toggle (organizations.telegram_alerts->>kind) before
-- sending. The booking trigger is wrapped so a notify failure can NEVER block a booking.

create or replace function public.notify_telegram_org(p_org_id uuid, p_kind text, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat  bigint;
  v_on    boolean;
  v_token text;
begin
  select telegram_chat_id, coalesce((telegram_alerts ->> p_kind)::boolean, false)
    into v_chat, v_on
  from public.organizations where id = p_org_id;
  if v_chat is null or not v_on then return; end if;   -- not linked, or this alert is off

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  if v_token is null then return; end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat, 'text', p_text,
                               'parse_mode', 'HTML', 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end;
$$;
revoke all on function public.notify_telegram_org(uuid, text, text) from public, anon, authenticated;

create or replace function public.tg_booking_telegram_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.notify_telegram_org(
      new.org_id, 'new_booking',
      '🔔 <b>ახალი ჯავშანი</b>' || E'\n' ||
      coalesce(new.console_type, '') || ' · ' ||
      to_char(new.start_time at time zone 'Asia/Tbilisi', 'DD Mon, HH24:MI') || E'\n' ||
      coalesce(new.customer_name, '') ||
      case when new.customer_phone is not null then ' · ' || new.customer_phone else '' end ||
      case when new.party_size is not null then ' · ' || new.party_size || ' კაცი' else '' end
    );
  exception when others then null;   -- a notify failure must never block the booking
  end;
  return new;
end;
$$;

drop trigger if exists trg_booking_telegram_alert on public.marketplace_bookings;
create trigger trg_booking_telegram_alert
  after insert on public.marketplace_bookings
  for each row execute function public.tg_booking_telegram_alert();
