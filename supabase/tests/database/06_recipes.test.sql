-- Recipe visibility (drafts only while show_draft_recipes is on) and multilingual search (KIT-054, REC-08).
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

insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000f1', true);

-- Flag on (the seeded staging default): drafts are visible, with their steps and ingredients.
update public.feature_flags set enabled = true, rollout_pct = 100 where key = 'show_draft_recipes';
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select ok((select count(*) from public.recipes where household_id is null) >= 10, 'staging: draft recipes are visible');
select ok((select count(*) from public.recipe_steps s join public.recipes r on r.id = s.recipe_id where r.slug = 'rajma') > 0,
  'with their steps');

select is((select slug from public.search_recipes('rajma') limit 1), 'rajma', 'search: Hinglish name');
select is((select slug from public.search_recipes('राजमा') limit 1), 'rajma', 'search: Devanagari name');
select is((select slug from public.search_recipes('kidney bean curry') limit 1), 'rajma', 'search: English description');
select is((select count(*)::int from public.search_recipes('pizza')), 0, 'search: no false hits');
select ok((select bool_or(slug = 'jeera-aloo') from public.search_recipes('aloo')), 'search: by main ingredient');
select pg_temp.logout();

-- Flag off (production): unapproved recipes disappear for users, including from search.
update public.feature_flags set enabled = false where key = 'show_draft_recipes';
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select is((select count(*)::int from public.recipes where household_id is null and not is_published), 0,
  'production: drafts are hidden');
select is((select count(*)::int from public.search_recipes('rajma')), 0, 'and not searchable');
select pg_temp.logout();

select * from finish();
rollback;
