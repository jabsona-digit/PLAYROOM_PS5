-- 0108 - Tournaments 2.0 Phase 2b: public marketplace listing.
-- Anon-readable view of platform tournaments (owner-rights view bypasses RLS, like
-- public_venues). Exposes only public platform tournaments; venue fields come from a
-- LEFT JOIN (null while still seeking a host). The marketplace (play.martelounge.ge)
-- /tournaments page reads this with the cookie-less anon client. ASCII only.

create or replace view public.public_tournaments
with (security_invoker = false) as
select
  t.id,
  t.name,
  t.game,
  t.format,
  t.status,
  t.entry_fee,
  t.prize_pool,
  t.starts_at,
  t.group_size,
  t.advance_per_group,
  t.max_participants,
  (select count(*) from public.tournament_participants p where p.tournament_id = t.id) as participant_count,
  case when v.is_published then v.slug else null end as venue_slug,
  v.name            as venue_name,
  v.city            as venue_city,
  v.cover_image_url as venue_cover,
  v.venue_type      as venue_type
from public.tournaments t
left join public.venues v on v.id = t.venue_id
where t.creator_scope = 'platform'
  and t.is_public = true
  and t.status in ('seeking_host', 'registration', 'active', 'completed');

grant select on public.public_tournaments to anon, authenticated;
