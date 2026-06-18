-- 0084 — mid-session tier change (add joysticks / switch tariff).
--
-- Model (owner's): a FIXED session is prepaid (price_total locked at start). When the
-- tariff changes mid-session, the money already spent on the elapsed time is computed
-- at the OLD rate, and the REMAINING balance is re-converted to time at the NEW rate —
-- so the on-screen timer shrinks/grows but the prepaid amount is unchanged. Adding more
-- time afterwards goes through the normal extend flow at the (now new) rate.
--   total spent so far = elapsed_hours * old_rate
--   remaining balance  = price_total - spent
--   new minutes left   = remaining / new_rate * 60   →   ends_at = now + that
-- OPEN (pay-as-you-go) is billed at end from the live rate, so a mid-change would
-- mis-bill prior time — rejected here (handled later with segment accrual).

create or replace function public.change_session_tier(p_session_id uuid, p_pricing_plan_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_venue     uuid;
  v_started   timestamptz;
  v_old_rate  numeric(10,2);
  v_is_open   boolean;
  v_total     numeric(10,2);
  v_new_rate  numeric(10,2);
  v_new_ctrl  int;
  v_spent     numeric;
  v_remaining numeric;
  v_new_min   int;
  v_new_ends  timestamptz;
begin
  select org_id, venue_id, started_at, price_per_hour, is_open, price_total
    into v_org, v_venue, v_started, v_old_rate, v_is_open, v_total
  from public.sessions where id = p_session_id and status = 'active';
  if not found then raise exception 'not_active'; end if;
  if not is_org_member(v_org) then raise exception 'unauthorized'; end if;

  select price_per_hour, controllers into v_new_rate, v_new_ctrl
  from public.pricing_plans where id = p_pricing_plan_id and org_id = v_org and is_active;
  if v_new_rate is null then raise exception 'plan_not_found'; end if;

  if v_is_open then
    raise exception 'open_not_supported';
  end if;

  v_spent     := extract(epoch from (now() - v_started)) / 3600.0 * v_old_rate;
  v_remaining := greatest(0, v_total - v_spent);
  v_new_min   := round(v_remaining / v_new_rate * 60.0)::int;
  v_new_ends  := now() + make_interval(mins => v_new_min);

  update public.sessions
     set pricing_plan_id = p_pricing_plan_id,
         price_per_hour  = v_new_rate,
         ends_at         = v_new_ends
   where id = p_session_id and status = 'active';

  perform public.log_audit(v_org, v_venue, 'session.tier_change', 'session', p_session_id::text,
    jsonb_build_object('new_plan', p_pricing_plan_id, 'controllers', v_new_ctrl,
                       'new_rate', v_new_rate, 'remaining_min', v_new_min));

  return jsonb_build_object('ok', true, 'remaining_min', v_new_min,
    'ends_at', v_new_ends, 'controllers', v_new_ctrl, 'rate', v_new_rate);
end;
$$;
revoke all on function public.change_session_tier(uuid, int) from public, anon;
grant execute on function public.change_session_tier(uuid, int) to authenticated;
