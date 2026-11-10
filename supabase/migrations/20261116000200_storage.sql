-- Storage buckets and policies (docs/architecture/06_storage_buckets.csv).
-- Private buckets put the household id first in the path, so access is one membership check.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',         'avatars',         false,  2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('recipe-media',    'recipe-media',    true,   1048576, array['image/webp', 'image/jpeg']),
  ('household-media', 'household-media', false,  3145728, array['image/*']),
  ('step-audio',      'step-audio',      true,   1048576, array['audio/mpeg']),
  ('checkpoints',     'checkpoints',     false,  3145728, array['image/jpeg', 'image/webp']),
  ('scans',           'scans',           false,  5242880, array['image/jpeg', 'image/webp']),
  ('exports',         'exports',         false, 52428800, array['application/zip'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Returns the household id encoded as the first path segment, or null if it is not a uuid.
create or replace function private.path_household(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end $$;

grant execute on function private.path_household(text) to authenticated, service_role;

-- Household-owned buckets: members read and write their household's folder.
create policy household_objects_select on storage.objects for select to authenticated
  using (
    bucket_id in ('avatars', 'household-media', 'checkpoints', 'scans')
    and private.is_household_member(private.path_household(name))
  );

create policy household_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('avatars', 'household-media', 'checkpoints', 'scans')
    and private.is_household_member(private.path_household(name))
  );

create policy household_objects_update on storage.objects for update to authenticated
  using (
    bucket_id in ('avatars', 'household-media', 'checkpoints', 'scans')
    and private.is_household_member(private.path_household(name))
  )
  with check (
    bucket_id in ('avatars', 'household-media', 'checkpoints', 'scans')
    and private.is_household_member(private.path_household(name))
  );

create policy household_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('avatars', 'household-media', 'checkpoints', 'scans')
    and private.is_household_member(private.path_household(name))
  );

-- Exports are written by the export-data function (service role) and only read by members.
create policy exports_select on storage.objects for select to authenticated
  using (bucket_id = 'exports' and private.is_household_member(private.path_household(name)));

-- recipe-media and step-audio are public buckets written only by the service role: no policies needed.
