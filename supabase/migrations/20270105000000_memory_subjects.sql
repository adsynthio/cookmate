-- Memory subjects, refined (KIT-104, KIT-105). A memory's subject is now the ingredient, the aspect ("about") and
-- the dish together, so a note about how much garlic one dish gets no longer replaces a like or dislike of garlic,
-- or the same note about another dish. Only a plain like or dislike of an ingredient becomes an ingredient
-- preference: "less salt" must never read as "avoids salt". Invoker rights, as before.

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

  -- Older memories about the same subject for the same person: the same ingredient (or none), the same aspect
  -- ("about") and the same dish (or none). "More garlic in dal" and "more garlic in rajma" are different subjects;
  -- "avoids garlic" and "loves garlic" are the same one.
  for v_conflict in
    select id, source from public.memories
     where household_id = p_household and status = 'active' and member_id is not distinct from p_member
       and (p_subject_ingredient is not null or v_about is not null)
       and subject_ingredient_id is not distinct from p_subject_ingredient
       and subject_recipe_id is not distinct from p_subject_recipe
       and private.memory_about(attributes) is not distinct from v_about
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

  -- A lasting like or dislike of an ingredient is also an ingredient preference (KIT-105). Temporary ones are not,
  -- and neither is a note about how much of it to use (about = 'amount') or about one dish.
  if p_scope = 'permanent' and p_member is not null and p_subject_ingredient is not null and p_subject_recipe is null
     and coalesce(p_polarity, 0) <> 0 and coalesce(v_about, 'preference') = 'preference' then
    insert into public.ingredient_preferences (household_id, member_id, ingredient_id, preference, confidence, source)
    values (p_household, p_member, p_subject_ingredient, sign(p_polarity) * 2, case when v_said then 0.9 else 0.6 end, p_source)
    on conflict (member_id, ingredient_id)
    do update set preference = excluded.preference, confidence = excluded.confidence, source = excluded.source, updated_at = now();
  end if;
  return v_id;
end $$;

-- clear_memory_derivatives only concerns plain likes and dislikes; other memories about the ingredient don't keep
-- a preference alive.
create or replace function private.clear_memory_derivatives(p_memory uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_m public.memories%rowtype;
begin
  select * into v_m from public.memories where id = p_memory;
  if v_m.member_id is null or v_m.subject_ingredient_id is null or v_m.subject_recipe_id is not null
     or coalesce(private.memory_about(v_m.attributes), 'preference') <> 'preference' then
    return;
  end if;
  if not exists (select 1 from public.memories o
                  where o.id <> p_memory and o.status = 'active' and o.scope = 'permanent' and o.polarity <> 0
                    and o.subject_recipe_id is null and coalesce(private.memory_about(o.attributes), 'preference') = 'preference'
                    and o.member_id = v_m.member_id and o.subject_ingredient_id = v_m.subject_ingredient_id) then
    delete from public.ingredient_preferences where member_id = v_m.member_id and ingredient_id = v_m.subject_ingredient_id;
  end if;
end $$;
