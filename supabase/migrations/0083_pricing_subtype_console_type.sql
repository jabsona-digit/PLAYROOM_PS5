-- 0083 — VIP (and other premium rooms) as a SUB-TYPE of an asset class, not a
-- separate category. A VIP room is still a PS5 (playroom); it just has its own price.
--
-- Model: pricing_plans.category = asset class (playroom/billiard/karaoke/vr); the new
-- pricing_plans.console_type = the sub-type it targets (standard=PS5, vip, snooker…).
-- A tariff applies to a console when the category matches (or is null) AND the
-- console_type matches (or is null = all sub-types in that class).
--
-- This replaces 0082's stop-gap of making 'vip' a top-level pricing category.

alter table public.pricing_plans add column if not exists console_type text;

-- VIP: move from the (now removed) 'vip' category back under playroom as a sub-type.
update public.pricing_plans set category = 'playroom', console_type = 'vip' where category = 'vip';
-- Existing PS5 tariffs (playroom, no sub-type) target the standard PS5 sub-type, so
-- they no longer bleed onto VIP consoles.
update public.pricing_plans set console_type = 'standard' where category = 'playroom' and console_type is null;

-- category is once again only the asset class (no 'vip').
alter table public.pricing_plans drop constraint if exists pricing_plans_category_check;
alter table public.pricing_plans
  add constraint pricing_plans_category_check
  check (category is null or category in ('playroom','billiard','karaoke','vr'));

-- Expose console_type to the marketplace (booking widget filters by it).
create or replace view public.public_venue_plans as
  select v.id as venue_id, v.slug as venue_slug, pp.id as plan_id, pp.name,
    pp.price_per_hour, pp.controllers, pp.type, pp.category, pp.console_type
  from public.venues v
    join public.pricing_plans pp on pp.org_id = v.org_id and pp.is_active = true
  where v.is_published = true and v.is_active = true;
grant select on public.public_venue_plans to anon, authenticated;
