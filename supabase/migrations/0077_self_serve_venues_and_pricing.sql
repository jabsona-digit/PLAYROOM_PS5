-- 0077 — Self-serve venue creation + plan price bump (Pro ₾50 / Enterprise ₾70).
--
-- Two owner-facing changes shipped together:
--   1. Owners can now ADD a venue ("ფილიალი") from the panel (Settings). Until now
--      venues were created only at onboarding. A club that runs billiard on a SECOND
--      physical cash register registers it as its own venue — which already gives a
--      fully separate cash drawer / Z-Report / bar / P&L for free (no new "register"
--      concept needed). The plan venue cap still applies (enforce_venue_limit, 0062:
--      trial 1 / pro 3 / ent ∞) → the natural upgrade nudge.
--   2. Raise plan prices: Pro 45→50, Enterprise 65→70. plan_monthly_price() is the
--      DB source of truth (0040); the in-app cards (billing.tsx / platform.tsx /
--      landing.tsx / guide.tsx) are updated in the same change to match.

-- ── 1. Plan prices (Pro ₾50 / Enterprise ₾70, Trial free) ────────────────────
create or replace function public.plan_monthly_price(p_plan text)
returns numeric language sql immutable as $$
  select case p_plan
    when 'pro' then 50
    when 'enterprise' then 70
    else 0
  end::numeric;
$$;
revoke all on function public.plan_monthly_price(text) from public, anon;
grant execute on function public.plan_monthly_price(text) to authenticated;

-- ── 2. create_venue — owner/admin self-serve; plan limit enforced by trigger ──
-- SECURITY DEFINER so the INSERT bypasses RLS, but is_org_admin() / is_platform_admin()
-- still read the REAL caller (auth.uid()), so the owner check and the plan cap both
-- apply correctly. enforce_venue_limit (0062) fires BEFORE INSERT and raises
-- 'plan_limit_reached:venues:N' when the tenant is at its cap.
create or replace function public.create_venue(
  p_org_id      uuid,
  p_name        text,
  p_venue_type  text default 'playroom'
)
returns public.venues
language plpgsql security definer set search_path = public as $$
declare
  v_row public.venues;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'unauthorized';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'invalid_name';
  end if;
  if p_venue_type not in ('playroom', 'billiard', 'karaoke', 'vr', 'mixed') then
    raise exception 'invalid_venue_type';
  end if;

  insert into public.venues (org_id, name, venue_type)
  values (p_org_id, btrim(p_name), p_venue_type)
  returning * into v_row;

  perform public.log_audit(p_org_id, v_row.id, 'venue.create', 'venue', v_row.id::text,
    jsonb_build_object('name', v_row.name, 'venue_type', v_row.venue_type));

  return v_row;
end;
$$;
revoke all on function public.create_venue(uuid, text, text) from public, anon;
grant execute on function public.create_venue(uuid, text, text) to authenticated;
