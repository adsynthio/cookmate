-- Sprint 14, G5 (docs/AI_RECIPES_PLAN.md): reporting an AI recipe, and an instant off switch for each AI recipe task.
--
-- Off switches are rows in feature_flags (readable by signed-in users): enabled = true means that task is OFF.
--   ai_off_all          every AI recipe task below
--   ai_off_invent       "Kuch naya banao" (new creation from odds and ends)
--   ai_off_named_dish   "Make <dish>" from this kitchen
--   ai_off_adapt        the model part of adapting a recipe (reviewed rules still work)
-- A missing row means on. To switch one off from the SQL editor:
--   update public.feature_flags set enabled = true where key = 'ai_off_invent';
--
-- Reporting: "Something's off with this recipe" on a recipe the household's AI wrote. The recipe is hidden for that
-- household at once (hidden_at) and the report waits for review. Rejected AI drafts are already kept, with their
-- problems, in ai_requests (status invalid_output), so no separate log is needed.

insert into public.feature_flags (key, enabled, rollout_pct, rules) values
  ('ai_off_all', false, 100, '{"means":"true switches every AI recipe task off"}'),
  ('ai_off_invent', false, 100, '{"means":"true switches new creations off"}'),
  ('ai_off_named_dish', false, 100, '{"means":"true switches Make <dish> off"}'),
  ('ai_off_adapt', false, 100, '{"means":"true switches the model part of adapting off"}')
on conflict (key) do nothing;

alter table public.recipes add column if not exists hidden_at timestamptz;
comment on column public.recipes.hidden_at is 'Set when the household reported its own AI recipe; hidden from that household.';

create table public.recipe_reports (
  id uuid default gen_random_uuid() not null,
  household_id uuid not null,
  recipe_id uuid not null,
  member_id uuid,
  reason text not null,
  note text,
  status text default 'open' not null,
  created_at timestamptz default now() not null,
  reviewed_at timestamptz,
  constraint recipe_reports_pkey primary key (id),
  constraint recipe_reports_household_fkey foreign key (household_id) references public.households (id) on delete cascade,
  constraint recipe_reports_recipe_fkey foreign key (recipe_id) references public.recipes (id) on delete cascade,
  constraint recipe_reports_member_fkey foreign key (member_id) references public.household_members (id) on delete set null,
  constraint recipe_reports_reason_check check (reason in ('unsafe', 'wrong', 'didnt_work', 'other')),
  constraint recipe_reports_note_check check (note is null or char_length(note) <= 500),
  constraint recipe_reports_status_check check (status in ('open', 'reviewed'))
);
comment on table public.recipe_reports is 'Reports on AI-written recipes, for review. Retention: 1 year, or until household deletion.';
create index recipe_reports_household_idx on public.recipe_reports (household_id);
create index recipe_reports_recipe_idx on public.recipe_reports (recipe_id);
create index recipe_reports_member_idx on public.recipe_reports (member_id);
create index recipe_reports_open_idx on public.recipe_reports (created_at) where status = 'open';

alter table public.recipe_reports enable row level security;
create policy recipe_reports_member_select on public.recipe_reports for select to authenticated
  using (private.is_household_member(household_id));
-- No direct writes: reports go through report_recipe().
revoke all on public.recipe_reports from anon;
grant select on public.recipe_reports to authenticated;
grant all on public.recipe_reports to service_role;

-- Report one of this household's own AI recipes and hide it for the household. Returns the report id.
create or replace function public.report_recipe(p_household_id uuid, p_recipe_id uuid, p_reason text, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
  v_id uuid;
begin
  if auth.uid() is null or not private.is_household_member(p_household_id) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id and r.household_id = p_household_id and r.source in ('generated', 'adapted', 'family_capture')
  ) then
    raise exception 'only this household''s own AI recipes can be reported' using errcode = '22023';
  end if;
  select m.id into v_member from public.household_members m
    where m.household_id = p_household_id and m.user_id = auth.uid() and m.status = 'active' limit 1;
  insert into public.recipe_reports (household_id, recipe_id, member_id, reason, note)
    values (p_household_id, p_recipe_id, v_member, p_reason, nullif(left(trim(coalesce(p_note, '')), 500), ''))
    returning id into v_id;
  update public.recipes set hidden_at = now() where id = p_recipe_id and hidden_at is null;
  return v_id;
end $$;
revoke all on function public.report_recipe(uuid, uuid, text, text) from public, anon;
grant execute on function public.report_recipe(uuid, uuid, text, text) to authenticated, service_role;
