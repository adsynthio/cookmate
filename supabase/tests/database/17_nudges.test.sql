-- Nudges: decay by state (KIT-035), one pantry check a day (KIT-035), notification settings and who is due for the
-- daily pick (KIT-045), festivals seeded (KIT-144), old exports found for the sweep.
begin;
select plan(23);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000f1', true), ('00000000-0000-0000-0000-0000000000f2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select set_config('t.hh', public.create_household('Nudge test', 'en-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id', true);
select set_config('t.ids', array_to_string(public.add_inventory_items(current_setting('t.hh')::uuid, '[
  {"name":"paneer","quantity":200,"unit":"g","location_kind":"fridge"},
  {"name":"dal","quantity":1,"unit":"katori","location_kind":"fridge","state":"leftover"},
  {"name":"atta","quantity":5,"unit":"kg"}
]'::jsonb, 'text'), ','), true);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select set_config('t.other', public.create_household('Other', 'en-IN', '[{"display_name":"Bo","is_self":true}]'::jsonb) ->> 'household_id', true);
reset role;

create temp table ids on commit drop as
  select u::uuid as id, ord from unnest(string_to_array(current_setting('t.ids'), ',')) with ordinality as x(u, ord);
grant select on ids to authenticated;

-- --- decay by state -----------------------------------------------------------------------------------------
update public.inventory_items set confidence = 0.95 where household_id = current_setting('t.hh')::uuid;
select ok(private.decay_inventory_confidence() >= 3, 'the nightly job decays every active item');
select ok((select confidence from public.inventory_items where id = (select id from ids where ord = 2))
        < (select confidence from public.inventory_items where id = (select id from ids where ord = 1)),
  'a leftover in the fridge loses confidence faster than paneer next to it');
select ok((select confidence from public.inventory_items where id = (select id from ids where ord = 3)) >= 0.93,
  'flour in the pantry barely moves in a night');

-- --- one check question a day -------------------------------------------------------------------------------
update public.inventory_items set confidence = 0.45 where id in (select id from ids where ord in (1, 2));
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select is(public.pantry_check_today(current_setting('t.hh')::uuid), null, 'nothing asked yet, nothing proposed: no question');
select is(public.pantry_check_today(current_setting('t.hh')::uuid, (select id from ids where ord = 1)), (select id from ids where ord = 1),
  'the proposed item becomes today''s question');
select is(public.pantry_check_today(current_setting('t.hh')::uuid, (select id from ids where ord = 2)), (select id from ids where ord = 1),
  'a second proposal the same day gets the same question back');
select public.update_inventory_item((select id from ids where ord = 1), '{"confirm": true}'::jsonb);
select is(public.pantry_check_today(current_setting('t.hh')::uuid, (select id from ids where ord = 2)), null,
  'once answered, nothing more is asked today');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select throws_ok($$select public.pantry_check_today(current_setting('t.hh')::uuid, null)$$, '42501', null,
  'another household cannot ask or read the question');
select throws_ok($$select public.pantry_check_today(current_setting('t.other')::uuid, (select id from ids where ord = 2))$$, 'P0002', null,
  'an item from another household cannot be asked about');
reset role;

-- --- notification settings ----------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select is(public.get_notification_settings(current_setting('t.hh')::uuid),
  '{"daily_pick": false, "pick_time": "16:00", "quiet_start": "22:00", "quiet_end": "07:00"}'::jsonb,
  'off by default, 16:00 when turned on');
select throws_ok($$select public.set_notification_settings(current_setting('t.hh')::uuid, '{"daily_pick": true, "pick_time": "23:00"}')$$,
  '22023', null, 'the pick time cannot be inside quiet hours');
select throws_ok($$select public.set_notification_settings(current_setting('t.hh')::uuid, '{"pick_time": "teatime"}')$$,
  '22023', null, 'nonsense times are refused');
select is(public.set_notification_settings(current_setting('t.hh')::uuid, '{"daily_pick": true, "pick_time": "17:30"}') ->> 'pick_time', '17:30',
  'opting in at a chosen time');
select is((select granted from public.consents where consent_type = 'notifications' and household_id = current_setting('t.hh')::uuid
            order by created_at desc limit 1), true, 'opting in records the notifications consent');
insert into public.devices (household_id, member_id, platform, push_token)
select current_setting('t.hh')::uuid, m.id, 'android', 'ExponentPushToken[test-f1]'
  from public.household_members m where m.household_id = current_setting('t.hh')::uuid;
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select throws_ok($$select * from public.notify_due(now())$$, '42501', null, 'signed-in users cannot list who is due for a nudge');
select throws_ok($$select * from public.stale_exports(7)$$, '42501', null, 'or list export files');
reset role;

-- Asia/Kolkata is UTC+5:30: 12:15 UTC = 17:45 local, just after the 17:30 pick time.
select is((select count(*)::int from public.notify_due('2027-02-03 12:15:00+00') where household_id = current_setting('t.hh')::uuid), 1,
  'due 15 minutes after the chosen time');
select is((select count(*)::int from public.notify_due('2027-02-03 11:45:00+00') where household_id = current_setting('t.hh')::uuid), 0,
  'not before it');
select is((select count(*)::int from public.notify_due('2027-02-03 15:15:00+00') where household_id = current_setting('t.hh')::uuid), 0,
  'and not hours later (a missed run doesn''t nudge at night)');
insert into public.notifications (household_id, member_id, type, scheduled_for, status)
select current_setting('t.hh')::uuid, m.id, 'daily_pick', '2027-02-03 12:00:00+00', 'sent'
  from public.household_members m where m.household_id = current_setting('t.hh')::uuid;
select is((select count(*)::int from public.notify_due('2027-02-03 12:30:00+00') where household_id = current_setting('t.hh')::uuid), 0,
  'at most one proactive notification a day');
select is((select count(*)::int from public.notify_due('2027-02-04 12:15:00+00') where household_id = current_setting('t.hh')::uuid), 1,
  'and due again the next day');

-- --- calendar and exports -----------------------------------------------------------------------------------
select ok((select count(*) from public.calendar_events where household_id is null and kind = 'fast' and name = 'Ekadashi') >= 20,
  'the festival and fasting calendar is seeded for the year');
insert into storage.buckets (id, name) values ('exports', 'exports') on conflict do nothing;
insert into storage.objects (bucket_id, name, created_at) values
  ('exports', 'h/old.zip', now() - interval '8 days'), ('exports', 'h/new.zip', now() - interval '1 day');
select is(array(select public.stale_exports(7)), array['h/old.zip'], 'exports older than 7 days are found for the sweep');

select * from finish();
rollback;
