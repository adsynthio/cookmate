-- Guard rails: every table has RLS, anon can read nothing, service-only tables are closed.
begin;
select plan(6);

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

select is(
  (select count(*)::int
     from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (select 1 from pg_index i
                       where i.indrelid = c.conrelid
                         and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey)),
  0,
  'every foreign key has a covering index'
);

select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')),
  array['community_create_circle', 'community_create_invite', 'community_feed', 'community_join', 'community_leave',
        'community_remove_post', 'community_report', 'community_share', 'create_household', 'get_notification_settings',
        'notification_opened', 'pantry_check_today', 'record_voice_session', 'set_notification_settings'],
  'the only SECURITY DEFINER functions signed-in users can call are the reviewed ones (SECURITY_REVIEW.md)'
);

select * from finish();
rollback;
