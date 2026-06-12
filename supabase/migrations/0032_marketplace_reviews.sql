-- 0032 Marketplace reviews
-- Customers review a COMPLETED booking (one review per booking). A trigger
-- keeps venues.avg_rating / review_count denormalized for fast listing sort.
-- Public reads go through the public_reviews view (anon); writes via RPCs.

create table if not exists public.marketplace_reviews (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id),
  venue_id    uuid not null references public.venues(id),
  booking_id  uuid references public.marketplace_bookings(id) on delete set null,
  customer_id uuid not null references public.marketplace_customers(id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  comment     text,
  reply       text,                       -- venue's public response
  created_at  timestamptz not null default now()
);

-- one review per booking (lets submit_review upsert on edit)
create unique index if not exists mr_booking_key on public.marketplace_reviews (booking_id)
  where booking_id is not null;
create index if not exists mr_venue_idx on public.marketplace_reviews (venue_id);

-- ── keep venues.avg_rating / review_count in sync ───────────────────────────
create or replace function public.recompute_venue_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_venue uuid := coalesce(new.venue_id, old.venue_id);
begin
  update public.venues set
    avg_rating   = coalesce((select round(avg(rating), 1) from public.marketplace_reviews where venue_id = v_venue), 0),
    review_count = (select count(*) from public.marketplace_reviews where venue_id = v_venue)
  where id = v_venue;
  return null;
end; $$;

drop trigger if exists trg_review_rating on public.marketplace_reviews;
create trigger trg_review_rating
  after insert or update or delete on public.marketplace_reviews
  for each row execute function public.recompute_venue_rating();

alter table public.marketplace_reviews enable row level security;

drop policy if exists mr_select_own on public.marketplace_reviews;
create policy mr_select_own on public.marketplace_reviews
  for select using (auth.uid() = customer_id);

drop policy if exists mr_staff_select on public.marketplace_reviews;
create policy mr_staff_select on public.marketplace_reviews
  for select using (public.is_org_member(org_id));

drop policy if exists mr_update_own on public.marketplace_reviews;
create policy mr_update_own on public.marketplace_reviews
  for update using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

drop policy if exists mr_delete_own on public.marketplace_reviews;
create policy mr_delete_own on public.marketplace_reviews
  for delete using (auth.uid() = customer_id);

-- ── public_reviews VIEW (anon): rating + comment + reply + author name ──────
create or replace view public.public_reviews as
  select r.id, r.venue_id, r.rating, r.comment, r.reply, r.created_at,
         mc.full_name as author
  from public.marketplace_reviews r
  join public.marketplace_customers mc on mc.id = r.customer_id;

grant select on public.public_reviews to anon, authenticated;

-- ── submit a review for a completed booking (customer) ──────────────────────
create or replace function public.submit_review(
  p_booking_id uuid, p_rating integer, p_comment text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_venue uuid;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'invalid_rating'; end if;

  select org_id, venue_id into v_org, v_venue
    from public.marketplace_bookings
   where id = p_booking_id and customer_id = v_uid and status = 'completed';
  if v_venue is null then raise exception 'booking_not_reviewable'; end if;

  insert into public.marketplace_reviews (org_id, venue_id, booking_id, customer_id, rating, comment)
    values (v_org, v_venue, p_booking_id, v_uid, p_rating, p_comment)
    on conflict (booking_id) do update
      set rating = excluded.rating, comment = excluded.comment
    returning id into v_id;

  return v_id;
end; $$;

grant execute on function public.submit_review(uuid, integer, text) to authenticated;

-- ── venue replies to a review (staff) ───────────────────────────────────────
create or replace function public.reply_to_review(p_id uuid, p_reply text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.marketplace_reviews
     set reply = p_reply
   where id = p_id and public.is_org_member(org_id);
  if not found then raise exception 'not_authorized'; end if;
end; $$;

grant execute on function public.reply_to_review(uuid, text) to authenticated;
