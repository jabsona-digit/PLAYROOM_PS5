-- 0113 - Let platform admins (God Mode "view as") read tournament sub-tables of orgs they
-- are NOT a member of. tournaments / tournament_groups / tournament_registrations already
-- include is_platform_admin() in their RLS; tournament_participants + tournament_matches did
-- NOT (member-only), so an impersonating God-Mode admin saw empty participants/brackets and
-- the participant-count embed returned 0. Bring them in line. ASCII only.

drop policy if exists tp_all on public.tournament_participants;
create policy tp_all on public.tournament_participants for all to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin())
  with check (public.is_org_member(org_id) or public.is_platform_admin());

drop policy if exists tm_all on public.tournament_matches;
create policy tm_all on public.tournament_matches for all to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin())
  with check (public.is_org_member(org_id) or public.is_platform_admin());
