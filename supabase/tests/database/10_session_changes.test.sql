-- "I changed something" (KIT-075): the change is kept on the session with notes for later steps only, logged, and
-- closed to other households and to finished sessions.
begin;
select plan(8);

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
  ('00000000-0000-0000-0000-0000000000d1', true), ('00000000-0000-0000-0000-0000000000d2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select set_config('t.hh', public.create_household('Change test', 'en-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id', true);
select set_config('t.s', public.start_cooking_session(current_setting('t.hh')::uuid,
  (select id from public.recipes where slug = 'jeera-aloo' and household_id is null), 2)::text, true);
select public.advance_session_step(current_setting('t.s')::uuid, 1);

select is(
  public.log_session_change(current_setting('t.s')::uuid, '  used oil instead of ghee  ',
    '[{"step":1,"note":"too late"},{"step":3,"note":"Oil smokes sooner: keep the heat medium."},{"step":99,"note":"no such step"},{"step":"x","note":"bad"},{"note":"no step"}]'::jsonb
  ) - 'at',
  '{"step":2,"change":"used oil instead of ghee","notes":[{"step":3,"note":"Oil smokes sooner: keep the heat medium."}]}'::jsonb,
  'the change is trimmed and only notes for steps still ahead are kept');
select is((select jsonb_array_length(modifications) from public.cooking_sessions where id = current_setting('t.s')::uuid), 1, 'it is kept on the session');
select is((select current_step from public.cooking_sessions where id = current_setting('t.s')::uuid)::int, 2, 'the cook''s place does not move');
select is((select count(*)::int from public.session_events where session_id = current_setting('t.s')::uuid and event_type = 'modification'), 1, 'and logged');
select is(jsonb_array_length(public.log_session_change(current_setting('t.s')::uuid, 'added more water', '"not an array"'::jsonb) -> 'notes'), 0,
  'malformed notes are dropped, the change still counts');
select throws_ok(format('select public.log_session_change(%L, %L)', current_setting('t.s'), '   '), '22023', null, 'an empty change is refused');

select public.complete_cooking_session(current_setting('t.s')::uuid);
select throws_ok(format('select public.log_session_change(%L, %L)', current_setting('t.s'), 'late change'), '22023', null, 'a finished session takes no more changes');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
select throws_ok(format('select public.log_session_change(%L, %L)', current_setting('t.s'), 'not mine'), 'P0002', null, 'other households cannot touch it');
select pg_temp.logout();

select * from finish();
rollback;
