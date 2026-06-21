-- 0117 - Guest AI Concierge could only search venues by LOCATION + amenities (no name/city
-- text search), so "is there a club named NIKARAGUA?" returned nothing even though the venue
-- IS published. Add a p_query text filter (name / city / address ILIKE) + raise the default
-- limit 3 -> 8 (so "what clubs do you have?" actually lists them). ASCII only.

drop function if exists public.search_venues_for_ai(double precision, double precision, boolean, boolean, boolean, integer);

create or replace function public.search_venues_for_ai(
  p_query          text default null,
  p_lat            double precision default null,
  p_lng            double precision default null,
  p_require_vip    boolean default false,
  p_require_billiard boolean default false,
  p_require_bar    boolean default false,
  p_limit          integer default 8)
returns json
language plpgsql security definer set search_path = public as $$
declare v_q text;
begin
  v_q := nullif(btrim(coalesce(p_query, '')), '');
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select id, slug, name, city, address, price_from, avg_rating, amenities, lat, lng, venue_type
      from public.public_venues
      where (v_q is null
             or name ilike '%' || v_q || '%'
             or city ilike '%' || v_q || '%'
             or address ilike '%' || v_q || '%')
        and (p_require_vip = false or amenities @> '"vip"'::jsonb)
        and (p_require_billiard = false or venue_type = 'billiard' or amenities @> '"billiard"'::jsonb)
        and (p_require_bar = false or amenities @> '"bar"'::jsonb)
      order by
        -- exact name match first, then prefix, then the rest
        case when v_q is not null and lower(name) = lower(v_q) then 0
             when v_q is not null and name ilike v_q || '%' then 1
             else 2 end asc,
        case when p_lat is not null and p_lng is not null and lat is not null and lng is not null
             then (p_lat - lat) ^ 2 + (p_lng - lng) ^ 2 else 0 end asc,
        avg_rating desc nulls last
      limit greatest(1, least(coalesce(p_limit, 8), 20))
    ) t);
end; $$;

revoke all on function public.search_venues_for_ai(text, double precision, double precision, boolean, boolean, boolean, integer) from public;
grant execute on function public.search_venues_for_ai(text, double precision, double precision, boolean, boolean, boolean, integer) to anon, authenticated;
