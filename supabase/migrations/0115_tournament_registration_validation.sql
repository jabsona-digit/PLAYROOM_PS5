-- 0115 - Harden tournament online registration: require a VALID Georgian mobile + email
-- (server-side, so it can't be bypassed). Stops garbage "1-digit phone" sign-ups that never
-- show up and can't be reached. Adds email to the registration; register_for_tournament gains
-- a p_email arg + strict validation. ASCII only.

alter table public.tournament_registrations add column if not exists email text;

drop function if exists public.register_for_tournament(uuid, text, text);

create or replace function public.register_for_tournament(p_tournament uuid, p_name text, p_phone text, p_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_status text; v_max int; v_cnt int; v_id uuid; v_phone text; v_email text;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;

  -- phone: Georgian mobile = 9 digits starting with 5; tolerate +995 / spaces / dashes
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_phone) = 12 and left(v_phone, 3) = '995' then v_phone := substr(v_phone, 4); end if;
  if length(v_phone) <> 9 or left(v_phone, 1) <> '5' then raise exception 'invalid_phone'; end if;

  -- email: basic shape check
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_email'; end if;

  select status, max_participants into v_status, v_max
    from public.tournaments where id = p_tournament and is_public = true;
  if v_status is null then raise exception 'tournament_not_found'; end if;
  if v_status <> 'registration' then raise exception 'registration_closed'; end if;

  if v_max is not null then
    select count(*) into v_cnt from public.tournament_registrations
      where tournament_id = p_tournament and status in ('registered', 'checked_in');
    if v_cnt >= v_max
       and not exists (select 1 from public.tournament_registrations
                       where tournament_id = p_tournament and customer_id = v_uid) then
      raise exception 'tournament_full';
    end if;
  end if;

  insert into public.marketplace_customers (id, full_name, phone, email)
    values (v_uid, p_name, v_phone, v_email)
    on conflict (id) do update
      set full_name = coalesce(nullif(excluded.full_name, ''), public.marketplace_customers.full_name),
          phone = excluded.phone,
          email = coalesce(nullif(excluded.email, ''), public.marketplace_customers.email);

  insert into public.tournament_registrations (tournament_id, customer_id, display_name, phone, email, status)
    values (p_tournament, v_uid, p_name, v_phone, v_email, 'registered')
    on conflict (tournament_id, customer_id) do update
      set display_name = excluded.display_name, phone = excluded.phone, email = excluded.email,
          status = case when public.tournament_registrations.status = 'checked_in'
                        then 'checked_in' else 'registered' end
    returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.register_for_tournament(uuid, text, text, text) from public, anon;
grant execute on function public.register_for_tournament(uuid, text, text, text) to authenticated;

-- operator list: surface email alongside phone so staff can reach no-shows
create or replace function public.get_tournament_registrations(p_tournament uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.tournaments where id = p_tournament;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'display_name', display_name, 'phone', phone, 'email', email, 'status', status,
      'paid_amount', paid_amount, 'paid_method', paid_method, 'checked_in_at', checked_in_at
    ) order by created_at)
    from public.tournament_registrations where tournament_id = p_tournament
  ), '[]'::jsonb);
end; $$;
revoke all on function public.get_tournament_registrations(uuid) from public, anon;
grant execute on function public.get_tournament_registrations(uuid) to authenticated;
