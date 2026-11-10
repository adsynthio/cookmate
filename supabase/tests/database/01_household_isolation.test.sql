-- Household setup and isolation: a household's Kitchen Brain is invisible to other households.
begin;
select plan(16);

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
  ('00000000-0000-0000-0000-00000000000a', true),
  ('00000000-0000-0000-0000-00000000000b', true);

select is(
  (select count(*)::int from public.profiles
    where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  2,
  'handle_new_user creates a profile for each new (anonymous) user'
);

insert into public.recipes (slug, title, diet, is_published)
values ('test-aloo-sabzi', 'Aloo sabzi', 'veg', true);

-- User A: Sunita's household of four.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table a_result on commit drop as
select public.create_household(
  'Sharma ghar', 'hi-IN',
  '[{"display_name":"Sunita","is_self":true,"spice":4,"diet":"veg"},
    {"display_name":"Aarav","age_group":"child","spice":1},
    {"display_name":"Ramesh"},
    {"display_name":"Dadi","age_group":"elder","spice":2}]'::jsonb
) as r;

select is((select count(*)::int from public.household_members), 4, 'A sees 4 members');
select is((select count(*)::int from public.storage_locations), 5, 'A gets 5 default storage locations');
select is((select count(*)::int from public.voice_profiles), 4, 'one voice profile per member');
select is((select spice::int from public.taste_profiles t join public.household_members m on m.id = t.member_id
            where m.display_name = 'Aarav'), 1, 'member spice level stored in taste profile');
select is((select role from public.household_members where display_name = 'Sunita'), 'owner', 'caller becomes owner');
select is((select count(*)::int from public.shopping_lists), 1, 'main shopping list created');

insert into public.inventory_items (household_id, custom_name, quantity, unit)
select (r ->> 'household_id')::uuid, 'aloo', 2, 'kg' from a_result;
select is((select count(*)::int from public.inventory_items), 1, 'A can add to own pantry');
select is((select count(*)::int from public.recipes where slug = 'test-aloo-sabzi'), 1, 'published global recipes are visible');

-- User B: separate household.
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select lives_ok(
  $$ select public.create_household('B ghar', 'en-IN', '[{"display_name":"Arjun"}]'::jsonb) $$,
  'B can create a household'
);

select is((select count(*)::int from public.household_members), 1, 'B sees only own member');
select is((select count(*)::int from public.inventory_items), 0, 'B cannot see A''s pantry');
select is((select count(*)::int from public.households), 1, 'B sees only own household');

select throws_ok(
  format(
    $$ insert into public.inventory_items (household_id, custom_name) values (%L, 'chori') $$,
    (select (r ->> 'household_id') from a_result)
  ),
  '42501',
  null,
  'B cannot insert into A''s pantry'
);

update public.inventory_items set quantity = 0;  -- silently matches nothing under RLS
select pg_temp.logout();
select is((select quantity::int from public.inventory_items where custom_name = 'aloo'), 2,
  'B''s blanket update did not touch A''s item');

-- Anonymous callers cannot create households.
select throws_ok(
  $$ select public.create_household('x', 'hi-IN', '[{"display_name":"x"}]'::jsonb) $$,
  '28000',
  null,
  'create_household requires an authenticated user'
);

select * from finish();
rollback;
