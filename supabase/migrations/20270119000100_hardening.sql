-- Security review fixes (KIT-124, docs/SECURITY_REVIEW.md).
-- 1. rls_auto_enable is created by the Supabase dashboard ("enable RLS on new tables") as a SECURITY DEFINER
--    event-trigger function in public, which the API exposes as an RPC. Event triggers don't need EXECUTE, so
--    revoking it from API roles keeps the trigger working and closes the endpoint.
-- 2. Every foreign key in public gets a covering index (Supabase performance advisor 0001). Deleting a household
--    or an account cascades through these; without indexes each cascade scans whole tables.

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, array_agg(a.attname order by k.ord) as cols
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f' and n.nspname = 'public'
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid
            and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
       )
     group by c.conname, c.conrelid
  loop
    execute format('create index if not exists %I on %s (%s)',
      left(r.conname || '_idx', 63), r.tbl,
      (select string_agg(format('%I', col), ', ') from unnest(r.cols) col));
  end loop;
end $$;
