-- Community circles: only members see a circle and its dishes; invites join; reports hide; removal and leaving.
begin;
select plan(18);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-00000000c001', true),
  ('00000000-0000-0000-0000-00000000c002', true),
  ('00000000-0000-0000-0000-00000000c003', true);

select pg_temp.login('00000000-0000-0000-0000-00000000c001');
select set_config('t.a', public.create_household('A', 'en-IN', '[{"display_name":"Asha","is_self":true}]') ->> 'household_id', true);
select pg_temp.login('00000000-0000-0000-0000-00000000c002');
select set_config('t.b', public.create_household('B', 'en-IN', '[{"display_name":"Bina","is_self":true}]') ->> 'household_id', true);
select pg_temp.login('00000000-0000-0000-0000-00000000c003');
select set_config('t.c', public.create_household('C', 'en-IN', '[{"display_name":"Chetan","is_self":true}]') ->> 'household_id', true);

-- A makes a circle and an invite.
select pg_temp.login('00000000-0000-0000-0000-00000000c001');
select set_config('t.circle', public.community_create_circle(current_setting('t.a')::uuid, 'Family', 'Asha''s kitchen')::text, true);
select set_config('t.code', public.community_create_invite(current_setting('t.circle')::uuid, current_setting('t.a')::uuid), true);
select ok(current_setting('t.code') ~ '^[A-Z2-9]{8}$', 'invite codes are 8 easy-to-read characters');

-- C can't make an invite for a circle it isn't in, or act for another household.
select pg_temp.login('00000000-0000-0000-0000-00000000c003');
select throws_ok(format('select public.community_create_invite(%L, %L)', current_setting('t.circle'), current_setting('t.c')),
  '42501', null, 'only members can invite');
select throws_ok(format('select public.community_create_circle(%L, %L, %L)', current_setting('t.a'), 'x', 'y'),
  '42501', null, 'nobody can act for another household');
select is((select count(*)::int from public.community_circles), 0, 'outsiders do not see the circle');

-- B joins with the code (any case) and shares a dish.
select pg_temp.login('00000000-0000-0000-0000-00000000c002');
select is(public.community_join(lower(current_setting('t.code')), current_setting('t.b')::uuid, 'Bina''s kitchen'),
  current_setting('t.circle')::uuid, 'the invite code joins the circle');
select set_config('t.post', public.community_share(current_setting('t.circle')::uuid, current_setting('t.b')::uuid,
  (select id from public.recipes where slug = 'dal-tadka' and household_id is null), 'dal-tadka', 'Dal tadka',
  'Made it with extra garlic', array['More garlic', '  ', 'Less chilli'])::text, true);
select is((select changes from public.community_posts where id = current_setting('t.post')::uuid),
  array['More garlic', 'Less chilli'], 'blank changes are dropped');
select throws_ok(format('insert into public.community_posts (circle_id, household_id, author_name, dish_title) values (%L, %L, %L, %L)',
  current_setting('t.circle'), current_setting('t.b'), 'x', 'y'), '42501', null, 'posts can only be made through community_share');

select is((select jsonb_array_length(members) from public.community_circles(current_setting('t.b')::uuid)), 2,
  'a member sees the circle with both households in it');

-- A sees it in the feed; C sees nothing.
select pg_temp.login('00000000-0000-0000-0000-00000000c001');
select is((select author_name from public.community_feed(current_setting('t.a')::uuid)), 'Bina''s kitchen', 'members see dishes shared in their circle');
select is((select can_remove from public.community_feed(current_setting('t.a')::uuid)), true, 'the circle owner can remove a post');
select pg_temp.login('00000000-0000-0000-0000-00000000c003');
select is((select count(*)::int from public.community_posts), 0, 'outsiders cannot read posts');
select throws_ok(format('select * from public.community_feed(%L)', current_setting('t.a')), '42501', null, 'nor another household''s feed');

-- A reports it: gone for A at once, still there for B (one report is not enough to remove it).
select pg_temp.login('00000000-0000-0000-0000-00000000c001');
select public.community_report(current_setting('t.post')::uuid, current_setting('t.a')::uuid, 'other');
select is((select count(*)::int from public.community_feed(current_setting('t.a')::uuid)), 0, 'a reported post disappears for the reporter');
select pg_temp.login('00000000-0000-0000-0000-00000000c002');
select is((select count(*)::int from public.community_feed(current_setting('t.b')::uuid)), 1, 'and stays for others until enough reports');

-- B removes its own post; an expired invite does not work.
select public.community_remove_post(current_setting('t.post')::uuid, current_setting('t.b')::uuid);
select is((select count(*)::int from public.community_feed(current_setting('t.b')::uuid)), 0, 'authors can remove their own post');
reset role;
update public.community_invites set expires_at = now() - interval '1 minute' where code = current_setting('t.code');
select pg_temp.login('00000000-0000-0000-0000-00000000c003');
select throws_ok(format('select public.community_join(%L, %L, %L)', current_setting('t.code'), current_setting('t.c'), 'C'),
  'P0002', null, 'expired invites do not join');

-- A (the owner) leaves: B becomes owner; when B leaves too, the circle is gone.
select pg_temp.login('00000000-0000-0000-0000-00000000c001');
select public.community_leave(current_setting('t.circle')::uuid, current_setting('t.a')::uuid);
select pg_temp.login('00000000-0000-0000-0000-00000000c002');
select is((select role from public.community_members where household_id = current_setting('t.b')::uuid), 'owner',
  'when the owner leaves, the longest-standing member takes over');
select public.community_leave(current_setting('t.circle')::uuid, current_setting('t.b')::uuid);
reset role;
select is((select count(*)::int from public.community_circles where id = current_setting('t.circle')::uuid), 0,
  'a circle with nobody left is deleted');

select * from finish();
rollback;
