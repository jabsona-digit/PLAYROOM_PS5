-- 0053 — Phase 2 (step 2): per-operator attribution.
-- Record WHICH logged-in user created each session / bar sale, so a shared venue
-- board (multiple operators) still has clear accountability ("who sold what").
-- A column DEFAULT auth.uid() captures the caller even when the row is inserted
-- by a SECURITY DEFINER RPC (start_session / create_bar_sale): SECURITY DEFINER
-- changes the role, NOT the request JWT claims auth.uid() reads. No RPC rewrite.

alter table public.sessions
  add column if not exists created_by_user uuid references auth.users(id) default auth.uid();

alter table public.bar_sales
  add column if not exists created_by_user uuid references auth.users(id) default auth.uid();

create index if not exists sessions_created_by_user_idx on public.sessions(created_by_user);
create index if not exists bar_sales_created_by_user_idx on public.bar_sales(created_by_user);
