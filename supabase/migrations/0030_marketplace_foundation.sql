-- 0030 Marketplace foundation
-- Public-facing layer for martelounge.ge: venue public profiles + slugs,
-- global marketplace customers (Supabase-auth based), and anon-readable VIEWS
-- that expose ONLY public columns (never the raw venues/consoles tables).
--
-- Safety: purely additive. New columns default-safe; is_published defaults
-- FALSE so no venue appears on the marketplace until the owner opts in.

-- ── slugify helper (unicode-aware: keeps Georgian letters) ──────────────────
create or replace function public.slugify(p text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^[:alnum:]]+', '-', 'g'));
$$;

-- ── venues: public profile fields ───────────────────────────────────────────
alter table public.venues
  add column if not exists slug            text,
  add column if not exists is_published    boolean not null default false,
  add column if not exists description      text,
  add column if not exists address          text,
  add column if not exists city             text,
  add column if not exists public_phone     text,
  add column if not exists cover_image_url  text,
  add column if not exists gallery          jsonb   not null default '[]'::jsonb,
  add column if not exists amenities        jsonb   not null default '[]'::jsonb,
  add column if not exists opening_hours    jsonb,
  add column if not exists lat              double precision,
  add column if not exists lng              double precision,
  add column if not exists avg_rating       numeric(2,1) not null default 0,
  add column if not exists review_count     integer      not null default 0;

-- Backfill slugs for existing venues (Georgian names stay readable).
update public.venues
   set slug = case when slugify(name) = '' then 'venue' else slugify(name) end
 where slug is null;

-- De-dupe any collisions by appending a short id fragment.
with d as (
  select id, row_number() over (partition by slug order by created_at) as rn
    from public.venues
)
update public.venues v
   set slug = v.slug || '-' || left(replace(v.id::text, '-', ''), 6)
  from d
 where d.id = v.id and d.rn > 1;

-- Unique (NULLs allowed for not-yet-published venues created later).
create unique index if not exists venues_slug_key on public.venues (slug);
create index if not exists venues_published_idx on public.venues (is_published) where is_published;

-- ── marketplace_customers: global customers (one Supabase auth user each) ────
create table if not exists public.marketplace_customers (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  phone      text,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.marketplace_customers enable row level security;

-- A customer can read & maintain only their own profile row.
drop policy if exists mc_select_own on public.marketplace_customers;
create policy mc_select_own on public.marketplace_customers
  for select using (auth.uid() = id);

drop policy if exists mc_insert_own on public.marketplace_customers;
create policy mc_insert_own on public.marketplace_customers
  for insert with check (auth.uid() = id);

drop policy if exists mc_update_own on public.marketplace_customers;
create policy mc_update_own on public.marketplace_customers
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── public_venues VIEW (anon-readable; only published, only public columns) ──
-- security_invoker defaults to FALSE → runs as owner, bypassing venues RLS, so
-- anon sees exactly these columns and nothing else (no fiscal data, no org_id).
create or replace view public.public_venues as
  select
    v.id,
    v.slug,
    v.name,
    v.description,
    v.address,
    v.city,
    v.public_phone,
    v.cover_image_url,
    v.gallery,
    v.amenities,
    v.opening_hours,
    v.lat,
    v.lng,
    v.avg_rating,
    v.review_count,
    (select min(pp.price_per_hour)
       from public.pricing_plans pp
      where pp.org_id = v.org_id and pp.is_active) as price_from
  from public.venues v
  where v.is_published = true and v.is_active = true;

grant select on public.public_venues to anon, authenticated;
