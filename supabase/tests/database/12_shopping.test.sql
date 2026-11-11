-- Shopping list (KIT-110, KIT-111): duplicates merge, bought items land in the pantry, staples refill, isolation.
begin;
select plan(10);

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
  ('00000000-0000-0000-0000-0000000000f1', true), ('00000000-0000-0000-0000-0000000000f2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select set_config('t.hh', public.create_household('List test', 'en-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id', true);
select public.add_inventory_items(current_setting('t.hh')::uuid, '[{"name":"haldi","staple_level":"out"},{"name":"aloo","quantity":1,"unit":"kg"}]'::jsonb);

select public.add_to_shopping_list(current_setting('t.hh')::uuid,
  '[{"name":"haldi","reason":"running_low"},{"name":"paneer","quantity":200,"unit":"g"},{"name":"aloo","quantity":2,"unit":"kg"},{"name":"birthday candles"}]'::jsonb);
select public.add_to_shopping_list(current_setting('t.hh')::uuid, '[{"name":"paneer"},{"name":"Birthday Candles"}]'::jsonb);
select is((select count(*)::int from public.shopping_list_items where household_id = current_setting('t.hh')::uuid and status = 'needed'), 4,
  'the same thing asked for twice is one line');

-- One item bought.
select set_config('t.paneer', (select s.id::text from public.shopping_list_items s join public.ingredients g on g.id = s.ingredient_id
                                where s.household_id = current_setting('t.hh')::uuid and g.canonical_name = 'paneer'), true);
select is(cardinality(public.mark_list_items_bought(current_setting('t.hh')::uuid, array[current_setting('t.paneer')::uuid])), 1, 'one bought item, one pantry item');
select is((select i.quantity || ' ' || i.unit from public.inventory_items i join public.ingredients g on g.id = i.ingredient_id
            where i.household_id = current_setting('t.hh')::uuid and g.canonical_name = 'paneer' and i.status = 'active'),
  '200 g', 'it lands in the pantry with its quantity');
select ok((select i.expiry_date is not null and i.expiry_estimated from public.inventory_items i join public.ingredients g on g.id = i.ingredient_id
            where i.household_id = current_setting('t.hh')::uuid and g.canonical_name = 'paneer' and i.status = 'active'),
  'with an estimated expiry');

-- Remove one, then "sab le aaye".
select public.remove_list_item((select id from public.shopping_list_items where household_id = current_setting('t.hh')::uuid and lower(display_name) = 'birthday candles'));
select is(cardinality(public.mark_list_items_bought(current_setting('t.hh')::uuid)), 2, 'everything still needed is bought at once');
select is((select count(*)::int from public.shopping_list_items where household_id = current_setting('t.hh')::uuid and status = 'needed'), 0, 'nothing is left on the list');
select is((select i.staple_level from public.inventory_items i join public.ingredients g on g.id = i.ingredient_id
            where i.household_id = current_setting('t.hh')::uuid and g.canonical_name = 'turmeric powder' and i.status = 'active'),
  'full', 'a staple that was out is full again');
select is((select i.quantity from public.inventory_items i join public.ingredients g on g.id = i.ingredient_id
            where i.household_id = current_setting('t.hh')::uuid and g.canonical_name = 'potato' and i.status = 'active'),
  3::numeric, 'what was already there is topped up');
select is((select count(*)::int from public.inventory_items where household_id = current_setting('t.hh')::uuid and lower(coalesce(custom_name, '')) = 'birthday candles'),
  0, 'a removed line is not bought');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select throws_ok(format('select public.mark_list_items_bought(%L)', current_setting('t.hh')), '42501', null, 'other households cannot buy from this list');
select pg_temp.logout();

select * from finish();
rollback;
