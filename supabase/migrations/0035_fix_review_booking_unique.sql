-- 0035 Fix one-review-per-booking constraint
-- submit_review() uses `on conflict (booking_id) do update`, but 0032 created a
-- PARTIAL unique index (`where booking_id is not null`). Postgres can't match a
-- bare `on conflict (booking_id)` to a partial index → 42P10. A full unique
-- index works the same (NULL booking_ids stay distinct, so orphaned reviews
-- after a booking delete are still allowed) and satisfies the ON CONFLICT.

drop index if exists public.mr_booking_key;
create unique index mr_booking_key on public.marketplace_reviews (booking_id);
