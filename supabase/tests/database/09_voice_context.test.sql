-- Voice context packet (KIT-062): the agent gets the speaker, household, confident pantry, memories and session in
-- one call under the user's own rights; unconfirmed guesses are kept apart; lists are capped; strangers get an error.
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

update public.feature_flags set enabled = true, rollout_pct = 100 where key = 'show_draft_recipes';
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000c1', true), ('00000000-0000-0000-0000-0000000000c2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select set_config('t.hh', public.create_household('Voice test', 'hi-IN',
  '[{"display_name":"Sunita","is_self":true},{"display_name":"Aarav","age_group":"child"}]'::jsonb) ->> 'household_id', true);
select public.add_inventory_items(current_setting('t.hh')::uuid,
  '[{"name":"aloo","quantity":2,"unit":"kg"},{"name":"paneer","quantity":200,"unit":"g"},{"name":"haldi"},{"name":"jeera"}]'::jsonb);
select set_config('t.recipe', (select id::text from public.recipes where slug = 'jeera-aloo' and household_id is null), true);
select public.guess_pantry_from_recipe(current_setting('t.hh')::uuid, (select id from public.recipes where slug = 'dal-tadka' and household_id is null));
select set_config('t.s', public.start_cooking_session(current_setting('t.hh')::uuid, current_setting('t.recipe')::uuid, 2)::text, true);
select public.advance_session_step(current_setting('t.s')::uuid, 1);
select pg_temp.logout();

-- A staple runs low, and the household has a memory (written by the app's own flows in Sprint 5).
update public.inventory_items set staple_level = 'low'
 where household_id = current_setting('t.hh')::uuid and ingredient_id = (select id from public.ingredients where canonical_name = 'turmeric powder');
insert into public.memories (household_id, member_id, statement, category, source, confidence)
select current_setting('t.hh')::uuid, id, 'Aarav likes it mild', 'taste', 'explicit', 0.9
  from public.household_members where household_id = current_setting('t.hh')::uuid and display_name = 'Aarav';
insert into public.memories (household_id, statement, category, source, confidence, status)
values (current_setting('t.hh')::uuid, 'Forgotten thing', 'other', 'explicit', 0.9, 'forgotten');

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
create temp table packet on commit drop as
  select public.get_voice_context(current_setting('t.hh')::uuid, null, current_setting('t.s')::uuid) as p;
grant select on packet to authenticated;

select is((select p #>> '{speaker,name}' from packet), 'Sunita', 'the speaker defaults to the signed-in member');
select is((select p #>> '{speaker,language}' from packet), 'hi-IN', 'with their language');
select is((select jsonb_array_length(p #> '{household,members}') from packet), 2, 'everyone in the household is listed');
select ok((select p #> '{pantry,items}' @> '[{"name":"potato","qty":2,"unit":"kg"}]' from packet), 'confident items carry quantity and unit');
select ok((select not (p #> '{pantry,items}') @> '[{"name":"toor dal"}]' from packet), 'guesses are not listed as in the kitchen');
select ok((select p #> '{pantry,unsure}' ? 'toor dal' from packet), 'guesses are listed apart, to ask about');
select ok((select p #> '{pantry,staples_low}' ? 'turmeric powder' from packet), 'low staples are named');
select is((select p -> 'memories' from packet), '[{"about":"Aarav","text":"Aarav likes it mild"}]'::jsonb, 'active memories only, with who they are about');
select is((select p #>> '{session,step}' from packet), '2', 'the session is at the step on screen');
select ok((select p #>> '{session,dish}' = 'Jeera Aloo' and (p #>> '{session,current,text}') is not null and (p #>> '{session,next}') is not null from packet),
  'with the dish, this step and the next');
select pg_temp.logout();

-- A big kitchen still fits the budget: 150 more items, packet under 12,000 characters (about 3,000 tokens).
insert into public.inventory_items (household_id, custom_name, quantity, unit, confidence, status, added_via, location_id)
select current_setting('t.hh')::uuid, 'homemade thing number ' || n, n, 'katori', 0.9, 'active', 'manual',
       (select id from public.storage_locations where household_id = current_setting('t.hh')::uuid order by sort_order limit 1)
  from generate_series(1, 150) n;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select ok((select jsonb_array_length(c #> '{pantry,items}') = 60 and length(c::text) < 12000
             from public.get_voice_context(current_setting('t.hh')::uuid) c), 'lists are capped so the packet stays under budget');
select is((select public.get_voice_context(current_setting('t.hh')::uuid) -> 'session'), 'null'::jsonb, 'no session, no session block');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select throws_ok(format('select public.get_voice_context(%L)', current_setting('t.hh')), '42501', null, 'another household''s packet is refused');
select pg_temp.logout();

select * from finish();
rollback;
