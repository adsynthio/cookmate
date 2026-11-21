-- Joint families: up to 12 people in one household, and a clear error past that.
begin;
select plan(3);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000c1', true);
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');

select lives_ok(
  $$ select public.create_household('Joshi parivar', 'hi-IN',
       (select jsonb_agg(jsonb_build_object('display_name', 'Person ' || n, 'is_self', n = 1,
                                            'age_group', case when n > 9 then 'child' when n < 3 then 'elder' else 'adult' end))
          from generate_series(1, 12) as n)) $$,
  'a joint family of 12 can set up one kitchen'
);
select is((select count(*)::int from public.household_members), 12, 'all 12 people are members');

select throws_ok(
  $$ select public.create_household('Too big', 'hi-IN',
       (select jsonb_agg(jsonb_build_object('display_name', 'Person ' || n, 'is_self', n = 1)) from generate_series(1, 13) as n)) $$,
  '22023',
  'a household has up to 12 members',
  'more than 12 people is refused with a clear message'
);

select * from finish();
rollback;
