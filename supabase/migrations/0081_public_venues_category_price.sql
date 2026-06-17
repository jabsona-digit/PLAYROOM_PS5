-- 0081 — public_venues.price_from is category-aware.
--
-- price_from drove the "from ₾X / hr" on the marketplace card + venue header as the
-- MIN over ALL of the org's active plans. A billiard-only venue therefore showed the
-- org's cheapest PS5 plan (₾5) instead of its billiard tariff (₾15). Now the min is
-- scoped to the venue's category: a billiard venue counts billiard plans, a playroom
-- venue counts playroom plans, a 'mixed' venue counts everything; category-null plans
-- (apply to all) are always included. pricing_plans.category is from migration 0074.
--
-- (A one-off data fix also ran with this migration: backfilled the billiard venue's
--  cover_image_url from gallery[0], since the photo was uploaded into the gallery and
--  the card/header render cover_image_url.)

create or replace view public.public_venues as
  select
    v.id, v.slug, v.name, v.description, v.address, v.city, v.public_phone,
    v.cover_image_url, v.gallery, v.amenities, v.opening_hours, v.lat, v.lng,
    v.avg_rating, v.review_count,
    (select min(pp.price_per_hour)
       from public.pricing_plans pp
      where pp.org_id = v.org_id and pp.is_active
        and (v.venue_type = 'mixed' or pp.category is null or pp.category = v.venue_type)) as price_from,
    v.venue_type
  from public.venues v
  where v.is_published = true and v.is_active = true;

grant select on public.public_venues to anon, authenticated;
