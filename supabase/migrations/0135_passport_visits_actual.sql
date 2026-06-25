-- 0135 - Gamer Passport: count a "visit" only when it ACTUALLY happened.
-- Bug (owner-found 2026-06-25): get_gamer_passport (0112) counted every booking
-- that wasn't cancelled/no_show as a visit -> a freshly-made online booking (status
-- 'pending', player not yet arrived) immediately showed as 1 visit. A real visit is
-- recorded when the operator checks the player in at the club: online-bookings.tsx
-- sets checked_in_at (0039). So redefine the booking aggregate to count only bookings
-- the person actually showed up for: checked_in_at is not null OR status = 'completed'.
-- Same flawed filter also inflated venues (explorer badge) and booking spend (VIP) ->
-- fix all three from the one corrected filter. No schema change; recompute only.

create or replace function public.get_gamer_passport()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid;
  v_visits int; v_venues int; v_book_spent numeric;
  v_tours int; v_checkins int; v_tour_spent numeric;
  v_wins int; v_reviews int; v_spent numeric; v_xp int; v_level int;
begin
  uid := auth.uid();
  if uid is null then return jsonb_build_object('error', 'not_authenticated'); end if;

  -- a real visit = operator checked the player in, or the booking was completed
  select count(*) filter (where checked_in_at is not null or status = 'completed'),
         count(distinct venue_id) filter (where checked_in_at is not null or status = 'completed'),
         coalesce(sum(total_amount) filter (where checked_in_at is not null or status = 'completed'), 0)
    into v_visits, v_venues, v_book_spent
    from public.marketplace_bookings where customer_id = uid;

  select count(*) filter (where status <> 'cancelled'),
         count(*) filter (where status = 'checked_in'),
         coalesce(sum(paid_amount) filter (where status = 'checked_in'), 0)
    into v_tours, v_checkins, v_tour_spent
    from public.tournament_registrations where customer_id = uid;

  select count(*) into v_wins
    from public.tournament_registrations r
    join public.tournaments t on t.id = r.tournament_id
    where r.customer_id = uid and r.participant_id is not null
      and t.winner_participant_id = r.participant_id;

  select count(*) into v_reviews from public.marketplace_reviews where customer_id = uid;

  v_spent := coalesce(v_book_spent, 0) + coalesce(v_tour_spent, 0);
  v_xp := v_visits * 10 + v_checkins * 25 + v_wins * 100 + v_reviews * 15 + v_venues * 20;
  v_level := floor(v_xp / 100.0)::int + 1;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'visits', v_visits, 'venues', v_venues, 'tournaments', v_tours, 'checkins', v_checkins,
      'wins', v_wins, 'reviews', v_reviews, 'spent', round(v_spent, 2),
      'xp', v_xp, 'level', v_level, 'level_xp', v_xp - (v_level - 1) * 100, 'next_level_xp', 100),
    'badges', jsonb_build_array(
      jsonb_build_object('key', 'first_booking', 'current', v_visits, 'target', 1,  'earned', v_visits >= 1),
      jsonb_build_object('key', 'regular',       'current', v_visits, 'target', 5,  'earned', v_visits >= 5),
      jsonb_build_object('key', 'veteran',       'current', v_visits, 'target', 25, 'earned', v_visits >= 25),
      jsonb_build_object('key', 'explorer',      'current', v_venues, 'target', 3,  'earned', v_venues >= 3),
      jsonb_build_object('key', 'fighter',       'current', v_tours,  'target', 1,  'earned', v_tours >= 1),
      jsonb_build_object('key', 'fighter_vet',   'current', v_tours,  'target', 5,  'earned', v_tours >= 5),
      jsonb_build_object('key', 'champion',      'current', v_wins,   'target', 1,  'earned', v_wins >= 1),
      jsonb_build_object('key', 'legend',        'current', v_wins,   'target', 3,  'earned', v_wins >= 3),
      jsonb_build_object('key', 'critic',        'current', v_reviews,'target', 1,  'earned', v_reviews >= 1),
      jsonb_build_object('key', 'vip',           'current', round(v_spent)::int, 'target', 500, 'earned', v_spent >= 500)
    )
  );
end; $$;
revoke all on function public.get_gamer_passport() from public, anon;
grant execute on function public.get_gamer_passport() to authenticated;
