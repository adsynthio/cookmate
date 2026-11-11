-- Memory rules (KIT-101) and learning from feedback (KIT-100).
begin;
select plan(17);

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
  ('00000000-0000-0000-0000-0000000000e1', true), ('00000000-0000-0000-0000-0000000000e2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select set_config('t.hh', public.create_household('Memory test', 'en-IN', '[{"display_name":"Sunita","is_self":true}]'::jsonb) ->> 'household_id', true);
select set_config('t.me', (select id::text from public.household_members where household_id = current_setting('t.hh')::uuid), true);
select set_config('t.garlic', (select id::text from public.ingredients where canonical_name = 'garlic'), true);

-- Said twice: one memory, stronger.
select set_config('t.m1', public.save_memory(current_setting('t.hh')::uuid, 'Extra garlic, please', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'explicit', 1, '{}'::jsonb, current_setting('t.garlic')::uuid)::text, true);
select is(public.save_memory(current_setting('t.hh')::uuid, '  extra garlic, PLEASE ', current_setting('t.me')::uuid)::text, current_setting('t.m1'),
  'the same thing said again is the same memory');
select is((select evidence_count from public.memories where id = current_setting('t.m1')::uuid), 2, 'and it gets stronger');
select is((select preference::int from public.ingredient_preferences where member_id = current_setting('t.me')::uuid and ingredient_id = current_setting('t.garlic')::uuid),
  2, 'a lasting like of an ingredient becomes an ingredient preference');

-- An observation does not override what the user said.
select is(public.save_memory(current_setting('t.hh')::uuid, 'Seems to skip garlic', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'observed', -1, '{}'::jsonb, current_setting('t.garlic')::uuid)::text, current_setting('t.m1'),
  'an observation never overrides what the user told us');

-- A correction does.
select set_config('t.m2', public.save_memory(current_setting('t.hh')::uuid, 'No garlic for me', current_setting('t.me')::uuid,
  'ingredient', 'permanent', 'correction', -1, '{}'::jsonb, current_setting('t.garlic')::uuid)::text, true);
select is((select status || ':' || (superseded_by = current_setting('t.m2')::uuid)::text from public.memories where id = current_setting('t.m1')::uuid),
  'superseded:true', 'a correction supersedes the older memory about the same ingredient');
select is((select preference::int from public.ingredient_preferences where member_id = current_setting('t.me')::uuid and ingredient_id = current_setting('t.garlic')::uuid),
  -2, 'and the preference follows');

-- Same subject by "about" key.
select set_config('t.s1', public.save_memory(current_setting('t.hh')::uuid, 'Likes food hot', current_setting('t.me')::uuid, 'taste', 'permanent', 'explicit', 1, '{"about":"spice"}'::jsonb)::text, true);
select set_config('t.s2', public.save_memory(current_setting('t.hh')::uuid, 'Less chilli from now on', current_setting('t.me')::uuid, 'taste', 'permanent', 'explicit', -1, '{"about":"spice"}'::jsonb)::text, true);
select is((select count(*)::int from public.memories where household_id = current_setting('t.hh')::uuid and status = 'active' and private.memory_about(attributes) = 'spice'),
  1, 'one active memory per subject and person');

-- Temporary memories expire and do not touch preferences.
select set_config('t.onion', (select id::text from public.ingredients where canonical_name = 'onion'), true);
select set_config('t.tmp', public.save_memory(current_setting('t.hh')::uuid, 'No onion this week', current_setting('t.me')::uuid,
  'ingredient', 'temporary', 'explicit', -1, '{}'::jsonb, current_setting('t.onion')::uuid)::text, true);
select ok((select expires_at > now() + interval '6 days' from public.memories where id = current_setting('t.tmp')::uuid), 'temporary memories get an expiry');
select is((select count(*)::int from public.ingredient_preferences where member_id = current_setting('t.me')::uuid and ingredient_id = current_setting('t.onion')::uuid),
  0, 'and never change ingredient preferences');

-- Keep, edit, forget.
select public.keep_memory(current_setting('t.m2')::uuid);
select is((select confidence from public.memories where id = current_setting('t.m2')::uuid), 1.00, 'keep confirms a memory');
select public.update_memory(current_setting('t.m2')::uuid, 'A little garlic is fine');
select is((select statement || ':' || source || ':' || polarity from public.memories where id = current_setting('t.m2')::uuid),
  'A little garlic is fine:correction:0', 'an edit is the user''s own words');
select is((select count(*)::int from public.ingredient_preferences where member_id = current_setting('t.me')::uuid and ingredient_id = current_setting('t.garlic')::uuid),
  0, 'and what was worked out from the old wording is dropped');
select public.forget_memory(current_setting('t.s2')::uuid);
select is((select status from public.memories where id = current_setting('t.s2')::uuid), 'forgotten', 'forget marks it for deletion');

-- Feedback nudges the taste dial once.
select set_config('t.sess', public.start_cooking_session(current_setting('t.hh')::uuid,
  (select id from public.recipes where slug = 'jeera-aloo' and household_id is null), 2)::text, true);
select public.submit_feedback(current_setting('t.sess')::uuid, 'good', array['too_spicy']);
select is((select spice::int from public.taste_profiles where member_id = current_setting('t.me')::uuid), 2, 'too spicy turns the spice dial down one step');
select public.submit_feedback(current_setting('t.sess')::uuid, 'meh', array['too_spicy', 'too_oily']);
select is((select spice::int || ':' || richness::int from public.taste_profiles where member_id = current_setting('t.me')::uuid), '2:3',
  'changing the feedback does not nudge again');
select is((select count(*)::int from public.meal_feedback where session_id = current_setting('t.sess')::uuid), 1, 'one feedback per member per session');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select throws_ok(format('select public.forget_memory(%L)', current_setting('t.m2')), 'P0002', null, 'other households cannot see or forget it');
select pg_temp.logout();

select * from finish();
rollback;
