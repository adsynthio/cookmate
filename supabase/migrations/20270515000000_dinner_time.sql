-- Sprint 13 S3: the dinner-time nudge. The cook says when dinner is (default 8 pm) and how long before to be told
-- (default an hour); the daily pick goes out then, with dishes that fit the time left. The pick time is now worked
-- out from these two. A nudge that keeps being ignored backs off: after three unopened in a row, at most one every
-- third day. The app marks a nudge opened when it is tapped (notification_opened).

alter table private.notification_settings
  add column dinner_time time not null default '20:00',
  add column lead_minutes smallint not null default 60 check (lead_minutes between 20 and 120);

create or replace function public.get_notification_settings(p_household uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_member uuid := private.current_member(p_household);
  v private.notification_settings%rowtype;
begin
  if v_member is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  select * into v from private.notification_settings where member_id = v_member;
  return jsonb_build_object(
    'daily_pick', coalesce(v.daily_pick, false),
    'pick_time', to_char(coalesce(v.pick_time, '19:00'::time), 'HH24:MI'),
    'dinner_time', to_char(coalesce(v.dinner_time, '20:00'::time), 'HH24:MI'),
    'lead_minutes', coalesce(v.lead_minutes, 60),
    'quiet_start', to_char(coalesce(v.quiet_start, '22:00'::time), 'HH24:MI'),
    'quiet_end', to_char(coalesce(v.quiet_end, '07:00'::time), 'HH24:MI'));
end $$;

-- p_settings: any of {daily_pick, dinner_time 'HH:MI', lead_minutes, quiet_start, quiet_end}. The nudge time
-- (dinner time minus the lead) can't be in quiet hours.
create or replace function public.set_notification_settings(p_household uuid, p_settings jsonb, p_policy_version text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := private.current_member(p_household);
  v_old private.notification_settings%rowtype;
  v_on boolean;
  v_dinner time;
  v_lead smallint;
  v_pick time;
  v_qs time;
  v_qe time;
begin
  if v_member is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  select * into v_old from private.notification_settings where member_id = v_member;
  begin
    v_on := coalesce((p_settings ->> 'daily_pick')::boolean, v_old.daily_pick, false);
    v_dinner := coalesce((p_settings ->> 'dinner_time')::time, v_old.dinner_time, '20:00');
    v_lead := coalesce((p_settings ->> 'lead_minutes')::smallint, v_old.lead_minutes, 60);
    v_qs := coalesce((p_settings ->> 'quiet_start')::time, v_old.quiet_start, '22:00');
    v_qe := coalesce((p_settings ->> 'quiet_end')::time, v_old.quiet_end, '07:00');
  exception when others then
    raise exception 'invalid settings' using errcode = '22023';
  end;
  if v_lead not between 20 and 120 then
    raise exception 'invalid settings' using errcode = '22023';
  end if;
  v_pick := v_dinner - make_interval(mins => v_lead);
  if private.in_quiet_hours(v_pick, v_qs, v_qe) then
    raise exception 'pick time is inside quiet hours' using errcode = '22023';
  end if;

  insert into private.notification_settings (member_id, household_id, daily_pick, pick_time, dinner_time, lead_minutes, quiet_start, quiet_end, updated_at)
  values (v_member, p_household, v_on, v_pick, v_dinner, v_lead, v_qs, v_qe, now())
  on conflict (member_id) do update set daily_pick = excluded.daily_pick, pick_time = excluded.pick_time,
    dinner_time = excluded.dinner_time, lead_minutes = excluded.lead_minutes,
    quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, updated_at = now();

  if v_on is distinct from coalesce(v_old.daily_pick, false) then
    insert into public.consents (household_id, member_id, consent_type, granted, policy_version, channel)
    values (p_household, v_member, 'notifications', v_on, coalesce(left(p_policy_version, 40), '2026-11-draft-1'), 'tap');
  end if;
  return public.get_notification_settings(p_household);
end $$;

-- Rows saved before this migration: the nudge now goes an hour before dinner (8 pm unless changed).
update private.notification_settings set pick_time = dinner_time - make_interval(mins => lead_minutes);

-- Due: the nudge time (dinner minus lead) came in the last 30 minutes, so a late nudge never arrives after dinner.
-- Back-off: when the last three sent nudges were all left unopened, only one every third day.
drop function public.notify_due(timestamptz);
create function public.notify_due(p_now timestamptz default now())
returns table (member_id uuid, household_id uuid, timezone text, region text, language text, tokens text[], dinner_time text, lead_minutes smallint)
language sql stable security definer set search_path = '' as $$
  with local as (
    select s.member_id, m.household_id, h.timezone, h.region, p.preferred_language,
           (p_now at time zone h.timezone) as at_local, s.dinner_time, s.lead_minutes,
           (s.dinner_time - make_interval(mins => s.lead_minutes)) as nudge_time, s.quiet_start, s.quiet_end
      from private.notification_settings s
      join public.household_members m on m.id = s.member_id and m.status = 'active'
      join public.households h on h.id = m.household_id
      left join public.profiles p on p.id = m.user_id
     where s.daily_pick
  )
  select l.member_id, l.household_id, l.timezone, l.region, coalesce(l.preferred_language, 'en-IN'),
         array_agg(d.push_token order by d.last_seen_at desc), to_char(l.dinner_time, 'HH24:MI'), l.lead_minutes
    from local l
    join public.devices d on d.member_id = l.member_id and d.push_token is not null
   where mod((extract(epoch from l.at_local::time) - extract(epoch from l.nudge_time))::int + 86400, 86400) < 1800
     and not private.in_quiet_hours(l.at_local::time, l.quiet_start, l.quiet_end)
     and coalesce((select c.granted from public.consents c
                    where c.member_id = l.member_id and c.consent_type = 'notifications'
                    order by c.created_at desc limit 1), false)
     and not exists (select 1 from public.notifications n
                      where n.member_id = l.member_id
                        and n.type in ('daily_pick', 'use_soon', 'leftover', 'restock')
                        and (n.scheduled_for at time zone l.timezone)::date = l.at_local::date)
     and not (
       (select count(*) = 3 and bool_and(x.opened_at is null)
          from (select n.opened_at from public.notifications n
                 where n.member_id = l.member_id and n.type = 'daily_pick' and n.status = 'sent'
                 order by n.scheduled_for desc limit 3) x)
       and exists (select 1 from public.notifications n
                    where n.member_id = l.member_id and n.type = 'daily_pick' and n.status = 'sent'
                      and n.scheduled_for > p_now - interval '60 hours'))
   group by l.member_id, l.household_id, l.timezone, l.region, l.preferred_language, l.dinner_time, l.lead_minutes
$$;
revoke all on function public.notify_due(timestamptz) from public, anon, authenticated;
grant execute on function public.notify_due(timestamptz) to service_role;

-- The cook tapped the nudge for this batch: it was not ignored.
create or replace function public.notification_opened(p_batch uuid) returns void
language sql security definer set search_path = '' as $$
  update public.notifications n
     set opened_at = coalesce(n.opened_at, now())
    from public.household_members m
   where m.id = n.member_id and m.user_id = (select auth.uid())
     and n.type = 'daily_pick' and n.payload -> 'data' ->> 'batch_id' = p_batch::text
$$;
revoke all on function public.notification_opened(uuid) from public, anon;
grant execute on function public.notification_opened(uuid) to authenticated;
