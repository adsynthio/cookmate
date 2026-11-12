-- Predictive restocking: a rhythm needs three purchase days; onboarding is not a purchase; the list and Low/Out
-- staples silence the question; other households see nothing.
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

-- A bought atta 35, 23 and 11 days ago (every 12 days, so it runs out tomorrow); rice twice only; onboarding salt thrice.
create function pg_temp.bought(p_hh text, p_name text, p_days int, p_via text default 'manual') returns void language plpgsql as $$
declare v_item uuid;
begin
  insert into public.inventory_items (household_id, ingredient_id, location_id, quantity, unit, added_via, staple_level)
  select current_setting(p_hh)::uuid, g.id, l.id, 1, 'kg', p_via, 'full'
    from public.ingredients g, public.storage_locations l
   where g.canonical_name = p_name and l.household_id = current_setting(p_hh)::uuid and l.kind = 'staples'
  returning id into v_item;
  insert into public.inventory_events (household_id, item_id, event_type, created_at)
  values (current_setting(p_hh)::uuid, v_item, 'added', now() - make_interval(days => p_days));
end $$;
select pg_temp.bought('t.a', 'whole wheat flour', 35);
select pg_temp.bought('t.a', 'whole wheat flour', 23);
select pg_temp.bought('t.a', 'whole wheat flour', 11);
select pg_temp.bought('t.a', 'rice', 20);
select pg_temp.bought('t.a', 'rice', 10);
select pg_temp.bought('t.a', 'salt', 30, 'onboarding');
select pg_temp.bought('t.a', 'salt', 20, 'onboarding');
select pg_temp.bought('t.a', 'salt', 10, 'onboarding');

select is(private.refresh_purchase_patterns(), 1, 'only atta has a rhythm: rice has one gap, onboarding is not buying');
select is((select avg_interval_days from public.purchase_patterns where household_id = current_setting('t.a')::uuid), 12.0,
  'atta is bought every 12 days');
select is(private.refresh_purchase_patterns(), 1, 'refreshing again updates, not duplicates');

select pg_temp.login('00000000-0000-0000-0000-00000000e001');
select is((select name from public.restock_due(current_setting('t.a')::uuid)), 'whole wheat flour', 'atta is due');
select is((select due_in_days from public.restock_due(current_setting('t.a')::uuid)), 1, 'due tomorrow');
select is((select count(*)::int from public.restock_due(current_setting('t.b')::uuid)), 0, 'another household sees nothing');

select public.add_to_shopping_list(current_setting('t.a')::uuid, '[{"name": "whole wheat flour", "reason": "predicted"}]');
select is((select count(*)::int from public.restock_due(current_setting('t.a')::uuid)), 0, 'on the list: not asked again');
reset role;
update public.shopping_list_items set status = 'removed' where household_id = current_setting('t.a')::uuid;
update public.inventory_items set staple_level = 'low'
 where household_id = current_setting('t.a')::uuid and ingredient_id = (select id from public.ingredients where canonical_name = 'whole wheat flour');
select pg_temp.login('00000000-0000-0000-0000-00000000e001');
select is((select count(*)::int from public.restock_due(current_setting('t.a')::uuid)), 0, 'already marked Low: not asked');

select * from finish();
rollback;
