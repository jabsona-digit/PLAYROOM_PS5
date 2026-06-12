-- 0034 Public venue pricing plans view
-- The booking form needs each published venue's active pricing tiers (name,
-- price/hour, controller count) to show options + compute the total. Plans are
-- org-scoped (RLS-protected), so expose a curated anon-readable view — same
-- pattern as public_venues. Only published+active venues, only public columns.

create or replace view public.public_venue_plans as
  select
    v.id   as venue_id,
    v.slug as venue_slug,
    pp.id  as plan_id,
    pp.name,
    pp.price_per_hour,
    pp.controllers,
    pp.type
  from public.venues v
  join public.pricing_plans pp
    on pp.org_id = v.org_id and pp.is_active = true
  where v.is_published = true and v.is_active = true;

grant select on public.public_venue_plans to anon, authenticated;
