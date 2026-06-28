-- 0142 - In-Seat portal: support OPEN (pay-as-you-go) sessions.
-- Bug (owner-found 2026-06-28): portal_get_session_status used `ends_at IS NULL` as the
-- "no active session" sentinel — but an OPEN session legitimately has ends_at = null. So
-- an active open session was reported `active:false` and the portal showed 00:00 / "no
-- session". Fix: detect the active session by its EXISTENCE (v_session), and return is_open
-- + started_at so the portal can count UP elapsed time for open sessions (remaining_min is
-- null when there's no end time). Fixed sessions are unchanged.

create or replace function public.portal_get_session_status(p_console_id integer)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_console_name text; v_console_type text; v_venue uuid;
  v_session uuid; v_ends_at timestamptz; v_started timestamptz; v_is_open boolean;
  v_plan text; v_controllers int; v_price numeric;
begin
  select name, console_type, venue_id into v_console_name, v_console_type, v_venue
    from public.consoles where id = p_console_id and deleted_at is null;
  if v_console_name is null then return jsonb_build_object('error', 'console_not_found'); end if;

  select s.id, s.ends_at, s.started_at, s.is_open, pp.name, pp.controllers, pp.price_per_hour
    into v_session, v_ends_at, v_started, v_is_open, v_plan, v_controllers, v_price
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
    'ends_at',        v_ends_at,
    'remaining_min',  case when v_ends_at is null then null
                           else greatest(0, ceil(extract(epoch from (v_ends_at - now())) / 60))::int end
  );
end;
$function$;
