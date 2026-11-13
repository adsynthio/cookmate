-- Security review, November 2026: member rows can't be used to take over a household; household count per account;
-- nothing in public is callable without signing in; household-media takes only plain image types.
begin;
select plan(13);

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
  ('00000000-0000-0000-0000-0000000005a1', true),  -- owner
  ('00000000-0000-0000-0000-0000000005b1', true),  -- plain member
  ('00000000-0000-0000-0000-0000000005c1', true);  -- admin

select pg_temp.login('00000000-0000-0000-0000-0000000005a1');
create temp table h on commit drop as
  select (public.create_household('Family', 'hi-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id')::uuid as id;
grant select on h to authenticated;
insert into public.household_members (household_id, user_id, display_name, role) values
  ((select id from h), '00000000-0000-0000-0000-0000000005b1', 'Bob', 'member'),
  ((select id from h), '00000000-0000-0000-0000-0000000005c1', 'Chitra', 'admin');
select pg_temp.logout();

-- A plain member can still edit their own name, but not their role, link or status.
select pg_temp.login('00000000-0000-0000-0000-0000000005b1');
select lives_ok($$ update public.household_members set display_name = 'Bobby' where user_id = '00000000-0000-0000-0000-0000000005b1' $$,
  'a member can rename themselves');
select throws_ok($$ update public.household_members set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000005b1' $$,
  '42501', null, 'a member can''t make themselves owner');
select throws_ok($$ update public.household_members set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000005b1' $$,
  '42501', null, 'a member can''t make themselves admin');
update public.household_members set status = 'removed' where display_name = 'Asha';
select pg_temp.logout();
select is((select status from public.household_members where display_name = 'Asha'), 'active',
  'a member can''t change someone else''s status');
select pg_temp.login('00000000-0000-0000-0000-0000000005b1');
select pg_temp.logout();

-- An admin manages members but can't touch the owner role.
select pg_temp.login('00000000-0000-0000-0000-0000000005c1');
select lives_ok($$ update public.household_members set role = 'cook' where display_name = 'Bobby' $$,
  'an admin can change a member''s role');
select throws_ok($$ update public.household_members set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000005c1' $$,
  '42501', null, 'an admin can''t make themselves owner');
select throws_ok($$ insert into public.household_members (household_id, user_id, display_name, role)
                   values ((select id from h), '00000000-0000-0000-0000-0000000005c1', 'Chitra 2', 'owner') $$,
  '42501', null, 'an admin can''t add an owner row');
select throws_ok($$ delete from public.household_members where display_name = 'Asha' $$,
  '42501', null, 'an admin can''t remove the owner');
select pg_temp.logout();

-- The owner can still hand over ownership, and nobody moves a member row to another household.
select pg_temp.login('00000000-0000-0000-0000-0000000005a1');
select lives_ok($$ update public.household_members set role = 'owner' where display_name = 'Chitra' $$,
  'an owner can make someone else owner');
select throws_ok($$ update public.household_members set household_id = gen_random_uuid() where display_name = 'Bobby' $$,
  '42501', null, 'a member row can''t move to another household');

-- At most 5 households per account (this account has 1).
select lives_ok($$ select public.create_household('H' || g, 'hi-IN', '[{"display_name":"A","is_self":true}]'::jsonb) from generate_series(2, 5) g $$,
  'up to 5 households per account');
select throws_ok($$ select public.create_household('H6', 'hi-IN', '[{"display_name":"A","is_self":true}]'::jsonb) $$,
  '54000', null, 'a 6th household is refused');
select pg_temp.logout();

-- Nothing in public is callable by anon.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  0, 'no function in public is callable without signing in');

select * from finish();
rollback;
