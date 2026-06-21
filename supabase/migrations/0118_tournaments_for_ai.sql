-- 0118 - Give the guest AI Concierge a tournaments tool. It could answer about venues but not
-- about tournaments ("do you have tournaments?" -> "I don't have that info"). This reads the
-- public_tournaments view (already anon-safe) for upcoming/open tournaments. ASCII only.

create or replace function public.search_tournaments_for_ai(p_query text default null)
returns json
language plpgsql stable security definer set search_path = public as $$
declare v_q text;
begin
  v_q := nullif(btrim(coalesce(p_query, '')), '');
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select name, game, status, entry_fee, prize_pool, prize_second, prize_third_minutes,
             min_participants, starts_at, venue_name, venue_city, venue_slug, participant_count
      from public.public_tournaments
      where status in ('registration', 'active', 'seeking_host')
        and (v_q is null
             or name ilike '%' || v_q || '%'
             or coalesce(game, '') ilike '%' || v_q || '%'
             or coalesce(venue_name, '') ilike '%' || v_q || '%'
             or coalesce(venue_city, '') ilike '%' || v_q || '%')
      order by starts_at nulls last
      limit 10
    ) t);
end; $$;

revoke all on function public.search_tournaments_for_ai(text) from public;
grant execute on function public.search_tournaments_for_ai(text) to anon, authenticated;
