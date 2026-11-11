-- Privacy (KIT-121 export, KIT-122 delete, KIT-123 retention). DPDP rights of access and erasure, and every
-- time-based retention rule in 02_database_tables.csv.

-- ---------------------------------------------------------------------------------------------------------------
-- Retention, complete. Same job and schedule as before (daily 03:00 IST); it now covers every table with a time
-- limit. Images (photo checkpoints, scans) go with their rows: no image features have shipped yet, and when they
-- do their files must be removed through the Storage API, not by deleting storage rows.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.retention_cleanup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n jsonb := '{}'::jsonb;
  c integer;
begin
  -- Memories: forgotten ones go after 30 days; temporary ones expire, and expired ones go after 30 days.
  delete from public.memories where status = 'forgotten' and updated_at < now() - interval '30 days';
  get diagnostics c = row_count; n := n || jsonb_build_object('memories_forgotten', c);
  update public.memories set status = 'expired' where status = 'active' and expires_at is not null and expires_at < now();
  get diagnostics c = row_count; n := n || jsonb_build_object('memories_expired', c);
  delete from public.memories where status = 'expired' and updated_at < now() - interval '30 days';
  get diagnostics c = row_count; n := n || jsonb_build_object('memories_expired_deleted', c);

  -- What was said: 30 days. Everything else about a session: 2 years.
  update public.session_events set utterance = null where utterance is not null and created_at < now() - interval '30 days';
  get diagnostics c = row_count; n := n || jsonb_build_object('utterances', c);
  delete from public.session_events where created_at < now() - interval '2 years';
  get diagnostics c = row_count; n := n || jsonb_build_object('session_events', c);
  delete from public.cooking_sessions where coalesce(completed_at, last_activity_at, started_at) < now() - interval '2 years';
  get diagnostics c = row_count; n := n || jsonb_build_object('cooking_sessions', c);
  delete from public.voice_sessions where coalesce(ended_at, started_at) < now() - interval '2 years';
  get diagnostics c = row_count; n := n || jsonb_build_object('voice_sessions', c);
  delete from public.photo_checkpoints where created_at < now() - interval '90 days';
  get diagnostics c = row_count; n := n || jsonb_build_object('photo_checkpoints', c);

  -- Kitchen.
  delete from public.inventory_items where status in ('finished', 'discarded') and updated_at < now() - interval '180 days';
  get diagnostics c = row_count; n := n || jsonb_build_object('inventory_items', c);
  delete from public.inventory_events where created_at < now() - interval '2 years';
  get diagnostics c = row_count; n := n || jsonb_build_object('inventory_events', c);
  delete from public.scans where created_at < now() - interval '1 year';
  get diagnostics c = row_count; n := n || jsonb_build_object('scans', c);
  update public.scans set image_path = null where image_path is not null and created_at < now() - interval '90 days';
  get diagnostics c = row_count; n := n || jsonb_build_object('scan_images', c);
  delete from public.shopping_list_items where status in ('bought', 'removed') and coalesce(bought_at, created_at) < now() - interval '1 year';
  get diagnostics c = row_count; n := n || jsonb_build_object('shopping_list_items', c);
  delete from public.shopping_lists where status = 'archived' and created_at < now() - interval '1 year';
  get diagnostics c = row_count; n := n || jsonb_build_object('shopping_lists', c);

  -- Suggestions and plans: 1 year.
  delete from public.recommendations where created_at < now() - interval '1 year';
  get diagnostics c = row_count; n := n || jsonb_build_object('recommendations', c);
  delete from public.meal_plans where created_at < now() - interval '1 year';
  get diagnostics c = row_count; n := n || jsonb_build_object('meal_plans', c);
  delete from public.nutrition_weekly where computed_at < now() - interval '1 year';
  get diagnostics c = row_count; n := n || jsonb_build_object('nutrition_weekly', c);
  delete from public.calendar_events where household_id is not null and coalesce(end_date, event_date) < current_date - 365;
  get diagnostics c = row_count; n := n || jsonb_build_object('calendar_events', c);

  -- Operational.
  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics c = row_count; n := n || jsonb_build_object('notifications', c);
  delete from public.devices where last_seen_at < now() - interval '90 days';
  get diagnostics c = row_count; n := n || jsonb_build_object('devices', c);
  delete from public.ai_requests where created_at < now() - interval '90 days';
  get diagnostics c = row_count; n := n || jsonb_build_object('ai_requests', c);
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Export (KIT-121): every row of the household the caller can see, one array per table. Invoker rights, so
-- row-level security decides; the AI request log and anything service-only is never included.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.export_household(p_household uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_out jsonb;
  v_rows jsonb;
  t record;
begin
  if not private.is_household_member(p_household) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  select jsonb_build_object('households', coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)) into v_out
    from public.households h where h.id = p_household;
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'household_id' and tb.table_type = 'BASE TABLE'
       and c.table_name not in ('ai_requests')
     order by c.table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.household_id = $1', t.table_name)
      into v_rows using p_household;
    if jsonb_array_length(v_rows) > 0 then
      v_out := v_out || jsonb_build_object(t.table_name, v_rows);
    end if;
  end loop;
  return v_out;
end $$;
revoke all on function public.export_household(uuid) from public, anon;
grant execute on function public.export_household(uuid) to authenticated;
comment on function public.export_household(uuid) is
  'DPDP access right: all rows of one household the caller can see, keyed by table. Invoker rights.';

-- ---------------------------------------------------------------------------------------------------------------
-- Delete account (KIT-122): households this user alone owns are deleted with everything in them; in households
-- someone else also owns, the user is unlinked from their member row (the family keeps cooking). The auth user is
-- then deleted by the delete-account function through the Auth admin API. Service role only.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.delete_account_data(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_deleted uuid[];
  v_left integer;
begin
  with mine as (
    select m.household_id
      from public.household_members m
     where m.user_id = p_user and m.status = 'active' and m.role = 'owner'
       and not exists (select 1 from public.household_members o
                        where o.household_id = m.household_id and o.user_id is not null and o.user_id <> p_user
                          and o.status = 'active' and o.role in ('owner', 'admin'))
  ), gone as (
    delete from public.households h using mine where h.id = mine.household_id returning h.id
  )
  select coalesce(array_agg(id), '{}') into v_deleted from gone;

  update public.household_members set user_id = null, status = 'removed', updated_at = now()
   where user_id = p_user;
  get diagnostics v_left = row_count;
  return jsonb_build_object('households_deleted', cardinality(v_deleted), 'memberships_left', v_left);
end $$;
revoke all on function private.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function private.delete_account_data(uuid) to service_role;

-- Exports bucket (06_storage_buckets.csv): private; written and signed only by export-data with the service role.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('exports', 'exports', false, 52428800, array['application/zip'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
