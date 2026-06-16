-- 0072 Hardware "grace" — delayed power-off after a session ends.
--
-- For billiard tables the control lever is the overhead LAMP (target='light',
-- added in 0071). Auto-control is identical to PS5 (relay ON at session start),
-- but cutting the lamp the instant the session ends is harsh — the customer is
-- still paying / racking up in the dark. So an owner can set a short grace: the
-- lamp stays on for off_delay_seconds after session end, then turns off.
--
-- Default 0 = no grace (unchanged for PS5/TV — instant off). Anti-fraud is
-- unaffected: the relay is still ON only because a paid session existed; grace
-- only defers the OFF, it never enables a light without a session.

alter table public.console_hardware
  add column if not exists off_delay_seconds int not null default 0
    check (off_delay_seconds between 0 and 600);

comment on column public.console_hardware.off_delay_seconds is
  'Seconds to keep the relay ON after session_end before turning it off (billiard lamp grace). 0 = instant off (PS5/TV default).';
