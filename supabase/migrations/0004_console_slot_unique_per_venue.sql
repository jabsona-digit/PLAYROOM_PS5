-- slot_number must be unique per venue (not globally) now that consoles are
-- multi-venue. Two venues can both have slot #1.
alter table public.consoles drop constraint if exists consoles_slot_number_key;
alter table public.consoles
  add constraint consoles_slot_number_venue_key unique (venue_id, slot_number);
