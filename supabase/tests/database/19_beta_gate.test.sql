-- Beta gate report (KIT-152): KPIs from the database, service role only.
begin;
select plan(8);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

update public.feature_flags set enabled = true, rollout_pct = 100 where key = 'show_draft_recipes';
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-000000000b01', true);
select pg_temp.login('00000000-0000-0000-0000-000000000b01');
select set_config('t.hh', public.create_household('Gate test', 'en-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id', true);
select set_config('t.recipe', (select id::text from public.recipes where slug = 'jeera-aloo' and household_id is null), true);
select set_config('t.s1', public.start_cooking_session(current_setting('t.hh')::uuid, current_setting('t.recipe')::uuid, 2)::text, true);
select public.advance_session_step(current_setting('t.s1')::uuid, 1, 'touch');
select public.complete_cooking_session(current_setting('t.s1')::uuid);
select throws_ok($$select * from private.beta_gate_report(now() - interval '7 days', now() + interval '1 day')$$, '42501', null,
  'signed-in users cannot read the gate report');
reset role;

-- A hands-free session with no taps, two sets of picks (one accepted), voice turns and a costed voice session.
insert into public.cooking_sessions (id, household_id, member_id, recipe_id, status, mode, servings, completed_at)
select '00000000-0000-0000-0000-000000000c01', current_setting('t.hh')::uuid, m.id, current_setting('t.recipe')::uuid, 'completed', 'hands_free', 2, now()
  from public.household_members m where m.household_id = current_setting('t.hh')::uuid;
insert into public.session_events (household_id, session_id, event_type, channel, latency_ms, payload)
select current_setting('t.hh')::uuid, '00000000-0000-0000-0000-000000000c01', 'fast_path', 'voice', ms, '{"kind":"voice_turn"}'
  from unnest(array[400, 600, 800, 2000]) ms;
insert into public.recommendations (household_id, batch_id, meal_slot, recipe_id, rank, reason_text, status)
values (current_setting('t.hh')::uuid, '00000000-0000-0000-0000-000000000d01', 'dinner', current_setting('t.recipe')::uuid, 0, 'r', 'accepted'),
       (current_setting('t.hh')::uuid, '00000000-0000-0000-0000-000000000d01', 'dinner', current_setting('t.recipe')::uuid, 1, 'r', 'shown'),
       (current_setting('t.hh')::uuid, '00000000-0000-0000-0000-000000000d02', 'dinner', current_setting('t.recipe')::uuid, 0, 'r', 'dismissed');
insert into public.voice_sessions (household_id, member_id, room_name, ended_at, cost_inr)
select current_setting('t.hh')::uuid, m.id, 'gate-room', now(), 3.50 from public.household_members m where m.household_id = current_setting('t.hh')::uuid;

create temp table g on commit drop as
  select * from private.beta_gate_report(now() - interval '7 days', now() + interval '1 day');

select is((select count(*)::int from g), 11, 'one row per KPI');
select is((select value from g where kpi = 'pick_acceptance'), 0.5, 'one of two sets of picks was accepted');
select is((select met from g where kpi = 'pick_acceptance'), true, 'which meets the 40% target');
select is((select value from g where kpi = 'hands_free_rate'), 1.0, 'the voice session had no step taps (the touch session isn''t counted)');
select is((select value from g where kpi = 'voice_latency_p50_ms'), 700::numeric, 'median voice latency');
select is((select met from g where kpi = 'voice_latency_p95_ms'), false, 'p95 over the target is not met');
select is((select value from g where kpi = 'voice_cost_inr'), 3.5, 'average cost of a voice session');

select * from finish();
rollback;
