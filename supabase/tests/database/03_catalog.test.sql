-- Seeded catalog: readable by signed-in users, hidden from anon, drafts never published.
begin;
select plan(11);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Seed shape (counts guard against a silently empty or duplicated seed; the runner applies it twice).
select cmp_ok((select count(*)::int from public.ingredients), '>=', 150, 'ingredient catalog is seeded');
select is((select count(*)::int from public.ingredients), (select count(distinct canonical_name)::int from public.ingredients),
  'no duplicate ingredients after seeding twice');
select is((select count(*)::int from public.recipe_steps s join public.recipes r on r.id = s.recipe_id where r.slug = 'rajma' and r.household_id is null),
  6, 'recipe steps are upserted, not duplicated');
select ok((select names ->> 'hi' = 'आलू' and 'batata' = any(aliases) from public.ingredients where canonical_name = 'potato'),
  'ingredients carry Hindi names and aliases');
select is((select (grams_per_measure ->> 'katori')::numeric from public.ingredients where canonical_name = 'curd'),
  150::numeric, 'local measures are stored in grams');
select ok(not exists (select 1 from public.recipes where review_status <> 'approved' and is_published),
  'unreviewed recipes are never published');
select ok((select bool_and(safety_note is not null) from public.recipe_steps s join public.recipes r on r.id = s.recipe_id
           where r.slug = 'rajma' and s.whistles is not null),
  'rajma pressure-cook step carries its food-safety note');
select is((select rules ->> 'sessions_per_month' from public.feature_flags where key = 'voice_free_monthly_cap'),
  '4', 'free voice cap is a flag value (D5)');

-- As a signed-in user: catalog visible, draft recipes and their steps hidden.
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000c1', true);
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select cmp_ok((select count(*)::int from public.ingredients), '>=', 150, 'authenticated users read the ingredient catalog');
select is((select count(*)::int from public.recipe_steps), 0, 'steps of unpublished recipes are hidden');
select throws_ok($$insert into public.ingredients (canonical_name, category) values ('hacked', 'other')$$,
  '42501', null, 'users cannot write to the catalog');

select * from finish();
rollback;
