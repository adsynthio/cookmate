-- Weekly plate: completed meals counted by food group per India-time week, only for the caller's household.
begin;
select plan(7);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-00000000d001', true),
  ('00000000-0000-0000-0000-00000000d002', true);
select pg_temp.login('00000000-0000-0000-0000-00000000d001');
select set_config('t.a', public.create_household('A', 'en-IN', '[{"display_name":"Asha","is_self":true}]') ->> 'household_id', true);
select pg_temp.login('00000000-0000-0000-0000-00000000d002');
select set_config('t.b', public.create_household('B', 'en-IN', '[{"display_name":"Bina","is_self":true}]') ->> 'household_id', true);
reset role;

-- A cooked dal tadka and matar paneer this week, kanda poha last week, and left a rajma half done.
create function pg_temp.meal(p_hh text, p_slug text, p_status text, p_at timestamptz) returns void language sql as $$
  insert into public.cooking_sessions (household_id, member_id, recipe_id, status, started_at, completed_at)
  select current_setting(p_hh)::uuid, m.id, r.id, p_status, p_at - interval '40 minutes',
         case when p_status = 'completed' then p_at end
    from public.household_members m, public.recipes r
   where m.household_id = current_setting(p_hh)::uuid and r.slug = p_slug and r.household_id is null;
$$;
select set_config('t.mon', (date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')::text, true);
select pg_temp.meal('t.a', 'dal-tadka', 'completed', current_setting('t.mon')::timestamptz + interval '1 minute');
select pg_temp.meal('t.a', 'matar-paneer', 'completed', current_setting('t.mon')::timestamptz + interval '2 minutes');
select pg_temp.meal('t.a', 'rajma', 'abandoned', current_setting('t.mon')::timestamptz + interval '3 minutes');
select pg_temp.meal('t.a', 'kanda-poha', 'completed', current_setting('t.mon')::timestamptz - interval '1 minute');
select pg_temp.meal('t.b', 'rajma', 'completed', current_setting('t.mon')::timestamptz + interval '1 minute');

select pg_temp.login('00000000-0000-0000-0000-00000000d001');
select is((select meals from public.weekly_plate(current_setting('t.a')::uuid) order by week_start desc limit 1), 2,
  'only finished meals count');
select is((select food_groups from public.weekly_plate(current_setting('t.a')::uuid) order by week_start desc limit 1),
  '{"dal": 1, "sabzi": 1, "dairy": 1, "protein": 1}'::jsonb, 'each meal counts once per food group of its dish');
select is((select week_start from public.weekly_plate(current_setting('t.a')::uuid) order by week_start limit 1),
  (current_setting('t.mon')::timestamptz at time zone 'Asia/Kolkata')::date - 7, 'a meal just before Monday midnight IST is last week');
select is((select count(*)::int from public.weekly_plate(current_setting('t.a')::uuid, 1)), 1, 'asking for one week gives this week only');
select is((select count(*)::int from public.weekly_plate(current_setting('t.b')::uuid)), 0, 'another household''s meals are not counted');

reset role;
select is(private.snapshot_weekly_plate((current_setting('t.mon')::timestamptz at time zone 'Asia/Kolkata')::date), 2,
  'the weekly job keeps a row for each household that cooked');
select private.snapshot_weekly_plate((current_setting('t.mon')::timestamptz at time zone 'Asia/Kolkata')::date);
select is((select food_groups from public.nutrition_weekly where household_id = current_setting('t.a')::uuid),
  '{"dal": 1, "sabzi": 1, "dairy": 1, "protein": 1, "meals": 2}'::jsonb, 'running it again replaces the week, not adds to it');

select * from finish();
rollback;
