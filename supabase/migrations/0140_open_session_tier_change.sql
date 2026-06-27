-- 0140 - Open (pay-as-you-go) session: support mid-session tier / joystick change
-- with correct SEGMENT billing. Owner rule (2026-06-26): when joysticks are added,
-- the time played SO FAR is banked at the OLD rate into the running to-pay amount
-- (auto, nothing paid yet on an open session), then the meter continues at the NEW
-- rate. So a rate change never retroactively re-prices past time.
--
-- Model: sessions.open_accrued = money already banked from prior rate segments;
--        sessions.open_anchor_at = when the CURRENT rate segment started (null =
--        started_at, i.e. never changed → behaves exactly as before, backward-safe).
-- Live/final open cost  = open_accrued + roundup5(now - anchor)/60 * price_per_hour.

alter table public.sessions add column if not exists open_accrued   numeric(10,2) not null default 0;
alter table public.sessions add column if not exists open_anchor_at timestamptz;

-- ── change_session_tier: open path now BANKS + re-anchors (was: raise) ────────
create or replace function public.change_session_tier(p_session_id uuid, p_pricing_plan_id integer)
returns jsonb
language plpgsql security definer set search_path = public as $function$
declare
  v_org uuid; v_venue uuid; v_started timestamptz; v_old_rate numeric(10,2);
  v_is_open boolean; v_total numeric(10,2); v_new_rate numeric(10,2); v_new_ctrl int;
  v_spent numeric; v_remaining numeric; v_new_min int; v_new_ends timestamptz;
  v_anchor timestamptz; v_accrued numeric(10,2); v_seg_min int; v_banked numeric(10,2);
begin
  select org_id, venue_id, started_at, price_per_hour, is_open, price_total,
         coalesce(open_anchor_at, started_at), coalesce(open_accrued, 0)
    into v_org, v_venue, v_started, v_old_rate, v_is_open, v_total, v_anchor, v_accrued
  from public.sessions where id = p_session_id and status = 'active';
  if not found then raise exception 'not_active'; end if;
  if not is_org_member(v_org) then raise exception 'unauthorized'; end if;

  select price_per_hour, controllers into v_new_rate, v_new_ctrl
  from public.pricing_plans where id = p_pricing_plan_id and org_id = v_org and is_active;
  if v_new_rate is null then raise exception 'plan_not_found'; end if;

  if v_is_open then
    -- bank the current segment at the OLD rate (5-min round-up), re-anchor to now
    v_seg_min := greatest(5, ceil(extract(epoch from (now() - v_anchor)) / 300.0)::int * 5);
    v_banked  := round((v_seg_min / 60.0) * v_old_rate, 2);
    update public.sessions
       set open_accrued    = round(v_accrued + v_banked, 2),
           open_anchor_at  = now(),
           pricing_plan_id = p_pricing_plan_id,
           price_per_hour  = v_new_rate
     where id = p_session_id and status = 'active';
    perform public.log_audit(v_org, v_venue, 'session.tier_change', 'session', p_session_id::text,
      jsonb_build_object('open', true, 'new_plan', p_pricing_plan_id, 'controllers', v_new_ctrl,
        'new_rate', v_new_rate, 'banked', v_banked, 'accrued', round(v_accrued + v_banked, 2)));
    return jsonb_build_object('ok', true, 'open', true, 'controllers', v_new_ctrl,
      'rate', v_new_rate, 'banked', v_banked, 'accrued', round(v_accrued + v_banked, 2));
  end if;

  -- fixed session: rebill remaining money at the new rate (unchanged from 0084)
  v_spent     := extract(epoch from (now() - v_started)) / 3600.0 * v_old_rate;
  v_remaining := greatest(0, v_total - v_spent);
  v_new_min   := round(v_remaining / v_new_rate * 60.0)::int;
  v_new_ends  := now() + make_interval(mins => v_new_min);

  update public.sessions
     set pricing_plan_id = p_pricing_plan_id, price_per_hour = v_new_rate, ends_at = v_new_ends
   where id = p_session_id and status = 'active';

  perform public.log_audit(v_org, v_venue, 'session.tier_change', 'session', p_session_id::text,
    jsonb_build_object('new_plan', p_pricing_plan_id, 'controllers', v_new_ctrl, 'new_rate', v_new_rate, 'remaining_min', v_new_min));

  return jsonb_build_object('ok', true, 'remaining_min', v_new_min, 'ends_at', v_new_ends, 'controllers', v_new_ctrl, 'rate', v_new_rate);
end;
$function$;

-- ── end_session: open price = accrued + current rate segment ──────────────────
create or replace function public.end_session(p_session_id uuid, p_tip numeric default 0)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid; v_is_open boolean; v_started timestamptz; v_pph numeric(10,2);
  v_anchor timestamptz; v_accrued numeric(10,2); v_total_min int; v_seg_min int;
