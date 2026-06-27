-- 0141 - Fair early-end for FIXED sessions (per-venue setting).
-- Owner ask (2026-06-26): a fixed prepaid block (e.g. 1h @ ₾5) currently charges the FULL
-- block even if the customer leaves after 10 min. That's unfair for a walk-in lounge. Add
-- a per-venue toggle: when ON, ending a fixed session BEFORE its planned end bills only the
-- ACTUAL time played (5-min round-up, at the session rate), capped at the booked amount
-- (never more than prepaid). Default OFF = today's behavior (full block), so nothing changes
-- for a venue until its owner opts in. Open (pay-as-you-go) sessions already bill actual.

alter table public.venues add column if not exists early_end_actual boolean not null default false;

create or replace function public.end_session(p_session_id uuid, p_tip numeric default 0)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid; v_is_open boolean; v_started timestamptz; v_pph numeric(10,2);
  v_ends_at timestamptz; v_duration_min int; v_early_actual boolean;
  v_anchor timestamptz; v_accrued numeric(10,2); v_total_min int; v_seg_min int; v_act_min int;
begin
  select s.org_id, s.is_open, s.started_at, s.price_per_hour, s.ends_at, s.duration_min,
         coalesce(s.open_anchor_at, s.started_at), coalesce(s.open_accrued, 0),
         coalesce(v.early_end_actual, false)
    into v_org_id, v_is_open, v_started, v_pph, v_ends_at, v_duration_min, v_anchor, v_accrued, v_early_actual
  from public.sessions s join public.venues v on v.id = s.venue_id
  where s.id = p_session_id;
  if not found then raise exception 'not_found'; end if;
  if not is_org_member(v_org_id) and not is_platform_admin() then raise exception 'unauthorized'; end if;
  if p_tip < 0 then raise exception 'invalid_tip'; end if;

  if v_is_open then
    -- open: accrued (banked prior segments) + current rate segment (5-min round-up, 1440 cap)
    v_total_min := least(1440, greatest(5, ceil(extract(epoch from (now() - v_started)) / 300.0)::int * 5));
    v_seg_min   := least(1440, greatest(5, ceil(extract(epoch from (now() - v_anchor)) / 300.0)::int * 5));
    update public.sessions
       set status = 'completed', ended_at = now(), ends_at = now(),
           duration_min = v_total_min,
           price_total  = round(v_accrued + (v_seg_min / 60.0) * v_pph, 2),
           tip_amount   = coalesce(p_tip, 0)
     where id = p_session_id and status = 'active';
  elsif v_early_actual and v_ends_at is not null and now() < v_ends_at then
    -- fixed + venue opted in + ended EARLY: bill actual time (5-min round-up), capped at booked
    v_act_min := least(coalesce(v_duration_min, 1440),
                       greatest(5, ceil(extract(epoch from (now() - v_started)) / 300.0)::int * 5));
    update public.sessions
       set status = 'completed', ended_at = now(),
           price_total = least(price_total, round((v_act_min / 60.0) * v_pph, 2)),
           tip_amount  = coalesce(p_tip, 0)
     where id = p_session_id and status = 'active';
  else
    -- fixed (full prepaid block) — unchanged
    update public.sessions
       set status = 'completed', ended_at = now(), tip_amount = coalesce(p_tip, 0)
     where id = p_session_id and status = 'active';
  end if;
  if not found then raise exception 'not_active'; end if;

  update public.consoles set status = 'free'
  where id = (select console_id from public.sessions where id = p_session_id);
end;
$$;
