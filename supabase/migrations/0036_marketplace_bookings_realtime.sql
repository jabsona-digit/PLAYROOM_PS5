-- 0036 Realtime for online bookings
-- Add marketplace_bookings to the supabase_realtime publication so the admin
-- gets a live notification (bell badge + toast) when a new booking arrives,
-- on whatever module they're viewing. RLS still applies — staff only receive
-- changes for rows they can SELECT (is_org_member on their own org).

alter publication supabase_realtime add table public.marketplace_bookings;
