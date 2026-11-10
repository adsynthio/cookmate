-- Onboarding writes: create_household then consents, exactly as the app does (consent.tsx).
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

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000d1', true),
  ('00000000-0000-0000-0000-0000000000d2', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
create temp table hh on commit drop as
select (r ->> 'household_id')::uuid as household_id, (r ->> 'member_id')::uuid as member_id
from (select public.create_household('Sunita''s kitchen', 'hi-Latn-IN',
  '[{"display_name":"Sunita","is_self":true,"spice":4,"diet":"veg","age_group":"adult"},
    {"display_name":"Aarav","age_group":"child","spice":2,"diet":"veg"}]'::jsonb) as r) x;
grant select on hh to authenticated;

insert into public.consents (household_id, member_id, consent_type, granted, policy_version, channel)
select household_id, member_id, p.purpose, p.granted, '2026-11-draft-1', 'tap'
from hh, (values ('voice_processing', true), ('memory', true), ('analytics', false)) as p(purpose, granted);

select is((select count(*)::int from public.consents c join hh using (household_id)), 3,
  'the cook records one consent row per purpose asked');
select is((select preferred_language from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
  'hi-Latn-IN', 'chosen language (Hinglish) is saved on the profile');
select is((select v.language_code from public.voice_profiles v join hh using (member_id)),
  'hi-Latn-IN', 'and on the cook''s voice profile');

update public.consents set granted = true where consent_type = 'analytics';
select is((select granted from public.consents where consent_type = 'analytics'
           and household_id = (select household_id from hh)), false,
  'consents are append-only: updates change nothing');

-- Another user cannot read or forge consent for this household.
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
select is((select count(*)::int from public.consents), 0, 'other users cannot read the consents');
select throws_ok(
  $$insert into public.consents (household_id, member_id, consent_type, granted, policy_version)
    select household_id, member_id, 'marketing', true, 'x' from hh$$,
  '42501', null, 'other users cannot write consent for this household');

-- English is the default for everyone when no language was chosen.
select pg_temp.logout();
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000d3', true);
select is((select preferred_language from public.profiles where id = '00000000-0000-0000-0000-0000000000d3'),
  'en-IN', 'a new user starts in English');
select pg_temp.login('00000000-0000-0000-0000-0000000000d3');
select set_config('test.member', public.create_household('x', '', '[{"display_name":"x","is_self":true}]'::jsonb) ->> 'member_id', true);
select is(
  (select v.language_code from public.voice_profiles v where v.member_id = current_setting('test.member')::uuid),
  'en-IN', 'a household created without a language speaks English');

select * from finish();
rollback;
