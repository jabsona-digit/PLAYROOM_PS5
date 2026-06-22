-- 0122 - Owner-facing Telegram alert preferences. The push-alert ENGINE (0101-0105: new-booking
-- / low-stock triggers, nightly brief + fraud, platform digest) was already LIVE, but the
-- per-org toggles (organizations.telegram_alerts) could ONLY be set via raw SQL -> owners had no
-- way to choose which pushes they receive (that's why NIKARAGUA's nightly brief sat off). This
-- adds an admin-gated setter and exposes the current prefs via telegram_link_status, wired to
-- toggle switches in Settings -> Telegram. ASCII only (UI labels live in the frontend).

-- telegram_link_status v2: also return current alert prefs (with sensible defaults) for the UI
create or replace function public.telegram_link_status(p_org_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_linked boolean; v_alerts jsonb;
begin
  if not public.is_org_member(p_org_id) then raise exception 'insufficient_privilege'; end if;
  select telegram_chat_id is not null, coalesce(telegram_alerts, '{}'::jsonb)
    into v_linked, v_alerts from public.organizations where id = p_org_id;
  return jsonb_build_object(
    'linked', coalesce(v_linked, false),
    'alerts', jsonb_build_object(
      'new_booking', coalesce((v_alerts->>'new_booking')::boolean, true),
      'low_stock',   coalesce((v_alerts->>'low_stock')::boolean, true),
      'daily_brief', coalesce((v_alerts->>'daily_brief')::boolean, false),
      'tournament',  coalesce((v_alerts->>'tournament')::boolean, true)
    ));
end; $$;
revoke all on function public.telegram_link_status(uuid) from public, anon;
grant execute on function public.telegram_link_status(uuid) to authenticated;

-- set_telegram_alerts: owner/admin chooses which pushes the org receives. Merges the known
-- boolean keys into telegram_alerts (preserves any other keys, e.g. fraud_flag).
create or replace function public.set_telegram_alerts(p_org_id uuid, p_alerts jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_clean jsonb;
begin
  if not exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid() and role in ('owner', 'admin')
  ) and not public.is_platform_admin() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  v_clean := jsonb_strip_nulls(jsonb_build_object(
    'new_booking', (p_alerts->>'new_booking')::boolean,
    'low_stock',   (p_alerts->>'low_stock')::boolean,
    'daily_brief', (p_alerts->>'daily_brief')::boolean,
    'tournament',  (p_alerts->>'tournament')::boolean
  ));

  update public.organizations
     set telegram_alerts = coalesce(telegram_alerts, '{}'::jsonb) || v_clean
   where id = p_org_id;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.set_telegram_alerts(uuid, jsonb) from public, anon;
grant execute on function public.set_telegram_alerts(uuid, jsonb) to authenticated;
