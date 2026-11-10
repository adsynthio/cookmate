-- Living pantry RPCs (KIT-030..033): add with expiry estimate and top-up, edit, finish + undo, events, isolation.
begin;
select plan(20);

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
  ('00000000-0000-0000-0000-0000000000e1', true), ('00000000-0000-0000-0000-0000000000e2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select set_config('t.hh', public.create_household('Pantry test', 'en-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id', true);

-- "do kilo aloo, ek dozen ande, thoda atta, ghar ki hari chutney"
select set_config('t.ids', array_to_string(public.add_inventory_items(current_setting('t.hh')::uuid, '[
  {"name":"aloo","quantity":2,"unit":"kg"},
  {"name":"ande","quantity":12,"unit":"piece"},
  {"name":"atta"},
  {"name":"hari chutney","location_kind":"ready_made","flavor_roles":["heat","acid","bogus"]}
]'::jsonb, 'voice'), ','), true);
create temp table ids on commit drop as
  select u::uuid as id, ord from unnest(string_to_array(current_setting('t.ids'), ',')) with ordinality as x(u, ord);
grant select on ids to authenticated;

select is((select count(*)::int from public.inventory_items where household_id = current_setting('t.hh')::uuid), 4,
  'four items added');
select is((select g.canonical_name from public.inventory_items i join public.ingredients g on g.id = i.ingredient_id
           where i.id = (select id from ids where ord = 1)), 'potato', 'Hinglish "aloo" maps to the catalog');
select is((select l.kind from public.inventory_items i join public.storage_locations l on l.id = i.location_id
           where i.id = (select id from ids where ord = 2)), 'fridge', 'eggs go to their usual place (fridge)');
select is((select expiry_date - private.kitchen_today() from public.inventory_items where id = (select id from ids where ord = 2)),
  21, 'expiry estimated from shelf life for that location');
select ok((select expiry_estimated from public.inventory_items where id = (select id from ids where ord = 2)),
  'and marked as an estimate');
select is((select staple_level from public.inventory_items where id = (select id from ids where ord = 3)), 'full',
  'a staple without quantity is added as Full');
select is((select state || ':' || array_to_string(flavor_roles, ',') from public.inventory_items where id = (select id from ids where ord = 4)),
  'homemade:heat,acid', 'an uncatalogued ready-made item is homemade, with only valid flavour roles');
select is((select count(*)::int from public.inventory_events where household_id = current_setting('t.hh')::uuid
           and event_type = 'added' and actor_kind = 'voice'), 4, 'every add is logged as a voice event');

-- Same thing again tops up instead of duplicating.
select public.add_inventory_items(current_setting('t.hh')::uuid, '[{"name":"potatoes","quantity":1,"unit":"kg"}]'::jsonb);
select is((select quantity from public.inventory_items where id = (select id from ids where ord = 1)), 3::numeric,
  'adding aloo again tops up the existing row (2 kg + 1 kg)');

-- Edit, move, level, confirm.
select public.update_inventory_item((select id from ids where ord = 1), '{"quantity":2.5}'::jsonb);
select is((select quantity_delta from public.inventory_events where item_id = (select id from ids where ord = 1)
           and event_type = 'adjusted'), -0.5::numeric, 'an edit logs the signed change');
select public.update_inventory_item((select id from ids where ord = 3), '{"staple_level":"low"}'::jsonb);
select is((select staple_level from public.inventory_items where id = (select id from ids where ord = 3)), 'low',
  'staple level changes to Low');
select public.update_inventory_item((select id from ids where ord = 2), '{"location_kind":"freezer"}'::jsonb);
select ok((select event_type = 'moved' from public.inventory_events where item_id = (select id from ids where ord = 2)
           order by id desc limit 1), 'moving an item logs a moved event');
update public.inventory_items set confidence = 0.3 where id = (select id from ids where ord = 1);
select public.update_inventory_item((select id from ids where ord = 1), '{"confirm":true}'::jsonb);
select is((select confidence from public.inventory_items where id = (select id from ids where ord = 1)), 0.95::numeric(3,2),
  '"still have it" restores confidence');

-- Use Soon only counts confident items.
select ok(exists (select 1 from public.get_use_soon(current_setting('t.hh')::uuid, 30) where name = 'potato'),
  'get_use_soon lists confident items expiring in the window');

-- Finish, then undo within the snackbar window.
select public.finish_inventory_item((select id from ids where ord = 2), false);
select is((select status from public.inventory_items where id = (select id from ids where ord = 2)), 'finished', 'finish works');
select public.reopen_inventory_item((select id from ids where ord = 2));
select is((select status from public.inventory_items where id = (select id from ids where ord = 2)), 'active', 'undo reopens it');

-- Low staple -> shopping list, no duplicates.
select public.add_to_shopping_list(current_setting('t.hh')::uuid, '[{"name":"atta","reason":"running_low"}]'::jsonb);
select public.add_to_shopping_list(current_setting('t.hh')::uuid, '[{"name":"aata","reason":"running_low"}]'::jsonb);
select is((select count(*)::int from public.shopping_list_items where household_id = current_setting('t.hh')::uuid), 1,
  'adding a low staple to the list twice keeps one line');

-- Another household cannot touch this pantry.
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select throws_ok(format($$select public.add_inventory_items(%L, '[{"name":"aloo"}]'::jsonb)$$, current_setting('t.hh')),
  '42501', null, 'non-members cannot add to the pantry');
select throws_ok(format($$select public.finish_inventory_item(%L)$$, (select id from ids where ord = 1)),
  'P0002', null, 'non-members cannot see the item to finish it');
select is((select count(*)::int from public.get_use_soon(current_setting('t.hh')::uuid, 365)), 0,
  'non-members get nothing from get_use_soon');

select * from finish();
rollback;
