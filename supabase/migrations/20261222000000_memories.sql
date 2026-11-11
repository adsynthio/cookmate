-- Memory model and rules (KIT-101, LRN-01..05) and learning from feedback (KIT-100).
-- A memory is one thing Cookmate has learned, with who it is about, where it came from and how sure it is.
--   * Saying the same thing again strengthens the memory instead of adding a copy.
--   * Something the user says outright (explicit, correction) replaces an older memory about the same subject.
--     Something merely observed never replaces what the user said.
--   * Temporary memories expire, and never change taste profiles or ingredient preferences.
--   * Forgetting removes what was derived from the memory; the row is hard-deleted by the retention job.
-- All functions run with the caller's rights, so row-level security decides which household they may touch.

create or replace function private.memory_about(p_attributes jsonb) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(p_attributes ->> 'about'), '')
$$;
grant execute on function private.memory_about(jsonb) to authenticated, service_role;

create or replace function public.save_memory(
  p_household uuid,
  p_statement text,
  p_member uuid default null,
  p_category text default 'other',
  p_scope text default 'permanent',
  p_source text default 'explicit',
  p_polarity integer default 0,
  p_attributes jsonb default '{}'::jsonb,
  p_subject_ingredient uuid default null,
  p_subject_recipe uuid default null,
  p_provenance jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_statement text := left(btrim(coalesce(p_statement, '')), 200);
  v_attributes jsonb := coalesce(p_attributes, '{}'::jsonb);
  v_about text := private.memory_about(coalesce(p_attributes, '{}'::jsonb));
  v_said boolean := p_source in ('explicit', 'correction', 'onboarding');
  v_same uuid;
  v_conflict record;
  v_id uuid := gen_random_uuid();
  v_replaced uuid[] := '{}';
begin
  if not private.is_household_member(p_household) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  if v_statement = '' then
    raise exception 'a memory needs a statement' using errcode = '22023';
  end if;
  if p_member is not null and not exists (select 1 from public.household_members m where m.id = p_member and m.household_id = p_household) then
    raise exception 'member not found in this household' using errcode = 'P0002';
  end if;

  -- The same thing, said again.
  select id into v_same from public.memories
   where household_id = p_household and status = 'active' and member_id is not distinct from p_member
     and lower(statement) = lower(v_statement)
   limit 1;
  if v_same is not null then
    update public.memories
       set evidence_count = evidence_count + 1, confidence = least(1, confidence + 0.1), last_confirmed_at = now()
     where id = v_same;
    return v_same;
  end if;

  -- Older memories about the same subject for the same person.
  for v_conflict in
    select id, source from public.memories
     where household_id = p_household and status = 'active' and member_id is not distinct from p_member
       and (
         (p_subject_ingredient is not null and subject_ingredient_id = p_subject_ingredient)
         or (v_about is not null and private.memory_about(attributes) = v_about
             and subject_recipe_id is not distinct from p_subject_recipe and subject_ingredient_id is null and p_subject_ingredient is null)
       )
  loop
    if not v_said and v_conflict.source in ('explicit', 'correction', 'onboarding') then
      -- An observation never overrides what the user told us.
      return v_conflict.id;
    end if;
    v_replaced := v_replaced || v_conflict.id;
  end loop;

  insert into public.memories (id, household_id, member_id, statement, category, scope, polarity, subject_ingredient_id,
                               subject_recipe_id, attributes, confidence, source, provenance, expires_at, last_confirmed_at)
  values (v_id, p_household, p_member, v_statement, p_category, p_scope, greatest(-1, least(1, coalesce(p_polarity, 0))),
          p_subject_ingredient, p_subject_recipe, v_attributes, case when v_said then 0.9 else 0.6 end, p_source,
          coalesce(p_provenance, '{}'::jsonb),
          case when p_scope = 'temporary' then coalesce(p_expires_at, now() + interval '7 days') end,
          case when v_said then now() end);
  update public.memories set status = 'superseded', superseded_by = v_id where id = any (v_replaced);

  -- A lasting like or dislike of an ingredient is also an ingredient preference (KIT-105). Temporary ones are not.
  if p_scope = 'permanent' and p_member is not null and p_subject_ingredient is not null and coalesce(p_polarity, 0) <> 0 then
    insert into public.ingredient_preferences (household_id, member_id, ingredient_id, preference, confidence, source)
    values (p_household, p_member, p_subject_ingredient, sign(p_polarity) * 2, case when v_said then 0.9 else 0.6 end, p_source)
    on conflict (member_id, ingredient_id)
    do update set preference = excluded.preference, confidence = excluded.confidence, source = excluded.source, updated_at = now();
  end if;
  return v_id;
end $$;

-- What a memory left behind elsewhere, removed when it is forgotten or rewritten.
create or replace function private.clear_memory_derivatives(p_memory uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_m public.memories%rowtype;
begin
  select * into v_m from public.memories where id = p_memory;
  if v_m.member_id is null or v_m.subject_ingredient_id is null then
    return;
  end if;
  if not exists (select 1 from public.memories o
                  where o.id <> p_memory and o.status = 'active' and o.scope = 'permanent'
                    and o.member_id = v_m.member_id and o.subject_ingredient_id = v_m.subject_ingredient_id) then
    delete from public.ingredient_preferences where member_id = v_m.member_id and ingredient_id = v_m.subject_ingredient_id;
  end if;
end $$;
grant execute on function private.clear_memory_derivatives(uuid) to authenticated, service_role;

create or replace function public.forget_memory(p_memory uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.memories where id = p_memory) then
    raise exception 'memory not found' using errcode = 'P0002';
  end if;
  perform private.clear_memory_derivatives(p_memory);
  update public.memories set status = 'forgotten', attributes = '{}'::jsonb, provenance = '{}'::jsonb where id = p_memory;
end $$;

create or replace function public.keep_memory(p_memory uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.memories
     set last_confirmed_at = now(), confidence = least(1, confidence + 0.2), evidence_count = evidence_count + 1
   where id = p_memory and status = 'active';
  if not found then
    raise exception 'memory not found' using errcode = 'P0002';
  end if;
end $$;

-- Edit: the user's own words replace ours. What we had worked out from the old wording no longer applies.
create or replace function public.update_memory(p_memory uuid, p_statement text) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_statement text := left(btrim(coalesce(p_statement, '')), 200);
begin
  if v_statement = '' then
    raise exception 'a memory needs a statement' using errcode = '22023';
  end if;
  if not exists (select 1 from public.memories where id = p_memory and status = 'active') then
    raise exception 'memory not found' using errcode = 'P0002';
  end if;
  perform private.clear_memory_derivatives(p_memory);
  update public.memories
     set statement = v_statement, source = 'correction', confidence = 0.9, last_confirmed_at = now(),
         polarity = 0, attributes = '{}'::jsonb, subject_ingredient_id = null
   where id = p_memory;
end $$;

-- submit_feedback, now learning (KIT-100): the first feedback a member gives for a session nudges their taste dials
-- by one step. Changing the feedback later replaces it without nudging again.
create or replace function public.submit_feedback(
  p_session uuid,
  p_rating text,
  p_tags text[] default '{}',
  p_comment text default null,
  p_make_again boolean default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_s public.cooking_sessions%rowtype;
  v_member uuid;
  v_id uuid;
  v_first boolean;
  v_tags text[] := coalesce(p_tags, '{}');
begin
  select * into v_s from public.cooking_sessions where id = p_session;
  if v_s.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  v_member := private.current_member(v_s.household_id);
  if v_member is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  v_first := not exists (select 1 from public.meal_feedback where session_id = p_session and member_id = v_member);
  delete from public.meal_feedback where session_id = p_session and member_id = v_member;
  insert into public.meal_feedback (household_id, session_id, member_id, rating, tags, comment, make_again)
  values (v_s.household_id, p_session, v_member, p_rating, v_tags, nullif(btrim(p_comment), ''), p_make_again)
  returning id into v_id;

  if v_first then
    update public.taste_profiles
       set spice = greatest(1, least(5, spice
                     + case when 'not_spicy_enough' = any (v_tags) then 1 else 0 end
                     - case when 'too_spicy' = any (v_tags) then 1 else 0 end)),
           richness = greatest(1, richness - case when 'too_oily' = any (v_tags) then 1 else 0 end)
     where member_id = v_member and v_tags && array['too_spicy', 'not_spicy_enough', 'too_oily'];
  end if;
  return v_id;
end $$;

revoke all on function public.save_memory(uuid, text, uuid, text, text, text, integer, jsonb, uuid, uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.forget_memory(uuid) from public, anon;
revoke all on function public.keep_memory(uuid) from public, anon;
revoke all on function public.update_memory(uuid, text) from public, anon;
grant execute on function public.save_memory(uuid, text, uuid, text, text, text, integer, jsonb, uuid, uuid, jsonb, timestamptz),
  public.forget_memory(uuid), public.keep_memory(uuid), public.update_memory(uuid, text) to authenticated;
