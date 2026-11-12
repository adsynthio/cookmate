-- "Download my data" also includes what Cookmate keeps outside the public tables (SECURITY_REVIEW #15): each
-- member's notification settings and the daily pantry questions. export_household runs with the caller's rights and
-- can't read the private schema, so a small definer function hands over exactly these rows, for members only.

create or replace function private.export_private(p_household uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.is_household_member(p_household) then
    jsonb_strip_nulls(jsonb_build_object(
      'notification_settings', (select jsonb_agg(to_jsonb(s)) from private.notification_settings s where s.household_id = p_household),
      'pantry_checks', (select jsonb_agg(to_jsonb(c) order by c.local_date) from private.pantry_checks c where c.household_id = p_household)))
  else '{}'::jsonb end
$$;
revoke all on function private.export_private(uuid) from public, anon;
grant execute on function private.export_private(uuid) to authenticated, service_role;

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
  return v_out || private.export_private(p_household);
end $$;
revoke all on function public.export_household(uuid) from public, anon;
grant execute on function public.export_household(uuid) to authenticated;
comment on function public.export_household(uuid) is
  'DPDP access right: all rows of one household the caller can see, keyed by table, plus its notification settings and pantry questions. Invoker rights.';
