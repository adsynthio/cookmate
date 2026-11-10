-- Cook With Me (KIT-070) and deduction after cooking (KIT-037): start, steps, complete with a scaled preview in the
-- pantry's units, apply once with corrections and events, staples by level, feedback, isolation.
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

select is(private.convert_qty(250, 'g', 'kg', '{}'), 0.25, 'grams to kilos');
select is(private.convert_qty(280, 'g', 'katori', '{"katori": 140}'), 2.000, 'grams to katori via the catalog measure');
select is(private.convert_qty(2, 'piece', 'g', '{"piece": 150}'), 300.000, 'pieces to grams');
select is(private.convert_qty(1, 'bunch', 'g', '{}'), null, 'unknown conversions stay unknown');

update public.feature_flags set enabled = true, rollout_pct = 100 where key = 'show_draft_recipes';
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000b1', true), ('00000000-0000-0000-0000-0000000000b2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select set_config('t.hh', public.create_household('Cook test', 'en-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id', true);
select public.add_inventory_items(current_setting('t.hh')::uuid,
  '[{"name":"aloo","quantity":2,"unit":"kg"},{"name":"jeera"},{"name":"haldi"}]'::jsonb);
select set_config('t.recipe', (select id::text from public.recipes where slug = 'jeera-aloo' and household_id is null), true);

select set_config('t.s', public.start_cooking_session(current_setting('t.hh')::uuid, current_setting('t.recipe')::uuid, 2)::text, true);
select is((select status || ':' || current_step || ':' || servings from public.cooking_sessions where id = current_setting('t.s')::uuid),
  'active:1:2', 'a session starts at step 1 for 2 people');

select is((public.advance_session_step(current_setting('t.s')::uuid, 1) ->> 'current_step')::int, 2, 'next step');
select is((public.advance_session_step(current_setting('t.s')::uuid, 99) ->> 'current_step')::int, 5, 'never past the last step');
select is((public.advance_session_step(current_setting('t.s')::uuid, -99) ->> 'current_step')::int, 1, 'never before the first');
select is((select count(*)::int from public.session_events where session_id = current_setting('t.s')::uuid), 3, 'every move is logged');

create temp table preview on commit drop as
  select * from public.complete_cooking_session(current_setting('t.s')::uuid);
grant select on preview to authenticated;
select is((select quantity from preview where ingredient = 'potato'), 0.250, 'potatoes for 2 of a 4-serving recipe, in the pantry''s kilos');
select ok((select staple and quantity is null from preview where ingredient = 'cumin seeds'), 'staples show without a quantity');
select is((select status from public.cooking_sessions where id = current_setting('t.s')::uuid), 'completed', 'the session is completed');

-- The cook used a little more potato and says the haldi is low now.
select public.apply_session_deduction(current_setting('t.s')::uuid, jsonb_build_array(
  jsonb_build_object('item_id', (select item_id from preview where ingredient = 'potato'), 'quantity', 0.3),
  jsonb_build_object('item_id', (select item_id from preview where ingredient = 'turmeric powder'), 'staple_level', 'low')));
select is((select quantity from public.inventory_items where id = (select item_id from preview where ingredient = 'potato')), 1.7,
  'the corrected amount comes off the pantry');
select is((select staple_level from public.inventory_items where id = (select item_id from preview where ingredient = 'turmeric powder')), 'low',
  'staples change level only when the cook says so');
select throws_ok(format('select public.apply_session_deduction(%L)', current_setting('t.s')), '23505', null,
  'a session is deducted once');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
select throws_ok(format('select public.advance_session_step(%L, 1)', current_setting('t.s')), 'P0002', null,
  'other households cannot see or drive the session');
select pg_temp.logout();

select * from finish();
rollback;
