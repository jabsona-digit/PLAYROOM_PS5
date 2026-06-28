-- 0144 - In-Seat portal: open-session timer must reset on a mid-session tier change.
-- Bug (owner-found 2026-06-28): when the operator changes joysticks/tier on an OPEN
-- (pay-as-you-go) session, change_session_tier banks the prior segment into open_accrued
-- and re-anchors open_anchor_at = now() (0140). The operator dashboard counts from that
-- anchor, so its timer correctly restarts at 00:00 for the new segment. But the portal was
-- still counting up from the original started_at, so the customer's phone kept showing the
-- old (total) elapsed time. Fix: expose the current segment anchor (anchor_at) so the portal
-- counts the CURRENT segment, matching the operator. For sessions that never changed tier,
-- open_anchor_at is null → anchor_at falls back to started_at (identical to before).
-- Fixed sessions are unaffected (they count DOWN from ends_at).

create or replace function public.portal_get_session_status(p_console_id integer)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_console_name text; v_console_type text; v_venue uuid;
  v_session uuid; v_ends_at timestamptz; v_started timestamptz; v_is_open boolean;
  v_anchor timestamptz; v_plan text; v_controllers int; v_price numeric;
begin
  select name, console_type, venue_id into v_console_name, v_console_type, v_venue
    from public.consoles where id = p_console_id and deleted_at is null;
  if v_console_name is null then return jsonb_build_object('error', 'console_not_found'); end if;

  select s.id, s.ends_at, s.started_at, s.is_open, s.open_anchor_at,
         pp.name, pp.controllers, pp.price_per_hour
    into v_session, v_ends_at, v_started, v_is_open, v_anchor,
         v_plan, v_controllers, v_price
    from public.sessions s
    join public.pricing_plans pp on pp.id = s.pricing_plan_id
    where s.console_id = p_console_id and s.status = 'active'
    order by s.started_at desc
    limit 1;

  if v_session is null then
    return jsonb_build_object('console_name', v_console_name, 'console_type', v_console_type, 'active', false);
  end if;

  return jsonb_build_object(
    'console_name',   v_console_name,
    'console_type',   v_console_type,
    'active',         true,
    'is_open',        coalesce(v_is_open, false),
    'plan_name',      v_plan,
    'controllers',    v_controllers,
    'price_per_hour', v_price,
    'started_at',     v_started,
    'anchor_at',      coalesce(v_anchor, v_started),  -- current rate-segment start (open count-up)
    'ends_at',        v_ends_at,
    'remaining_min',  case when v_ends_at is null then null
                           else greatest(0, ceil(extract(epoch from (v_ends_at - now())) / 60))::int end
  );
end;
$function$;
