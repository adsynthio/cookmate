-- T1: AI credits. A new kitchen starts with 50 and gets 5 free a day; paid calls spend today's free credits first,
-- then the rest, never below zero; free tasks and failed calls cost nothing; at zero the AI pauses until the next day
-- or a top-up; unlimited kitchens never pause; cooks can read their own kitchen's credits but not change them.
begin;
select plan(16);

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
  ('00000000-0000-0000-0000-0000000007a1', true),
  ('00000000-0000-0000-0000-0000000007b1', true);

select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
create temp table h on commit drop as
  select (public.create_household('Family', 'hi-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id')::uuid as id;
grant select on h to authenticated;

select is((select balance from public.ai_credits where household_id = (select id from h)), 50::numeric,
  'a new kitchen starts with 50 credits');
select is(public.ai_credits_left((select id from h)) - 'refills_at',
  '{"allowed": true, "balance": 50.00, "daily_left": 5.00, "unlimited": false, "daily_allowance": 5.00}'::jsonb,
  'the cook sees 50 credits and 5 free ones for today');
select pg_temp.logout();

-- Costs: Sonnet input is $2 a million tokens and the planning rate is ₹88 to the dollar, so 20,000 tokens = ₹3.52.
insert into public.ai_requests (household_id, task, model, prompt_version, input_tokens, cached_tokens, output_tokens, latency_ms, status)
values ((select id from h), 'scan_pantry_image', 'claude-sonnet-5-5', 't@1', 20000, 0, 0, 100, 'ok');
select is((select array[balance, daily_used] from public.ai_credits where household_id = (select id from h)), array[50, 3.52]::numeric[],
  'a paid call spends today''s free credits first');

-- ₹8.80: the last 1.48 of today's free credits, then 7.32 of the trial.
insert into public.ai_requests (household_id, task, model, prompt_version, input_tokens, cached_tokens, output_tokens, latency_ms, status)
values ((select id from h), 'ask_cookmate', 'claude-sonnet-5-5', 't@1', 50000, 0, 0, 100, 'ok');
select is((select balance from public.ai_credits where household_id = (select id from h)), 42.68::numeric,
  'then the trial credits');

insert into public.ai_requests (household_id, task, model, prompt_version, input_tokens, cached_tokens, output_tokens, latency_ms, status)
values ((select id from h), 'review_recipe_safety', 'claude-haiku-5-5', 't@1', 100000, 0, 0, 100, 'ok');
select is((select array[balance, daily_used, spent_total] from public.ai_credits where household_id = (select id from h)),
  array[42.68, 5, 12.32]::numeric[], 'the safety review and the other free tasks cost nothing');

insert into public.ai_requests (household_id, task, model, prompt_version, input_tokens, cached_tokens, output_tokens, latency_ms, status)
values ((select id from h), 'pick_chef', 'claude-sonnet-5-5', 't@1', null, null, null, 100, 'error');
select is((select spent_total from public.ai_credits where household_id = (select id from h)), 12.32::numeric,
  'a failed call costs nothing');

-- Almost out: the last call costs more than what's left.
update public.ai_credits set balance = 1 where household_id = (select id from h);
insert into public.ai_requests (household_id, task, model, prompt_version, input_tokens, cached_tokens, output_tokens, latency_ms, status)
values ((select id from h), 'write_named_dish', 'claude-sonnet-5-5', 't@1', 50000, 0, 0, 100, 'ok');
select is((select balance from public.ai_credits where household_id = (select id from h)), 0::numeric,
  'the balance stops at zero');

select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
select is((public.ai_credits_left((select id from h)) ->> 'allowed')::boolean, false, 'at zero the kitchen''s AI pauses');
select pg_temp.logout();

-- The next day in India brings 5 free credits again.
update public.ai_credits set daily_on = daily_on - 1 where household_id = (select id from h);
select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
select is(public.ai_credits_left((select id from h)) -> 'daily_left', '5.00'::jsonb, 'a new day brings 5 free credits');
select is((public.ai_credits_left((select id from h)) ->> 'allowed')::boolean, true, 'and the AI is back');
select throws_ok($$ update public.ai_credits set balance = 1000 $$, '42501', null, 'a cook can''t give their kitchen credits');
select throws_ok($$ select private.add_ai_credits((select id from h), 1000) $$, '42501', null, 'or use the owner tools');
select pg_temp.logout();

select is(private.add_ai_credits((select id from h), 25), 25::numeric, 'the owner tops a kitchen up');

update public.ai_credits set balance = 0, daily_on = (now() at time zone 'Asia/Kolkata')::date, daily_used = 5
 where household_id = (select id from h);
select private.set_ai_unlimited((select id from h), true);
select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
select is((public.ai_credits_left((select id from h)) ->> 'allowed')::boolean, true, 'an unlimited kitchen never pauses');
select pg_temp.logout();
insert into public.ai_requests (household_id, task, model, prompt_version, input_tokens, cached_tokens, output_tokens, latency_ms, status)
values ((select id from h), 'scan_pantry_image', 'claude-sonnet-5-5', 't@1', 20000, 0, 0, 100, 'ok');
select is((select array[balance, spent_total] from public.ai_credits where household_id = (select id from h)), array[0, 24.64]::numeric[],
  'and still counts what it spends');

select pg_temp.login('00000000-0000-0000-0000-0000000007b1');
select is((select count(*)::int from public.ai_credits), 0, 'another family can''t see this kitchen''s credits');
select pg_temp.logout();

select * from finish();
rollback;
