-- 0044 — Least-privilege EXECUTE grants on functions (defense-in-depth hardening).
-- Audit 2026-06-13: `anon` (unauthenticated) held EXECUTE on ~all public
-- functions. User-facing RPCs are protected by internal is_org_member /
-- is_platform_admin guards (anon → 'unauthorized'), but a few unguarded helpers
-- were exposed to anon: next_fiscal_receipt_no (could burn the fiscal receipt
-- sequence → RS.GE numbering gaps), _advance_winner (tournament bracket),
-- recompute_venue_rating. SECURITY DEFINER means these bypass RLS, so the grant
-- itself was the only gate.
--
-- Fix: revoke EXECUTE from PUBLIC + anon on every public function, grant it to
-- authenticated, then re-grant anon ONLY on the genuinely public marketplace
-- RPCs. SECURITY DEFINER parents (report_match → _advance_winner, etc.) call
-- helpers as the owner, so internal calls are unaffected. RLS + per-function
-- guards remain the primary defense.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant  execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- Public (anonymous) marketplace API — the only functions anon legitimately calls
-- (martelounge-web booking/review flow). All three are SECURITY DEFINER.
grant execute on function public.get_venue_availability(text, date) to anon;
grant execute on function public.create_marketplace_booking(
  text, timestamp with time zone, integer, text, text, text, integer, integer, integer, text, text
) to anon;
grant execute on function public.submit_review(uuid, integer, text) to anon;
