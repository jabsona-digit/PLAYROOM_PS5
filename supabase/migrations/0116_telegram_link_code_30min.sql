-- 0116 - Extend Telegram link-code validity 10 -> 30 min. An owner generates the code in the
-- panel then has to switch apps to Telegram and type /link CODE; 10 min was too tight (codes
-- expired before use → the bot replied "expired"/no bind). 30 min is comfortable. ASCII only.

alter table public.telegram_link_codes alter column expires_at set default now() + interval '30 minutes';

create or replace function public.create_telegram_link_code(p_org_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text;
begin
  if not public.is_org_admin(p_org_id) then raise exception 'insufficient_privilege'; end if;
  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 6));
  insert into public.telegram_link_codes (code, org_id, created_by, expires_at)
    values (v_code, p_org_id, auth.uid(), now() + interval '30 minutes');
  return jsonb_build_object('ok', true, 'code', v_code, 'expires_in_min', 30);
end; $$;
