-- Family editing after setup: add a person (with voice and taste profiles), change them, remove them; owners only,
-- up to 12 people, and nobody outside the kitchen can touch it.
begin;
select plan(17);

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
  ('00000000-0000-0000-0000-0000000000d1', true),
  ('00000000-0000-0000-0000-0000000000d2', true);

-- Kavya's kitchen starts with two people.
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
create temp table k on commit drop as
select (r ->> 'household_id')::uuid as household_id, (r ->> 'member_id')::uuid as me
  from (select public.create_household('Rao mane', 'kn-IN',
          '[{"display_name":"Kavya","is_self":true,"diet":"veg","spice":4},{"display_name":"Anu","age_group":"child","spice":2}]'::jsonb) as r) x;
grant select on k to authenticated;

create temp table added on commit drop as
select public.add_household_member((select household_id from k),
         '{"display_name":"  Ajji ","age_group":"elder","diet":"jain","spice":2}'::jsonb) as id;
grant select on added to authenticated;

select is((select count(*)::int from public.household_members where status = 'active'), 3, 'Ajji is added to the kitchen');
select is((select display_name || '|' || age_group || '|' || diet || '|' || role from public.household_members where id = (select id from added)),
  'Ajji|elder|jain|dependent', 'name trimmed; age, diet and role as given');
select is((select language_code from public.voice_profiles where member_id = (select id from added)), 'kn-IN',
  'she hears Cookmate in the language of whoever added her');
select is((select spice::int from public.taste_profiles where member_id = (select id from added)), 2, 'her spice level is kept');

select lives_ok(
  $$ select public.update_household_member((select id from added), '{"display_name":"Ajji Rao","diet":"veg","spice":1}'::jsonb) $$,
  'the owner changes her name, diet and spice'
);
select is((select display_name || '|' || diet from public.household_members where id = (select id from added)), 'Ajji Rao|veg',
  'name and diet changed');
select is((select spice::int from public.taste_profiles where member_id = (select id from added)), 1, 'spice changed');
select throws_ok(
  $$ select public.update_household_member((select id from added), '{"age_group":"grandma"}'::jsonb) $$,
  '22023', 'unknown age group', 'an unknown age group is refused'
);
select throws_ok(
  $$ select public.add_household_member((select household_id from k), '{"display_name":"   "}'::jsonb) $$,
  '22023', 'a name has 1 to 40 characters', 'a blank name is refused'
);

select lives_ok($$ select public.remove_household_member((select id from added)) $$, 'the owner removes her');
select is((select status from public.household_members where id = (select id from added)), 'removed',
  'removed, not deleted: past reactions and memories still name her');
select throws_ok(
  $$ select public.remove_household_member((select me from k)) $$,
  '42501', 'someone with their own account leaves from their own phone', 'the owner can''t remove themself here'
);

-- Up to 12 active people (2 now, so 10 more fit, and the 13th is refused).
select lives_ok(
  $$ select public.add_household_member((select household_id from k), jsonb_build_object('display_name', 'Guest ' || n))
       from generate_series(1, 10) as n $$,
  'a joint family fills the kitchen to 12'
);
select throws_ok(
  $$ select public.add_household_member((select household_id from k), '{"display_name":"One more"}'::jsonb) $$,
  '22023', 'a household has up to 12 members', 'the 13th person is refused'
);

-- Someone from another kitchen can't add, change or remove anyone here.
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
select throws_ok(
  $$ select public.add_household_member((select household_id from k), '{"display_name":"Intruder"}'::jsonb) $$,
  '42501', null, 'outsiders can''t add people'
);
select throws_ok(
  $$ select public.update_household_member((select me from k), '{"display_name":"Hacked"}'::jsonb) $$,
  '42501', null, 'outsiders can''t change people'
);
select pg_temp.logout();
select is((select display_name from public.household_members where id = (select me from k)), 'Kavya', 'the owner''s name is untouched');

select * from finish();
rollback;