begin
  select org_id, is_open, started_at, price_per_hour,
         coalesce(open_anchor_at, started_at), coalesce(open_accrued, 0)
    into v_org_id, v_is_open, v_started, v_pph, v_anchor, v_accrued
  from public.sessions where id = p_session_id;
  if not found then raise exception 'not_found'; end if;
  if not is_org_member(v_org_id) and not is_platform_admin() then raise exception 'unauthorized'; end if;
  if p_tip < 0 then raise exception 'invalid_tip'; end if;

  if v_is_open then
    v_total_min := least(1440, greatest(5, ceil(extract(epoch from (now() - v_started)) / 300.0)::int * 5));
    v_seg_min   := least(1440, greatest(5, ceil(extract(epoch from (now() - v_anchor)) / 300.0)::int * 5));
    update public.sessions
       set status = 'completed', ended_at = now(), ends_at = now(),
           duration_min = v_total_min,
           price_total  = round(v_accrued + (v_seg_min / 60.0) * v_pph, 2),
           tip_amount   = coalesce(p_tip, 0)
     where id = p_session_id and status = 'active';
  else
    update public.sessions
       set status = 'completed', ended_at = now(), tip_amount = coalesce(p_tip, 0)
     where id = p_session_id and status = 'active';
  end if;
  if not found then raise exception 'not_active'; end if;

  update public.consoles set status = 'free'
  where id = (select console_id from public.sessions where id = p_session_id);
end;
$$;

-- ── compute_session_bill: live open play = accrued + current segment ──────────
create or replace function public.compute_session_bill(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_is_open boolean; v_started timestamptz; v_pph numeric; v_ended timestamptz; v_price numeric;
  v_anchor timestamptz; v_accrued numeric;
  v_play numeric; v_play_paid boolean;
  v_paid jsonb; v_paid_total numeric; v_tab jsonb; v_tab_total numeric;
begin
  select is_open, started_at, price_per_hour, ended_at, price_total,
         coalesce(open_anchor_at, started_at), coalesce(open_accrued, 0)
    into v_is_open, v_started, v_pph, v_ended, v_price, v_anchor, v_accrued
  from public.sessions where id = p_session_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  if v_is_open and v_ended is null then
    v_play := round(v_accrued
      + least(1440, greatest(5, ceil(extract(epoch from (now() - v_anchor)) / 300.0)::int * 5)) / 60.0 * v_pph, 2);
    v_play_paid := false;
  else
    v_play := coalesce(v_price, 0);
    v_play_paid := not v_is_open;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', bi.name, 'qty', bi.qty, 'line_total', bi.line_total) order by bi.id), '[]'::jsonb),
         coalesce(sum(bi.line_total), 0)
    into v_paid, v_paid_total
  from public.bar_sales bs
  join public.bar_sale_items bi on bi.sale_id = bs.id
  where bs.session_id = p_session_id and bs.voided_at is null and bs.payment_method is not null;

  select coalesce(jsonb_agg(jsonb_build_object('name', it->>'name', 'qty', (it->>'qty')::int, 'line_total', (it->>'line_total')::numeric)), '[]'::jsonb),
         coalesce(sum((it->>'line_total')::numeric), 0)
    into v_tab, v_tab_total
  from public.service_requests sr
  cross join lateral jsonb_array_elements(sr.items) it
  where sr.session_id = p_session_id and sr.kind = 'order' and sr.status = 'delivered';

  return jsonb_build_object(
    'is_open', v_is_open,
    'play_amount', v_play, 'play_paid', v_play_paid,
    'paid_items', v_paid, 'paid_bar_total', round(v_paid_total, 2),
    'tab_items', v_tab, 'tab_total', round(v_tab_total, 2),
    'green_total', round((case when v_play_paid then v_play else 0 end) + v_paid_total, 2),
    'red_total',   round((case when v_play_paid then 0 else v_play end) + v_tab_total, 2),
    'grand_total', round(v_play + v_paid_total + v_tab_total, 2)
  );
end;
$$;
revoke all on function public.compute_session_bill(uuid) from public, anon, authenticated;

-- ── kill_abandoned_open_sessions: same accrued + segment math ─────────────────
create or replace function private.kill_abandoned_open_sessions()
returns void language plpgsql security definer set search_path = public as $$
begin
  with killed as (
    update public.sessions s
    set status       = 'completed',
        ended_at     = now(),
        ends_at      = now(),
        duration_min = least(1440, greatest(5, ceil(extract(epoch from (now() - s.started_at)) / 300.0)::int * 5)),
        price_total  = round(coalesce(s.open_accrued, 0)
          + least(1440, greatest(5, ceil(extract(epoch from (now() - coalesce(s.open_anchor_at, s.started_at))) / 300.0)::int * 5)) / 60.0
          * s.price_per_hour, 2)
    where s.is_open and s.status = 'active'
      and s.started_at < now() - interval '24 hours'
    returning s.console_id
  )
  update public.consoles c set status = 'free'
  where c.id in (select console_id from killed);
end;
$$;
revoke all on function private.kill_abandoned_open_sessions() from public, anon, authenticated;
