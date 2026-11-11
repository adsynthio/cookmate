-- Telemetry (KIT-069, KIT-132): the agent closes its own voice session once with usage, latency and cost; usage
-- lands in ai_requests; turn latencies land on the cooking session; the reports are for the service role only.
begin;
select plan(14);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

update public.feature_flags set enabled = true, rollout_pct = 100 where key = 'show_draft_recipes';
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000e1', true), ('00000000-0000-0000-0000-0000000000e2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select set_config('t.hh', public.create_household('Telemetry test', 'hi-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id', true);
select set_config('t.recipe', (select id::text from public.recipes where slug = 'jeera-aloo' and household_id is null), true);
select set_config('t.s', public.start_cooking_session(current_setting('t.hh')::uuid, current_setting('t.recipe')::uuid, 2)::text, true);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select set_config('t.other', public.create_household('Other', 'en-IN', '[{"display_name":"Bo","is_self":true}]'::jsonb) ->> 'household_id', true);
reset role;

-- voice-token opens the row with the service role.
insert into public.voice_sessions (id, household_id, member_id, cooking_session_id, room_name)
select '00000000-0000-0000-0000-00000000e5e1', current_setting('t.hh')::uuid, m.id, current_setting('t.s')::uuid, 'room-e1'
  from public.household_members m where m.household_id = current_setting('t.hh')::uuid;

select set_config('t.stats', '{"turns": 4, "fast_path_turns": 3, "stt_seconds": 120, "tts_characters": 1000, "tts_cached_characters": 400,
  "llm_input_tokens": 10000, "llm_cached_tokens": 50000, "llm_output_tokens": 2000, "p50_latency_ms": 650, "p95_latency_ms": 1400,
  "llm_model": "claude-haiku-5-5", "end_reason": "participant_left", "language": "hi-IN",
  "turn_latencies": [{"ms": 300, "fast_path": true}, {"ms": 320, "fast_path": true}, {"ms": 280, "fast_path": true}, {"ms": 1400, "fast_path": false}]}', true);

-- Someone from another household can't close it.
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select throws_ok($$select public.record_voice_session('00000000-0000-0000-0000-00000000e5e1', current_setting('t.stats')::jsonb)$$,
  '42501', null, 'another household cannot record this voice session');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
-- Haiku: (10000*0.10 + 50000*0.01 + 2000*0.50)/1e6 USD = 0.0025 USD = Rs 0.22; TTS 1000 chars = Rs 1.50; STT 120 s = Rs 1.00.
select is(public.record_voice_session('00000000-0000-0000-0000-00000000e5e1', current_setting('t.stats')::jsonb), 2.72::numeric,
  'cost is the model, speech-to-text and text-to-speech usage priced in rupees');
select throws_ok($$select public.record_voice_session('00000000-0000-0000-0000-00000000e5e1', current_setting('t.stats')::jsonb)$$,
  '23505', null, 'a voice session is recorded once');
select is((select turns from public.voice_sessions where id = '00000000-0000-0000-0000-00000000e5e1'), 4, 'turns are kept');
select is((select p95_latency_ms from public.voice_sessions where id = '00000000-0000-0000-0000-00000000e5e1'), 1400, 'with p95 latency');
select ok((select ended_at is not null from public.voice_sessions where id = '00000000-0000-0000-0000-00000000e5e1'), 'and the end time');
select is((select count(*)::int from public.session_events where session_id = current_setting('t.s')::uuid and payload ->> 'kind' = 'voice_turn'), 4,
  'each turn''s latency is on the cooking session');
select is((select count(*)::int from public.session_events where session_id = current_setting('t.s')::uuid and event_type = 'fast_path'), 3,
  'fast-path turns are marked as such');
select throws_ok($$select count(*) from public.ai_requests$$, '42501', null, 'signed-in users cannot read the AI request log');
reset role;

select is((select array_agg(task order by task) from public.ai_requests where household_id = current_setting('t.hh')::uuid),
  array['voice_stt', 'voice_tts', 'voice_turns'], 'the session''s model and speech usage go to ai_requests');

select is((select cost_inr from private.ai_cost_report(now() - interval '1 day', now() + interval '1 day') where task = 'voice_tts'), 1.50::numeric,
  'the cost report prices each task');
select is((select p95_latency_ms from private.voice_report(now() - interval '1 day', now() + interval '1 day')), 1238,
  'the voice report takes p95 over the recorded turns (interpolated)');
select is((select fast_path_share from private.voice_report(now() - interval '1 day', now() + interval '1 day')), 0.750::numeric,
  'and the fast-path share');

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$select * from private.ai_cost_report(now() - interval '1 day', now())$$, '42501', null, 'the reports are not for app users');
reset role;

select * from finish();
rollback;
