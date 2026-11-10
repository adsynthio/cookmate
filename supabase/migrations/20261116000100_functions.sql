-- Hand-written functions for the Cookmate Kitchen Brain (see docs/architecture/10_functions_and_jobs.csv).
-- Phase 0 covers identity and household setup plus the scheduled maintenance jobs.
-- Pantry, cooking, memory and shopping RPCs arrive with their sprints.

-- ---------------------------------------------------------------------------
-- handle_new_user: one profiles row per auth user, including anonymous users.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, is_anonymous, preferred_language)
  values (
    new.id,
    new.phone,
    coalesce(new.is_anonymous, new.phone is null),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'hi-IN')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep profiles.phone / is_anonymous in step when an anonymous user verifies a phone (ONB-01).
create or replace function private.handle_user_updated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is distinct from old.phone or new.is_anonymous is distinct from old.is_anonymous then
    update public.profiles
       set phone = new.phone,
           is_anonymous = coalesce(new.is_anonymous, new.phone is null)
     where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function private.handle_user_updated();

-- ---------------------------------------------------------------------------
-- create_household (ONB-03): household, members, voice + taste profiles,
-- default storage locations and the main shopping list in one transaction.
--
-- p_members: [{display_name, age_group?, diet?, spice?, is_self?}]
-- The member with is_self = true (or the first one) becomes the caller's
-- owner membership; the rest are dependents (people without the app).
-- ---------------------------------------------------------------------------
create or replace function public.create_household(
  p_name text,
  p_language text,
  p_members jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
  v_owner_member uuid;
  v_member uuid;
  v_member_json jsonb;
  v_self_index int;
  v_index int := 0;
  v_language text := coalesce(nullif(p_language, ''), 'hi-IN');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0 then
    raise exception 'at least one member is required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_members) > 6 then
    raise exception 'V1 supports up to 6 members' using errcode = '22023';
  end if;

  select coalesce(min(ord) - 1, 0) into v_self_index
    from jsonb_array_elements(p_members) with ordinality as e(m, ord)
   where (m ->> 'is_self')::boolean is true;

  insert into public.households (name, created_by)
  values (coalesce(nullif(p_name, ''), 'My kitchen'), v_uid)
  returning id into v_household;

  for v_member_json in select value from jsonb_array_elements(p_members) loop
    insert into public.household_members (household_id, user_id, display_name, role, age_group, diet)
    values (
      v_household,
      case when v_index = v_self_index then v_uid end,
      coalesce(nullif(v_member_json ->> 'display_name', ''), 'Member ' || (v_index + 1)),
      case when v_index = v_self_index then 'owner' else 'dependent' end,
      coalesce(v_member_json ->> 'age_group', 'adult'),
      v_member_json ->> 'diet'
    )
    returning id into v_member;

    if v_index = v_self_index then
      v_owner_member := v_member;
    end if;

    insert into public.voice_profiles (member_id, household_id, language_code)
    values (v_member, v_household, v_language);

    insert into public.taste_profiles (member_id, household_id, spice)
    values (
      v_member,
      v_household,
      least(5, greatest(1, coalesce((v_member_json ->> 'spice')::smallint, 3)))
    );

    v_index := v_index + 1;
  end loop;

  insert into public.storage_locations (household_id, name, kind, sort_order)
  values
    (v_household, 'Fridge', 'fridge', 1),
    (v_household, 'Pantry', 'pantry', 2),
    (v_household, 'Freezer', 'freezer', 3),
    (v_household, 'Staples', 'staples', 4),
    (v_household, 'Ready-made', 'ready_made', 5);

  insert into public.shopping_lists (household_id) values (v_household);

  update public.profiles
     set last_active_household_id = v_household,
         preferred_language = v_language
   where id = v_uid;

  return jsonb_build_object('household_id', v_household, 'member_id', v_owner_member);
end $$;

revoke all on function public.create_household(text, text, jsonb) from public, anon;
grant execute on function public.create_household(text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (wired up in the cron migration).
-- ---------------------------------------------------------------------------

-- Daily: confidence decays by storage kind; expired items drop to <= 0.3 (PLAN.md §5.1).
create or replace function private.decay_inventory_confidence() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with params as (
    select i.id,
           i.household_id,
           i.confidence as old_conf,
           case coalesce(l.kind, 'pantry')
             when 'fridge' then 5
             when 'counter' then 4
             when 'ready_made' then 3
             when 'freezer' then 60
             when 'staples' then 45
             else 30
           end as half_life_days,
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

-- Hourly: sessions idle for more than 24 h become abandoned (COOK-11 resume window).
create or replace function private.abandon_stale_sessions() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update public.cooking_sessions
     set status = 'abandoned'
   where status in ('active', 'paused')
     and last_activity_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Daily: retention rules from 02_database_tables.csv / NFR-11.
create or replace function private.retention_cleanup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_memories integer;
  v_utterances integer;
  v_items integer;
  v_notifications integer;
  v_devices integer;
begin
  delete from public.memories
   where status = 'forgotten' and updated_at < now() - interval '30 days';
  get diagnostics v_memories = row_count;

  update public.session_events
     set utterance = null
   where utterance is not null and created_at < now() - interval '30 days';
  get diagnostics v_utterances = row_count;

  delete from public.inventory_items
   where status in ('finished', 'discarded') and updated_at < now() - interval '180 days';
  get diagnostics v_items = row_count;

  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics v_notifications = row_count;

  delete from public.devices where last_seen_at < now() - interval '90 days';
  get diagnostics v_devices = row_count;

  return jsonb_build_object(
    'memories', v_memories,
    'utterances', v_utterances,
    'inventory_items', v_items,
    'notifications', v_notifications,
    'devices', v_devices
  );
end $$;

revoke all on function private.decay_inventory_confidence() from public;
revoke all on function private.abandon_stale_sessions() from public;
revoke all on function private.retention_cleanup() from public;
revoke all on function private.handle_new_user() from public;
revoke all on function private.handle_user_updated() from public;
