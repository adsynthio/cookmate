-- Weekly no-meat days: the owner sets them, only real weekdays are kept, and other kitchens can't change them.
begin;
select plan(5);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000e1', true),
  ('00000000-0000-0000-0000-0000000000e2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
create temp table h on commit drop as
select (public.create_household('Khan ghar', 'hi-IN', '[{"display_name":"Ayesha","is_self":true,"diet":"nonveg"}]'::jsonb) ->> 'household_id')::uuid as id;

select is((select meatless_days from public.households where id = (select id from h)), '{}'::smallint[], 'no no-meat days to start');
select lives_ok($$ update public.households set meatless_days = '{2,6}' where id = (select id from h) $$, 'the owner sets Tuesday and Saturday');
select is((select meatless_days from public.households where id = (select id from h)), '{2,6}'::smallint[], 'Tuesday and Saturday kept');
select throws_ok($$ update public.households set meatless_days = '{8}' where id = (select id from h) $$, '23514', null,
  'only weekdays 1 to 7');

-- Another kitchen's owner can't change them (the row isn't theirs to update).
create temp table hid on commit drop as select id from h;
grant select on hid to authenticated;
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
update public.households set meatless_days = '{1,2,3,4,5,6,7}' where id = (select id from hid);
select pg_temp.logout();
select is((select meatless_days from public.households where id = (select id from hid)), '{2,6}'::smallint[],
  'another kitchen can''t change them');

select * from finish();
rollback;
