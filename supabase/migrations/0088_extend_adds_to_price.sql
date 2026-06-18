-- 0088 - extend_session must add the extension cost to the bill.
--
-- Bug: extend_session recorded the extra in session_extensions.extra_price and grew
-- ends_at, but never touched sessions.price_total. Since the cashier, the session bill
-- (0086) and history all read price_total, the extension TIME appeared but the COST did
-- not (extension revenue was effectively uncounted). Fix: for a FIXED (prepaid) session,
-- add the extension price to price_total now. OPEN sessions bill by elapsed time at
-- close (end_session recomputes price_total), so they're left untouched.

create or replace function public.extend_session(p_session_id uuid, p_extra_min int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pph   numeric(10,2);
  v_org   uuid;
  v_extra numeric(10,2);
begin
  select price_per_hour, org_id into v_pph, v_org
    from public.sessions where id = p_session_id;
  if v_pph is null then raise exception 'session_not_found'; end if;

  v_extra := round((p_extra_min / 60.0) * v_pph, 2);

  insert into public.session_extensions (org_id, session_id, extra_minutes, extra_price)
    values (v_org, p_session_id, p_extra_min, v_extra);

  update public.sessions
     set ends_at = ends_at + make_interval(mins => p_extra_min),
         price_total = case when is_open then price_total else round(price_total + v_extra, 2) end
   where id = p_session_id;
end;
$$;
