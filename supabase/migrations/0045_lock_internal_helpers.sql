-- 0045 — Strip direct EXECUTE on internal-only functions (trigger functions +
-- internal helpers). They run via the trigger system / are called by SECURITY
-- DEFINER parents as the owner, so no client role needs direct EXECUTE. 0044
-- granted authenticated EXECUTE on EVERY function (incl. these); this walks it
-- back for the internal ones.
--
-- Notably closes `_advance_winner` (SECURITY DEFINER, no org guard): after 0044
-- an authenticated user could call it directly to advance an arbitrary match and
-- rig ANOTHER tenant's tournament bracket (bypassing RLS). report_match still
-- calls it internally as owner, so brackets keep working.
--
-- next_fiscal_receipt_no is intentionally EXCLUDED — the receipt UI
-- (lib/fiscal.ts) calls it directly, so authenticated must keep it.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.prorettype = 'pg_catalog.trigger'::regtype   -- trigger functions (audit, capacity, set_updated_at, founder…)
        or p.proname = '_advance_winner'                -- internal tournament helper
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
