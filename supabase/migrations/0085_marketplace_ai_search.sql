-- 0085 — Marketplace AI Search RPCs (Gemini-authored; hardened by Claude).
--
-- Spatial/amenity search + live availability for the guest-facing AI Concierge.
-- Hardening applied: SECURITY DEFINER functions now pin `search_path = public`
-- (search_path-hijack guard, consistent with the rest of the project); billiard
-- filter checks venue_type (not just amenities); availability counts ACTIVE sessions.

-- 1) Advanced search for the AI agent
create or replace function public.search_venues_for_ai(
  p_lat double precision default null,
  p_lng double precision default null,
  p_require_vip boolean default false,
  p_require_billiard boolean default false,
  p_require_bar boolean default false,
  p_limit integer default 3
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select id, slug, name, city, address, price_from, avg_rating, amenities, lat, lng, venue_type
      from public.public_venues
      where
        (p_require_vip = false or amenities @> '"vip"'::jsonb) and
        (p_require_billiard = false or venue_type = 'billiard' or amenities @> '"billiard"'::jsonb) and
        (p_require_bar = false or amenities @> '"bar"'::jsonb)
      order by
        case
          when p_lat is not null and p_lng is not null and lat is not null and lng is not null
          then (p_lat - lat)^2 + (p_lng - lng)^2
          else 0
        end asc,
        avg_rating desc nulls last
      limit p_limit
    ) t
  );
end;
$$;
revoke all on function public.search_venues_for_ai(double precision, double precision, boolean, boolean, boolean, integer) from public;
grant execute on function public.search_venues_for_ai(double precision, double precision, boolean, boolean, boolean, integer) to anon, authenticated;

-- 2) Live availability for the AI agent (counts ACTIVE sessions, not console.status)
create or replace function public.check_venue_availability_for_ai(p_venue_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_busy  int;
begin
  select count(*),
         count(*) filter (where exists (
           select 1 from public.sessions s where s.console_id = c.id and s.status = 'active'))
    into v_total, v_busy
  from public.consoles c
  where c.venue_id = p_venue_id and c.deleted_at is null;

  return json_build_object(
    'total_consoles', coalesce(v_total, 0),
    'busy_consoles',  coalesce(v_busy, 0),
    'free_consoles',  coalesce(v_total, 0) - coalesce(v_busy, 0),
    'occupancy_pct',  case when coalesce(v_total, 0) > 0
                        then round((coalesce(v_busy, 0)::numeric / v_total) * 100) else 0 end
  );
end;
$$;
revoke all on function public.check_venue_availability_for_ai(uuid) from public;
grant execute on function public.check_venue_availability_for_ai(uuid) to anon, authenticated;
