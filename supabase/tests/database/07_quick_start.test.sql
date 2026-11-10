-- Quick start from yesterday's dish (KIT-026): guesses at confidence 0.4, no duplicates, one-tap clear, isolation.
begin;
select plan(8);

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

update public.feature_flags set enabled = true, rollout_pct = 100 where key = 'show_draft_recipes';
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a1', true), ('00000000-0000-0000-0000-0000000000a2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.hh', public.create_household('Quick start', 'en-IN', '[{"display_name":"Meena","is_self":true}]'::jsonb) ->> 'household_id', true);
select public.add_inventory_items(current_setting('t.hh')::uuid, '[{"name":"toor dal","quantity":1,"unit":"kg"}]'::jsonb);
select set_config('t.recipe', (select id::text from public.recipes where slug = 'dal-tadka' and household_id is null), true);

select set_config('t.ids', array_to_string(public.guess_pantry_from_recipe(current_setting('t.hh')::uuid, current_setting('t.recipe')::uuid), ','), true);
select cmp_ok(cardinality(string_to_array(current_setting('t.ids'), ',')), '>=', 5, 'yesterday''s dal tadka guesses several ingredients');
select is((select count(*)::int from public.inventory_items where id = any(string_to_array(current_setting('t.ids'), ',')::uuid[]) and confidence = 0.4),
  cardinality(string_to_array(current_setting('t.ids'), ',')), 'every guess is unconfirmed (0.4)');
select is((select count(*)::int from public.inventory_items i join public.ingredients g on g.id = i.ingredient_id
           where i.household_id = current_setting('t.hh')::uuid and g.canonical_name = 'toor dal'), 1,
  'what is already in the kitchen is not guessed again');
select is((select count(*)::int from public.get_use_soon(current_setting('t.hh')::uuid, 400)
           where id = any(string_to_array(current_setting('t.ids'), ',')::uuid[])), 0, 'guesses never reach Use Soon');
select is((select count(*)::int from public.inventory_events where item_id = any(string_to_array(current_setting('t.ids'), ',')::uuid[])
           and actor_kind = 'ai'), cardinality(string_to_array(current_setting('t.ids'), ',')), 'each guess is logged as an AI add');

-- A guess the cook confirms stays when the rest are cleared.
select public.update_inventory_item((string_to_array(current_setting('t.ids'), ','))[1]::uuid, '{"confirm":true}'::jsonb);
select is(public.clear_pantry_guesses(current_setting('t.hh')::uuid),
  cardinality(string_to_array(current_setting('t.ids'), ',')) - 1, 'one tap clears every unconfirmed guess');
select is((select count(*)::int from public.inventory_items where household_id = current_setting('t.hh')::uuid), 2,
  'the confirmed guess and the real toor dal remain');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format('select public.guess_pantry_from_recipe(%L, %L)', current_setting('t.hh'), current_setting('t.recipe')),
  '42501', null, 'non-members cannot add guesses');
select pg_temp.logout();

select * from finish();
rollback;
