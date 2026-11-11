-- Nudges (Sprint 6 part 4): pantry confidence and check questions (KIT-035), the daily pick notification (KIT-045)
-- and the export sweep (SECURITY_REVIEW #10).
--
-- * decay_inventory_confidence now also looks at the item's state: cooked food and leftovers are doubtful after a
--   day or two, opened packets sooner than sealed ones (PLAN.md §5.1).
-- * pantry_check_today: at most one "Still have X?" question per household per local day. suggest-meals proposes
--   the item (only when the answer changes tonight's pick); this records it, or returns the one already asked.
-- * Notification settings live in private.notification_settings behind get/set functions (opt-in, pick time,
--   quiet hours). Turning the daily pick on or off also records the 'notifications' consent.
-- * notify_due / notify_secret_ok / stale_exports are for the notify Edge Function (service role only). pg_cron
--   calls notify every 15 minutes through pg_net with a random secret kept in Vault; nothing to configure except
--   the project URL secret (see the end of this file).

-- --- decay by place and state --------------------------------------------------------------------------------

create or replace function private.decay_inventory_confidence() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with params as (
    select i.id,
           i.household_id,
           i.confidence as old_conf,
           -- Half-life in days: where it is kept, shortened by what state it is in; cooked food and leftovers
           -- are capped at a day or two unless frozen.
           least(
             case coalesce(l.kind, 'pantry')
               when 'fridge' then 5
               when 'counter' then 4
               when 'ready_made' then 3
               when 'freezer' then 60
               when 'staples' then 45
               else 30
             end * case i.state when 'opened' then 0.6 when 'homemade' then 0.8 else 1 end,
             case i.state
               when 'leftover' then case l.kind when 'freezer' then 30 else 1.5 end
               when 'cooked' then case l.kind when 'freezer' then 30 else 2 end
               else 1000
             end
           ) as half_life_days,
           (i.expiry_date is not null and i.expiry_date < current_date) as expired
      from public.inventory_items i
      left join public.storage_locations l on l.id = i.location_id
     where i.status = 'active'
  ),
  updated as (
    update public.inventory_items i
       set confidence = greatest(
             0.05,
             round(
               (case when p.expired then least(p.old_conf, 0.30) else p.old_conf end
                 * exp(-ln(2) / p.half_life_days))::numeric,
               2))
      from params p
     where p.id = i.id
    returning i.id, i.household_id, p.old_conf, i.confidence as new_conf
  ),
  crossed as (
    insert into public.inventory_events (household_id, item_id, event_type, reason, actor_kind)
    select household_id, id, 'decayed', 'confidence fell below 0.5', 'system'
      from updated
     where old_conf >= 0.5 and new_conf < 0.5
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end $$;
revoke all on function private.decay_inventory_confidence() from public;

-- --- one check question a day (KIT-035) ----------------------------------------------------------------------

create table private.pantry_checks (
  household_id uuid not null references public.households (id) on delete cascade,
  local_date date not null,
  item_id uuid references public.inventory_items (id) on delete set null,
  asked_at timestamptz not null default now(),
  primary key (household_id, local_date)
);
create index pantry_checks_item_id_idx on private.pantry_checks (item_id);
comment on table private.pantry_checks is 'The one pantry check question asked per household per local day (KIT-035).';
revoke all on private.pantry_checks from public, anon, authenticated;

-- Returns the item to ask about today: the one already asked if there is one (so the question stays the same all
-- day), else p_item, which is recorded. Null when nothing should be asked. Members only.
create or replace function public.pantry_check_today(p_household uuid, p_item uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_today date;
  v_item uuid;
  v_asked boolean;
begin
  if private.current_member(p_household) is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  select (now() at time zone coalesce(h.timezone, 'Asia/Kolkata'))::date into v_today
    from public.households h where h.id = p_household;

  select true, c.item_id into v_asked, v_item from private.pantry_checks c
   where c.household_id = p_household and c.local_date = v_today;
  if v_asked then
    -- Ask again only while it is still unanswered: "yes" confirms it (confidence 0.95), "no" finishes it.
    return (select i.id from public.inventory_items i
             where i.id = v_item and i.status = 'active' and i.confidence <= 0.6);
  end if;
  if p_item is null then
    return null;
  end if;
  if not exists (select 1 from public.inventory_items i
                  where i.id = p_item and i.household_id = p_household and i.status = 'active') then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  insert into private.pantry_checks (household_id, local_date, item_id) values (p_household, v_today, p_item)
  on conflict (household_id, local_date) do nothing;
  return (select item_id from private.pantry_checks where household_id = p_household and local_date = v_today);
end $$;
revoke all on function public.pantry_check_today(uuid, uuid) from public, anon;
grant execute on function public.pantry_check_today(uuid, uuid) to authenticated;

-- --- notification settings (KIT-045) -------------------------------------------------------------------------

create table private.notification_settings (
  member_id uuid primary key references public.household_members (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  daily_pick boolean not null default false,
  pick_time time not null default '16:00',
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  updated_at timestamptz not null default now()
);
create index notification_settings_household_id_idx on private.notification_settings (household_id);
comment on table private.notification_settings is 'Per member: daily pick on/off, its time and quiet hours (KIT-045, NOTIF-01). Off by default.';
revoke all on private.notification_settings from public, anon, authenticated;

-- True when t falls in the quiet window [start, end), which may cross midnight.
create or replace function private.in_quiet_hours(t time, q_start time, q_end time) returns boolean
language sql immutable set search_path = '' as $$
  select case when q_start = q_end then false
              when q_start < q_end then t >= q_start and t < q_end
              else t >= q_start or t < q_end end
$$;

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
    'pick_time', to_char(coalesce(v.pick_time, '16:00'::time), 'HH24:MI'),
    'quiet_start', to_char(coalesce(v.quiet_start, '22:00'::time), 'HH24:MI'),
    'quiet_end', to_char(coalesce(v.quiet_end, '07:00'::time), 'HH24:MI'));
end $$;

-- p_settings: any of {daily_pick, pick_time 'HH:MI', quiet_start, quiet_end}. The pick time can't be in quiet hours.
create or replace function public.set_notification_settings(p_household uuid, p_settings jsonb, p_policy_version text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := private.current_member(p_household);
  v_old private.notification_settings%rowtype;
  v_on boolean;
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
    v_pick := coalesce((p_settings ->> 'pick_time')::time, v_old.pick_time, '16:00');
    v_qs := coalesce((p_settings ->> 'quiet_start')::time, v_old.quiet_start, '22:00');
    v_qe := coalesce((p_settings ->> 'quiet_end')::time, v_old.quiet_end, '07:00');
  exception when others then
    raise exception 'invalid settings' using errcode = '22023';
  end;
  if private.in_quiet_hours(v_pick, v_qs, v_qe) then
    raise exception 'pick time is inside quiet hours' using errcode = '22023';
  end if;

  insert into private.notification_settings (member_id, household_id, daily_pick, pick_time, quiet_start, quiet_end, updated_at)
  values (v_member, p_household, v_on, v_pick, v_qs, v_qe, now())
  on conflict (member_id) do update set daily_pick = excluded.daily_pick, pick_time = excluded.pick_time,
    quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, updated_at = now();

  -- Opting in or out is a consent decision (NOTIF-01): record it when it changes.
  if v_on is distinct from coalesce(v_old.daily_pick, false) then
    insert into public.consents (household_id, member_id, consent_type, granted, policy_version, channel)
    values (p_household, v_member, 'notifications', v_on, coalesce(left(p_policy_version, 40), '2026-11-draft-1'), 'tap');
  end if;
  return public.get_notification_settings(p_household);
end $$;

revoke all on function public.get_notification_settings(uuid), public.set_notification_settings(uuid, jsonb, text) from public, anon;
grant execute on function public.get_notification_settings(uuid), public.set_notification_settings(uuid, jsonb, text) to authenticated;

-- --- for the notify Edge Function (service role only) --------------------------------------------------------

-- Members whose pick time has come in the last two hours (local time), outside quiet hours, opted in with consent,
-- with a push token, and not yet nudged today: the one-proactive-notification-a-day cap (NOTIF-01).
create or replace function public.notify_due(p_now timestamptz default now())
returns table (member_id uuid, household_id uuid, timezone text, region text, language text, tokens text[])
language sql stable security definer set search_path = '' as $$
  with local as (
    select s.member_id, m.household_id, h.timezone, h.region, p.preferred_language,
           (p_now at time zone h.timezone) as at_local, s.pick_time, s.quiet_start, s.quiet_end
      from private.notification_settings s
      join public.household_members m on m.id = s.member_id and m.status = 'active'
      join public.households h on h.id = m.household_id
      left join public.profiles p on p.id = m.user_id
     where s.daily_pick
  )
  select l.member_id, l.household_id, l.timezone, l.region, coalesce(l.preferred_language, 'en-IN'),
         array_agg(d.push_token order by d.last_seen_at desc)
    from local l
    join public.devices d on d.member_id = l.member_id and d.push_token is not null
   where mod((extract(epoch from l.at_local::time) - extract(epoch from l.pick_time))::int + 86400, 86400) < 7200
     and not private.in_quiet_hours(l.at_local::time, l.quiet_start, l.quiet_end)
     and coalesce((select c.granted from public.consents c
                    where c.member_id = l.member_id and c.consent_type = 'notifications'
                    order by c.created_at desc limit 1), false)
     and not exists (select 1 from public.notifications n
                      where n.member_id = l.member_id
                        and n.type in ('daily_pick', 'use_soon', 'leftover', 'restock')
                        and (n.scheduled_for at time zone l.timezone)::date = l.at_local::date)
   group by l.member_id, l.household_id, l.timezone, l.region, l.preferred_language
$$;

-- The cron job's shared secret, compared inside the database so it never leaves Vault.
create or replace function public.notify_secret_ok(p_secret text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
begin
  if p_secret is null or length(p_secret) < 32 or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''notify_secret''' into v;
  return v is not null and v = p_secret;
end $$;

-- Export files older than p_days (SECURITY_REVIEW #10). SQL can't delete storage objects; notify removes them
-- through the storage API.
create or replace function public.stale_exports(p_days integer default 7) returns setof text
language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
   where o.bucket_id = 'exports' and o.created_at < now() - make_interval(days => greatest(p_days, 1))
   order by o.created_at limit 1000
$$;

revoke all on function public.notify_due(timestamptz), public.notify_secret_ok(text), public.stale_exports(integer)
  from public, anon, authenticated;
grant execute on function public.notify_due(timestamptz), public.notify_secret_ok(text), public.stale_exports(integer)
  to service_role;

-- --- schedule: pg_cron -> pg_net -> notify every 15 minutes --------------------------------------------------
-- Needs two Vault secrets: notify_secret (created here, random) and project_url (the project's https URL, set once:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
-- Until project_url exists the job does nothing.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or to_regclass('vault.secrets') is null then
    raise notice 'pg_cron, pg_net or Vault not available; skipping the notify schedule (local test database)';
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  if not exists (select 1 from vault.secrets where name = 'notify_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notify_secret',
                                'Shared secret pg_cron sends to the notify Edge Function');
  end if;

  execute $f$
    create or replace function private.invoke_notify() returns bigint
    language plpgsql security definer set search_path = '' as $b$
    declare
      v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
      v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret');
    begin
      if v_url is null or v_secret is null then
        return null;
      end if;
      return net.http_post(
        url := rtrim(v_url, '/') || '/functions/v1/notify',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000);
    end $b$;
  $f$;
  revoke all on function private.invoke_notify() from public;

  perform cron.schedule('notify', '*/15 * * * *', 'select private.invoke_notify()');
end $$;
