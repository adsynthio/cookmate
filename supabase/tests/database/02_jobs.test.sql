-- Scheduled maintenance jobs: confidence decay, stale sessions, retention.
begin;
select plan(6);

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c1');
insert into public.households (id, name, created_by)
values ('00000000-0000-0000-0000-0000000000d1', 'Jobs', '00000000-0000-0000-0000-0000000000c1');
insert into public.household_members (id, household_id, user_id, display_name, role)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000c1', 'Jobs', 'owner');
insert into public.storage_locations (id, household_id, name, kind) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', 'Fridge', 'fridge'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d1', 'Staples', 'staples');

insert into public.inventory_items (id, household_id, custom_name, location_id, confidence, expiry_date) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000d1', 'palak',
   '00000000-0000-0000-0000-0000000000f1', 0.90, current_date + 3),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-0000000000d1', 'atta',
   '00000000-0000-0000-0000-0000000000f2', 0.90, null),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-0000000000d1', 'dahi',
   '00000000-0000-0000-0000-0000000000f1', 0.90, current_date - 1);

select private.decay_inventory_confidence();

select ok(
  (select confidence from public.inventory_items where custom_name = 'palak')
    < (select confidence from public.inventory_items where custom_name = 'atta'),
  'fridge produce decays faster than staples'
);
select ok(
  (select confidence from public.inventory_items where custom_name = 'dahi') <= 0.30,
  'expired items drop to 0.30 or below'
);
select is(
  (select count(*)::int from public.inventory_events where event_type = 'decayed'),
  1,
  'a decayed event is logged only when confidence crosses below 0.5'
);

insert into public.recipes (id, slug, title, diet)
values ('00000000-0000-0000-0000-000000000201', 'jobs-dal', 'Dal', 'veg');
insert into public.cooking_sessions (household_id, member_id, recipe_id, last_activity_at)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-000000000201', now() - interval '25 hours');
select is(private.abandon_stale_sessions(), 1, 'sessions idle > 24 h are abandoned');

insert into public.memories (household_id, statement, category, source, status)
values ('00000000-0000-0000-0000-0000000000d1', 'old', 'taste', 'explicit', 'forgotten');
-- the updated_at trigger resets the timestamp, so bypass it for the test
alter table public.memories disable trigger memories_set_updated_at;
update public.memories set updated_at = now() - interval '31 days';
alter table public.memories enable trigger memories_set_updated_at;

select is(
  (private.retention_cleanup() ->> 'memories_forgotten')::int,
  1,
  'forgotten memories older than 30 days are hard-deleted'
);
select is((select count(*)::int from public.memories), 0, 'memory row is gone');

select * from finish();
rollback;
