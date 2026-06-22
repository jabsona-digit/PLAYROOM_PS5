-- 0123 - No-show booking reminders. Channel: EMAIL now (Resend via pg_net), SMS later (Twilio
-- via an edge fn — seam noted below). A pg_cron job finds marketplace bookings starting soon and
-- emails the customer a friendly Georgian reminder → fewer no-shows.
--
-- DB -> pg_net -> Resend API. The API key lives in Vault ('resend_api_key', created out-of-band).
-- notify_email NO-OPS (returns null) until the key is set, so this migration is SAFE to ship before
-- setup — the cron just finds nothing to mark until Resend is configured. Mirrors the Telegram
-- notify pattern (0101). Georgian appears in the email body -> apply via the manual-escape path.

-- 1) idempotency marker + a light send log (ops/debug)
alter table public.marketplace_bookings
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists reminder_channel text;

create table if not exists public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  channel     text not null,
  recipient   text,
  booking_id  uuid,
  request_id  bigint,
  status      text,
  created_at  timestamptz not null default now()
);
alter table public.notification_log enable row level security;
drop policy if exists nlog_read on public.notification_log;
create policy nlog_read on public.notification_log for select to authenticated using (public.is_platform_admin());
revoke all on public.notification_log from anon;
-- writes go through the SECURITY DEFINER sender only

-- 2) notify_email: DB -> pg_net -> Resend. Returns the pg_net request id, or NULL if not yet
--    configured (so the caller won't mark a booking 'reminded' before the key exists).
create or replace function public.notify_email(p_to text, p_subject text, p_html text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_key text; v_req bigint;
begin
  if coalesce(btrim(p_to), '') = '' then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key';
  if v_key is null then return null; end if;          -- not configured yet -> graceful no-op
  select net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object(
      'from', 'Martelounge <noreply@martelounge.ge>',
      'to', jsonb_build_array(p_to),
      'subject', p_subject,
      'html', p_html
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    timeout_milliseconds := 15000
  ) into v_req;
  return v_req;
end; $$;
revoke all on function public.notify_email(text, text, text) from public, anon, authenticated;

-- 3) send_booking_reminders: cron worker — remind upcoming bookings once, ~within 3h of start.
--    Email is taken from marketplace_customers.email, else the auth account email (always present).
create or replace function public.send_booking_reminders()
returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_email text; v_venue text; v_when text; v_subj text; v_html text; v_req bigint;
begin
  for r in
    select b.id, b.customer_id, b.customer_name, b.start_time, b.duration_min, b.venue_id
    from public.marketplace_bookings b
    where b.status in ('pending', 'confirmed')
      and b.reminder_sent_at is null
      and b.start_time > now()
      and b.start_time <= now() + interval '3 hours'
  loop
    select coalesce(mc.email, au.email) into v_email
      from auth.users au
      left join public.marketplace_customers mc on mc.id = r.customer_id
      where au.id = r.customer_id;
    if coalesce(btrim(v_email), '') = '' then continue; end if;

    select name into v_venue from public.venues where id = r.venue_id;
    v_when := to_char(r.start_time at time zone 'Asia/Tbilisi', 'DD Mon, HH24:MI');
    v_subj := 'შეხსენება — ' || coalesce(v_venue, 'ჯავშანი') || ' · ' || v_when;
    v_html :=
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">'
      || '<h2 style="color:#0ea5a4">გელოდებით! 🎮</h2>'
      || '<p>' || coalesce(r.customer_name, '') || ', შეგახსენებთ თქვენს ჯავშანს:</p>'
      || '<div style="background:#f4f4f5;border-radius:12px;padding:16px;margin:12px 0">'
      || '<b style="font-size:16px">' || coalesce(v_venue, '') || '</b><br>'
      || '🗓 ' || v_when || '<br>'
      || '⏱ ' || coalesce(r.duration_min, 0) || ' წუთი</div>'
      || '<p>თუ ვერ მოახერხებთ მოსვლას, გთხოვთ წინასწარ შეგვატყობინოთ — სხვას დაუთმობთ ადგილს. 🙏</p>'
      || '<p style="color:#888;font-size:12px">play.martelounge.ge</p></div>';

    begin
      v_req := public.notify_email(v_email, v_subj, v_html);
    exception when others then v_req := null;
    end;

    if v_req is not null then
      update public.marketplace_bookings set reminder_sent_at = now(), reminder_channel = 'email' where id = r.id;
      insert into public.notification_log (kind, channel, recipient, booking_id, request_id, status)
        values ('booking_reminder', 'email', v_email, r.id, v_req, 'queued');
    end if;
  end loop;
end; $$;
revoke all on function public.send_booking_reminders() from public, anon, authenticated;

-- 4) run every 30 min (re-schedulable)
do $$ begin perform cron.unschedule('booking-reminders'); exception when others then null; end $$;
select cron.schedule('booking-reminders', '*/30 * * * *', $$ select public.send_booking_reminders(); $$);

-- SMS-LATER SEAM: when the owner has a Twilio account, add notify_sms (Twilio needs form-encoded
-- body + Basic auth → cleanest via an edge fn, not pg_net) and in send_booking_reminders prefer SMS
-- (phone present + creds configured) else email. reminder_channel already records which was used.
