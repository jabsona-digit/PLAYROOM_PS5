-- 0033 Marketplace hardening (advisor follow-up)
-- 1) Pin slugify's search_path (it touches only built-ins).
-- 2) Postgres grants EXECUTE to PUBLIC by default — that lets the `anon` role
--    call our SECURITY DEFINER RPCs. Revoke the blanket PUBLIC grant and hand
--    EXECUTE only to the role that should have it. The RPCs already reject
--    unauthenticated callers (auth.uid() checks); this is defense-in-depth.

-- slugify: fixed search_path (uses only pg_catalog built-ins)
create or replace function public.slugify(p text)
returns text language sql immutable set search_path = pg_catalog as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^[:alnum:]]+', '-', 'g'));
$$;

-- Customer-only RPCs: authenticated may call, anon may not.
revoke execute on function public.create_marketplace_booking(
  text, timestamptz, integer, text, text, integer, integer, integer, integer, text, text
) from public;
revoke execute on function public.submit_review(uuid, integer, text) from public;

-- Staff-only RPC.
revoke execute on function public.reply_to_review(uuid, text) from public;

-- Trigger function: never callable directly over the API.
revoke execute on function public.recompute_venue_rating() from public;

-- Public availability lookup stays open to anon by design — make it explicit.
revoke execute on function public.get_venue_availability(text, date) from public;
grant execute on function public.get_venue_availability(text, date) to anon, authenticated;
