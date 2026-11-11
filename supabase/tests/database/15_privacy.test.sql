-- Privacy (KIT-121, KIT-122, KIT-123): export sees only your household; deleting an account removes households you
-- alone own and unlinks you elsewhere; retention removes what is past its time.
begin;
select plan(14);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

update public.feature_flags set enabled = true, rollout_pct = 100 where key = 'show_draft_recipes';
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a1', true), ('00000000-0000-0000-0000-0000000000a2', true), ('00000000-0000-0000-0000-0000000000a3', true);

-- Asha owns a household alone; Bina owns another; Asha is also a member of Bina's.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.asha', public.create_household('Asha', 'en-IN', '[{"display_name":"Asha","is_self":true}]'::jsonb) ->> 'household_id', true);
select public.add_inventory_items(current_setting('t.asha')::uuid, '[{"name":"aloo","quantity":2,"unit":"kg"}]'::jsonb);
select public.save_memory(current_setting('t.asha')::uuid, 'Extra garlic', null);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('t.bina', public.create_household('Bina', 'en-IN', '[{"display_name":"Bina","is_self":true}]'::jsonb) ->> 'household_id', true);
reset role;
insert into public.household_members (household_id, user_id, display_name, role)
values (current_setting('t.bina')::uuid, '00000000-0000-0000-0000-0000000000a1', 'Asha', 'member');

-- Export: everything of Asha's household, nothing of Bina's, no AI log.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.x', public.export_household(current_setting('t.asha')::uuid)::text, true);
select is(current_setting('t.x')::jsonb #>> '{households,0,name}', 'Asha', 'the export has the household');
select is(jsonb_array_length(current_setting('t.x')::jsonb -> 'inventory_items'), 1, 'and its pantry');
select is(current_setting('t.x')::jsonb #>> '{memories,0,statement}', 'Extra garlic', 'and its memories');
select ok(not (current_setting('t.x')::jsonb ? 'ai_requests'), 'but never the AI request log');
select ok((select bool_and(m ->> 'household_id' = current_setting('t.asha')) from jsonb_array_elements(current_setting('t.x')::jsonb -> 'household_members') m),
  'only rows of this household');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.export_household(%L)', current_setting('t.asha')), '42501', null, 'nobody else can export it');
reset role;

-- Delete Asha's account data: her own household goes, Bina's stays with Asha unlinked.
select ok(not has_function_privilege('authenticated', 'private.delete_account_data(uuid)', 'execute'), 'only the service role can delete accounts');
select is(private.delete_account_data('00000000-0000-0000-0000-0000000000a1') -> 'households_deleted', '1'::jsonb, 'one household deleted');
select is((select count(*)::int from public.households where id = current_setting('t.asha')::uuid), 0, 'Asha''s household is gone');
select is((select count(*)::int from public.inventory_items where household_id = current_setting('t.asha')::uuid), 0, 'with its pantry');
select is((select count(*)::int from public.households where id = current_setting('t.bina')::uuid), 1, 'Bina''s household stays');
select is((select count(*)::int from public.household_members where user_id = '00000000-0000-0000-0000-0000000000a1'), 0, 'Asha is unlinked everywhere');

-- Retention: expired temporary memories, old AI logs and old suggestions go.
insert into public.memories (household_id, statement, category, source, scope, expires_at)
values (current_setting('t.bina')::uuid, 'No onion this week', 'taste', 'explicit', 'temporary', now() - interval '1 day');
insert into public.ai_requests (household_id, task, model, prompt_version, status, created_at)
values (current_setting('t.bina')::uuid, 'pick_reasons', 'm', 'v1', 'ok', now() - interval '91 days'),
       (current_setting('t.bina')::uuid, 'pick_reasons', 'm', 'v1', 'ok', now() - interval '1 day');
select set_config('t.r', private.retention_cleanup()::text, true);
select is((select status from public.memories where statement = 'No onion this week'), 'expired', 'temporary memories past their date expire');
select is((select count(*)::int from public.ai_requests where household_id = current_setting('t.bina')::uuid), 1, 'AI request logs older than 90 days are deleted');

select * from finish();
rollback;
