-- Memory subjects (KIT-104, KIT-105): ingredient + aspect + dish; only plain likes and dislikes become preferences.
begin;
select plan(10);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

update public.feature_flags set enabled = true, rollout_pct = 100 where key = 'show_draft_recipes';
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000f1', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select set_config('t.hh', public.create_household('Subjects test', 'en-IN', '[{"display_name":"Sunita","is_self":true}]'::jsonb) ->> 'household_id', true);
select set_config('t.me', (select id::text from public.household_members where household_id = current_setting('t.hh')::uuid), true);
select set_config('t.garlic', (select id::text from public.ingredients where canonical_name = 'garlic'), true);
select set_config('t.salt', (select id::text from public.ingredients where canonical_name = 'salt'), true);
select set_config('t.r1', (select id::text from public.recipes where household_id is null order by slug limit 1), true);
select set_config('t.r2', (select id::text from public.recipes where household_id is null order by slug offset 1 limit 1), true);

create function pg_temp.active_about(p_ingredient uuid) returns integer language sql as $$
  select count(*)::int from public.memories
   where household_id = current_setting('t.hh')::uuid and status = 'active' and subject_ingredient_id = p_ingredient
$$;
create function pg_temp.pref(p_ingredient uuid) returns integer language sql as $$
  select (select preference::int from public.ingredient_preferences
           where member_id = current_setting('t.me')::uuid and ingredient_id = p_ingredient)
$$;

-- A like, then a note about how much: two different subjects.
select set_config('t.like', public.save_memory(current_setting('t.hh')::uuid, 'Sunita loves garlic', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'explicit', 1, '{"about":"preference"}'::jsonb, current_setting('t.garlic')::uuid)::text, true);
select set_config('t.more', public.save_memory(current_setting('t.hh')::uuid, 'Agli baar lahsun zyada', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'explicit', 0, '{"about":"amount","amount":"more"}'::jsonb, current_setting('t.garlic')::uuid)::text, true);
select is(pg_temp.active_about(current_setting('t.garlic')::uuid), 2, 'a note about how much does not replace a like');
select is(pg_temp.pref(current_setting('t.garlic')::uuid), 2, 'and the like is still a preference');

-- The same note again, the other way: that one is replaced.
select set_config('t.less', public.save_memory(current_setting('t.hh')::uuid, 'Lahsun thoda kam', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'explicit', 0, '{"about":"amount","amount":"less"}'::jsonb, current_setting('t.garlic')::uuid)::text, true);
select is((select status from public.memories where id = current_setting('t.more')::uuid), 'superseded', 'a newer note about the same amount replaces the older one');

-- Notes about one dish are separate from notes about another, and from the general one.
select public.save_memory(current_setting('t.hh')::uuid, 'More garlic in dish one', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'explicit', 0, '{"about":"amount","amount":"more"}'::jsonb, current_setting('t.garlic')::uuid, current_setting('t.r1')::uuid);
select public.save_memory(current_setting('t.hh')::uuid, 'More garlic in dish two', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'explicit', 0, '{"about":"amount","amount":"more"}'::jsonb, current_setting('t.garlic')::uuid, current_setting('t.r2')::uuid);
select is(pg_temp.active_about(current_setting('t.garlic')::uuid), 4, 'each dish keeps its own note');
select public.save_memory(current_setting('t.hh')::uuid, 'Less garlic in dish one after all', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'explicit', 0, '{"about":"amount","amount":"less"}'::jsonb, current_setting('t.garlic')::uuid, current_setting('t.r1')::uuid);
select is(pg_temp.active_about(current_setting('t.garlic')::uuid), 4, 'and a newer note about the same dish replaces only that dish''s note');

-- "Less salt" must never read as "avoids salt", even if a caller sends a polarity with it.
select public.save_memory(current_setting('t.hh')::uuid, 'Less salt everywhere', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'explicit', -1, '{"about":"amount","amount":"less"}'::jsonb, current_setting('t.salt')::uuid);
select is(pg_temp.pref(current_setting('t.salt')::uuid), null, 'a note about how much never becomes a dislike');
select public.save_memory(current_setting('t.hh')::uuid, 'Hates garlic in dish two', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'explicit', -1, '{"about":"preference"}'::jsonb, current_setting('t.garlic')::uuid, current_setting('t.r2')::uuid);
select is(pg_temp.pref(current_setting('t.garlic')::uuid), 2, 'and neither does a note about one dish');

-- Forgetting a note leaves the like alone; forgetting the like removes the preference although notes remain.
select public.forget_memory(current_setting('t.less')::uuid);
select is(pg_temp.pref(current_setting('t.garlic')::uuid), 2, 'forgetting a note about how much keeps the like');
select public.forget_memory(current_setting('t.like')::uuid);
select is(pg_temp.pref(current_setting('t.garlic')::uuid), null, 'forgetting the like removes the preference');
select is(pg_temp.active_about(current_setting('t.garlic')::uuid), 3, 'and the notes about dishes stay');

select * from finish();
rollback;
