-- 0043 — Bring the founder-bootstrap trigger under version control.
-- This function + trigger existed only in the live DB (created manually, never
-- recorded in schema_migrations — the last piece of drift; see
-- accounting-schema-drift). It auto-provisions the platform founder: on signup
-- of the founder email, grant platform_admin + owner of the 'demo' org.
-- Idempotent (create or replace / drop-if-exists) and already live in prod, so
-- re-applying is a no-op. NB: the founder email is environment-specific — change
-- it (or remove this trigger) for a fresh deployment.

create or replace function public.bootstrap_founder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid;
begin
  if new.email = 'j19mt85@gmail.com' then
    insert into public.platform_admins (user_id)
      values (new.id) on conflict do nothing;
    select id into v_org from public.organizations where slug = 'demo' limit 1;
    if v_org is not null then
      insert into public.org_members (org_id, user_id, role)
        values (v_org, new.id, 'owner') on conflict do nothing;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_bootstrap_founder on auth.users;
create trigger trg_bootstrap_founder
  after insert on auth.users
  for each row execute function public.bootstrap_founder();
