-- "Download my data" includes notification settings and pantry questions (SECURITY_REVIEW #15), for members only.
begin;
select plan(4);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-000000000a01', true), ('00000000-0000-0000-0000-000000000a02', true);

select pg_temp.login('00000000-0000-0000-0000-000000000a01');
select set_config('t.hh', public.create_household('Export test', 'en-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id', true);
select public.set_notification_settings(current_setting('t.hh')::uuid, '{"daily_pick": true, "pick_time": "18:00"}');
select set_config('t.item', (public.add_inventory_items(current_setting('t.hh')::uuid, '[{"name":"paneer","quantity":200,"unit":"g"}]'::jsonb, 'text'))[1]::text, true);
select public.pantry_check_today(current_setting('t.hh')::uuid, current_setting('t.item')::uuid);

select is(public.export_household(current_setting('t.hh')::uuid) -> 'notification_settings' -> 0 ->> 'pick_time', '18:00:00',
  'the export has the member''s notification settings');
select is(public.export_household(current_setting('t.hh')::uuid) -> 'pantry_checks' -> 0 ->> 'item_id', current_setting('t.item'),
  'and the pantry question asked today');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000a02');
select is(private.export_private(current_setting('t.hh')::uuid), '{}'::jsonb, 'someone outside the household gets nothing from the private rows');
select throws_ok($$select public.export_household(current_setting('t.hh')::uuid)$$, '42501', null, 'and cannot export the household');
reset role;

select * from finish();
rollback;
