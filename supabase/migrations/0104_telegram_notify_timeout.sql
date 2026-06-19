-- 0104 - bump pg_net timeout for Telegram sends (5s -> 15s).
-- Observed: a Telegram TCP/SSL handshake occasionally took >5000ms and pg_net's default
-- 5s timeout dropped the message. 15s gives ample headroom. Only the two notify_* helpers
-- change (no Georgian here — message text lives in the trigger/cron builders).

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
  if v_chat is null or not v_on then return; end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  if v_token is null then return; end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat, 'text', p_text,
                               'parse_mode', 'HTML', 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

create or replace function public.notify_platform_telegram(p_kind text, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_chat bigint; v_on boolean; v_token text;
begin
  select chat_id, coalesce((alerts ->> p_kind)::boolean, false) into v_chat, v_on
    from public.platform_telegram_config where id = 1;
  if v_chat is null or not v_on then return; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  if v_token is null then return; end if;
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat, 'text', p_text, 'parse_mode', 'HTML', 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;
