-- Guard rails: every table has RLS, anon can read nothing, service-only tables are closed.
begin;
select plan(4);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every public table has row-level security enabled'
);

select is(
  (select array_agg(t.tablename::text order by t.tablename)
     from pg_tables t
    where t.schemaname = 'public'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)),
  array['ai_requests'],
  'only ai_requests (service_role only) has no policies'
);

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and has_table_privilege('anon', c.oid, 'select')),
  0,
  'anon role cannot select from any public table'
);

select ok(
  not has_table_privilege('authenticated', 'public.ai_requests', 'select'),
  'authenticated cannot read ai_requests'
);

select * from finish();
rollback;
