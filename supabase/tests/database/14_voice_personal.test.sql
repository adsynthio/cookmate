-- Personal voice (KIT-068, KIT-080, KIT-083): the packet names each member's id and the current step's id; voice
-- profiles are editable by the household; the step-audio bucket is public.
begin;
select plan(8);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

update public.feature_flags set enabled = true, rollout_pct = 100 where key = 'show_draft_recipes';
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000d1', true), ('00000000-0000-0000-0000-0000000000d2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select set_config('t.hh', public.create_household('Speaker test', 'hi-IN',
  '[{"display_name":"Sunita","is_self":true},{"display_name":"Ravi"}]'::jsonb) ->> 'household_id', true);
select set_config('t.ravi', (select id::text from public.household_members where household_id = current_setting('t.hh')::uuid and display_name = 'Ravi'), true);
select set_config('t.recipe', (select id::text from public.recipes where slug = 'jeera-aloo' and household_id is null), true);
select set_config('t.s', public.start_cooking_session(current_setting('t.hh')::uuid, current_setting('t.recipe')::uuid, 2)::text, true);
select set_config('t.p', public.get_voice_context(current_setting('t.hh')::uuid, null, current_setting('t.s')::uuid)::text, true);

select is((select count(*)::int from jsonb_array_elements(current_setting('t.p')::jsonb -> 'household' -> 'members') m where m ? 'member_id'),
  2, 'every member in the packet has an id, so the agent can switch to them');
select is(current_setting('t.p')::jsonb #>> '{session,current,step_id}',
  (select id::text from public.recipe_steps where recipe_id = current_setting('t.recipe')::uuid and step_no = 1),
  'the current step carries its id, for cached audio');

-- Switching to Ravi: his own voice settings come back.
update public.voice_profiles set pace = 'slow', skill_level = 'beginner', units_system = 'metric'
 where member_id = current_setting('t.ravi')::uuid;
select is(public.get_voice_context(current_setting('t.hh')::uuid, current_setting('t.ravi')::uuid) #>> '{speaker,name}', 'Ravi',
  'asking for another member gives their profile');
select is(public.get_voice_context(current_setting('t.hh')::uuid, current_setting('t.ravi')::uuid) #>> '{speaker,pace}', 'slow',
  'with their pace');
select is(public.get_voice_context(current_setting('t.hh')::uuid, current_setting('t.ravi')::uuid) #>> '{speaker,skill}', 'beginner',
  'and their skill level');
select throws_ok(
  $$update public.voice_profiles set pace = 'warp' where member_id = current_setting('t.ravi')::uuid$$,
  '23514', null, 'pace is one of slow, normal, fast');

-- Another household cannot change Ravi's voice settings.
select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
update public.voice_profiles set pace = 'fast' where member_id = current_setting('t.ravi')::uuid;
reset role;
select is((select pace from public.voice_profiles where member_id = current_setting('t.ravi')::uuid), 'slow',
  'other households cannot change a member''s voice settings');

select is((select public from storage.buckets where id = 'step-audio'), true, 'the step-audio bucket exists and is public');

select * from finish();
rollback;
