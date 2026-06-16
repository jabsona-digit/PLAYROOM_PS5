-- 0074 Tie a pricing plan to an asset CATEGORY (so billiard bookings only list
-- billiard tariffs, PS5 only PS5, etc).
--
-- We use a coarse CATEGORY (playroom/billiard/karaoke/vr), NOT an exact
-- console_type — so one "PS5 Pro" tariff covers standard/coupe/vip together,
-- while a billiard tariff is its own bucket. NULL = applies to ALL types
-- (backward compatible: existing tariffs keep showing everywhere until tagged).

alter table public.pricing_plans
  add column if not exists category text
    check (category is null or category in ('playroom', 'billiard', 'karaoke', 'vr'));

comment on column public.pricing_plans.category is
  'Asset category this tariff applies to (playroom|billiard|karaoke|vr). NULL = all. Matched against consoleCategory(console_type) at booking/session start.';

-- public_venue_plans — expose category (append at END; keep existing column order).
create or replace view public.public_venue_plans as
  select
    v.id   as venue_id,
    v.slug as venue_slug,
    pp.id  as plan_id,
    pp.name,
    pp.price_per_hour,
    pp.controllers,
    pp.type,
    pp.category
  from public.venues v
  join public.pricing_plans pp
    on pp.org_id = v.org_id and pp.is_active = true
  where v.is_published = true and v.is_active = true;

grant select on public.public_venue_plans to anon, authenticated;
