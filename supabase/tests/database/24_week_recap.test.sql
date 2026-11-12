-- Your kitchen week: meals and dishes of the last seven days (new ones marked), things used before they went off,
-- who loved what, and weeks in a row with three or more home-cooked meals; only for the caller's household.
begin;
select plan(8);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-00000000e001', true),
  ('00000000-0000-0000-0000-00000000e002', true);
select pg_temp.login('00000000-0000-0000-0000-00000000e001');
select set_config('t.a', public.create_household('A', 'en-IN', '[{"display_name":"Asha","is_self":true}]') ->> 'household_id', true);
select pg_temp.login('00000000-0000-0000-0000-00000000e002');
select set_config('t.b', public.create_household('B', 'en-IN', '[{"display_name":"Bina","is_self":true}]') ->> 'household_id', true);
reset role;

create function pg_temp.meal(p_hh text, p_slug text, p_days int) returns uuid language sql as $$
  insert into public.cooking_sessions (household_id, member_id, recipe_id, status, started_at, completed_at)
  select current_setting(p_hh)::uuid, m.id, r.id, 'completed', now() - make_interval(days => p_days) - interval '40 minutes',
         now() - make_interval(days => p_days)
    from public.household_members m, public.recipes r
   where m.household_id = current_setting(p_hh)::uuid and r.slug = p_slug and r.household_id is null
  returning id;
$$;
-- This week: dal tadka twice (also cooked a month ago) and rajma for the first time. Three meals in each of the two
-- weeks before, then a quiet week.
select pg_temp.meal('t.a', 'dal-tadka', 1);
select pg_temp.meal('t.a', 'dal-tadka', 3);
select set_config('t.rajma', pg_temp.meal('t.a', 'rajma', 2)::text, true);
select pg_temp.meal('t.a', 'kanda-poha', d) from unnest(array[8, 9, 10, 15, 16, 17]) d;
select pg_temp.meal('t.a', 'dal-tadka', 30);
select pg_temp.meal('t.b', 'rajma', 1);

-- Spinach used by the rajma session the day before its use-by (saved); onion used with a week to spare (not).
create function pg_temp.used(p_name text, p_expires_in int) returns void language plpgsql as $$
declare v_item uuid;
begin
  insert into public.inventory_items (household_id, ingredient_id, location_id, quantity, unit, added_via, expiry_date)
  select current_setting('t.a')::uuid, g.id, l.id, 1, 'kg', 'manual', current_date + p_expires_in - 2
    from public.ingredients g, public.storage_locations l
   where g.canonical_name = p_name and l.household_id = current_setting('t.a')::uuid and l.kind = 'fridge'
  returning id into v_item;
  insert into public.inventory_events (household_id, item_id, event_type, session_id, created_at)
  values (current_setting('t.a')::uuid, v_item, 'consumed', current_setting('t.rajma')::uuid, now() - interval '2 days');
end $$;
select pg_temp.used('spinach', 1);
select pg_temp.used('onion', 7);

-- Asha loved the rajma.
insert into public.memories (household_id, member_id, statement, category, source, polarity, subject_recipe_id, attributes)
select current_setting('t.a')::uuid, m.id, 'Asha loved Rajma', 'taste', 'explicit', 1, r.id, '{"about":"reaction"}'
  from public.household_members m, public.recipes r
 where m.household_id = current_setting('t.a')::uuid and r.slug = 'rajma' and r.household_id is null;

select pg_temp.login('00000000-0000-0000-0000-00000000e001');
select set_config('t.r', public.week_recap(current_setting('t.a')::uuid)::text, true);
select is((current_setting('t.r')::jsonb ->> 'meals')::int, 3, 'three meals in the last seven days');
select is((select d ->> 'title' from jsonb_array_elements(current_setting('t.r')::jsonb -> 'dishes') d limit 1), 'Dal Tadka',
  'the dish cooked most comes first');
select is((select (d ->> 'new')::boolean from jsonb_array_elements(current_setting('t.r')::jsonb -> 'dishes') d where d ->> 'title' = 'Rajma'), true,
  'rajma was new this week');
select is((select (d ->> 'new')::boolean from jsonb_array_elements(current_setting('t.r')::jsonb -> 'dishes') d where d ->> 'title' = 'Dal Tadka'), false,
  'dal tadka was cooked before');
select is((current_setting('t.r')::jsonb ->> 'saved')::int, 1, 'only what was used close to its use-by counts as saved');
select is((current_setting('t.r')::jsonb ->> 'weeks_cooking')::int, 3, 'three weeks in a row with three or more meals');
select is(current_setting('t.r')::jsonb -> 'loved' -> 0 ->> 'name', 'Asha', 'who loved what this week');

select pg_temp.login('00000000-0000-0000-0000-00000000e002');
select is((public.week_recap(current_setting('t.a')::uuid) ->> 'meals')::int, 0, 'another household sees nothing');

select * from finish();
rollback;
