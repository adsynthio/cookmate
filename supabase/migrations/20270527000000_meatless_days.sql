-- Weekly no-meat days. Many Indian families eat no meat, fish or egg on certain weekdays (Tuesday for Hanuman ji,
-- Thursday, Saturday for Shani, Monday for Shiva) even though they are non-vegetarian the rest of the week. The
-- festival calendar covers dated fasts (Navratri, Ekadashi); this covers the weekly ones. On these days picks, the
-- daily suggestion and "cook from my kitchen" dishes are vegetarian for everyone; a dish asked for by name is still
-- made as asked.
--
-- ISO weekdays: 1 = Monday ... 7 = Sunday. The owner or an admin changes it (existing households update policy).
alter table public.households
  add column meatless_days smallint[] not null default '{}';
alter table public.households
  add constraint households_meatless_days_check check (meatless_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]);
comment on column public.households.meatless_days is
  'Weekdays (ISO, 1 = Monday) on which the family eats no meat, fish or egg. Picks and new dishes are vegetarian then.';
