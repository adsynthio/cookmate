-- Onboarding taste: create_household keeps favourite cuisines (known codes only) and the weekday time limit.
begin;
select plan(5);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-000000000e01', true);
select pg_temp.login('00000000-0000-0000-0000-000000000e01');
select set_config('t.hh', public.create_household('Taste test', 'en-IN', '[
  {"display_name":"Asha","is_self":true,"spice":4,"preferred_cuisines":["punjabi","gujarati","punjabi","martian"],"max_time_min":30},
  {"display_name":"Ravi","age_group":"child","preferred_cuisines":"punjabi","max_time_min":5},
  {"display_name":"Old app"}
]'::jsonb) ->> 'household_id', true);

select is((select preferred_cuisines from public.taste_profiles t join public.household_members m on m.id = t.member_id
            where m.household_id = current_setting('t.hh')::uuid and m.display_name = 'Asha'),
  array['gujarati', 'punjabi'], 'known cuisines are kept once each; unknown codes are dropped');
select is((select max_time_min::int from public.taste_profiles t join public.household_members m on m.id = t.member_id
            where m.household_id = current_setting('t.hh')::uuid and m.display_name = 'Asha'),
  30, 'the weekday time limit is kept');
select is((select preferred_cuisines from public.taste_profiles t join public.household_members m on m.id = t.member_id
            where m.household_id = current_setting('t.hh')::uuid and m.display_name = 'Ravi'),
  '{}'::text[], 'a cuisine list that is not a list is ignored');
select is((select max_time_min from public.taste_profiles t join public.household_members m on m.id = t.member_id
            where m.household_id = current_setting('t.hh')::uuid and m.display_name = 'Ravi'),
  null, 'a time limit outside 10 to 240 minutes is ignored');
select is((select spice::int from public.taste_profiles t join public.household_members m on m.id = t.member_id
            where m.household_id = current_setting('t.hh')::uuid and m.display_name = 'Old app'),
  3, 'older app builds without taste fields still create members as before');

select * from finish();
rollback;
