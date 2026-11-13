-- Sprint 14 G5: reporting a household's own AI recipe hides it; others can't report or read; off switches exist.
begin;
select plan(9);

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
  ('00000000-0000-0000-0000-0000000006a1', true),
  ('00000000-0000-0000-0000-0000000006b1', true);

select pg_temp.login('00000000-0000-0000-0000-0000000006a1');
create temp table h on commit drop as
  select (public.create_household('Family', 'hi-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id')::uuid as id;
grant select on h to authenticated;
select pg_temp.logout();

insert into public.recipes (id, household_id, slug, title, course, diet, base_servings, source, review_status, is_published)
values
  ('00000000-0000-0000-0000-0000000006e1', (select id from h), 'new-creation-x', 'Tawa mix', 'main', 'veg', 2, 'generated', 'draft', false),
  ('00000000-0000-0000-0000-0000000006e2', null, 'curated-x', 'Dal', 'main', 'veg', 2, 'curated', 'approved', true);

select ok((select count(*) = 4 from public.feature_flags where key like 'ai_off_%' and not enabled), 'four AI off switches, all on by default');

select pg_temp.login('00000000-0000-0000-0000-0000000006a1');
select lives_ok($$ select public.report_recipe((select id from h), '00000000-0000-0000-0000-0000000006e1', 'unsafe', 'water into hot oil') $$,
  'a member reports the household''s own AI recipe');
select throws_ok($$ select public.report_recipe((select id from h), '00000000-0000-0000-0000-0000000006e2', 'wrong', null) $$,
  '22023', null, 'a curated library recipe can''t be reported this way');
select throws_ok($$ select public.report_recipe((select id from h), '00000000-0000-0000-0000-0000000006e1', 'rude', null) $$,
  '23514', null, 'only known reasons');
select is((select count(*)::int from public.recipe_reports), 1, 'the member sees the report');
select throws_ok($$ insert into public.recipe_reports (household_id, recipe_id, reason) values ((select id from h), '00000000-0000-0000-0000-0000000006e1', 'other') $$,
  '42501', null, 'no direct inserts');
select pg_temp.logout();

select ok((select hidden_at is not null from public.recipes where id = '00000000-0000-0000-0000-0000000006e1'), 'the reported recipe is hidden');

select pg_temp.login('00000000-0000-0000-0000-0000000006b1');
select throws_ok($$ select public.report_recipe((select id from h), '00000000-0000-0000-0000-0000000006e1', 'unsafe', null) $$,
  '42501', null, 'someone outside the household can''t report it');
select is((select count(*)::int from public.recipe_reports), 0, 'and can''t read the reports');
select pg_temp.logout();

select * from finish();
rollback;
