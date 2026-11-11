-- Sprint 4: Cook With Me sessions (KIT-070), automatic deduction after cooking (KIT-037) and the finish sheet's
-- feedback (KIT-077). All functions run as the caller, so RLS keeps every household's data to itself.

-- Quantity in grams (or ml) for g/kg/ml/l, else via the ingredient's measures (grams per katori, piece, cup...).
create or replace function private.to_grams(p_qty numeric, p_unit text, p_measures jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when p_qty is null then null
    when p_unit in ('g', 'ml') then p_qty
    when p_unit in ('kg', 'l') then p_qty * 1000
    when p_measures ? p_unit then p_qty * (p_measures ->> p_unit)::numeric
    else null
  end
$$;

create or replace function private.from_grams(p_grams numeric, p_unit text, p_measures jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when p_grams is null then null
    when p_unit in ('g', 'ml') then p_grams
    when p_unit in ('kg', 'l') then p_grams / 1000
    when p_measures ? p_unit and (p_measures ->> p_unit)::numeric > 0 then p_grams / (p_measures ->> p_unit)::numeric
    else null
  end
$$;

-- Same unit needs no measures; otherwise go through grams. Null when the units can't be compared.
create or replace function private.convert_qty(p_qty numeric, p_from text, p_to text, p_measures jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when p_qty is null then null
    when p_from is not distinct from p_to then p_qty
    else round(private.from_grams(private.to_grams(p_qty, p_from, coalesce(p_measures, '{}')), p_to, coalesce(p_measures, '{}')), 3)
  end
$$;
grant execute on function private.to_grams(numeric, text, jsonb), private.from_grams(numeric, text, jsonb),
  private.convert_qty(numeric, text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- start_cooking_session: one active session per cook; an adapted variant records its base recipe too.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.start_cooking_session(
  p_household uuid,
  p_recipe uuid,
  p_servings integer default null,
  p_who_eating uuid[] default '{}',
  p_mode text default 'touch',
  p_recommendation uuid default null,
  p_language text default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_member uuid := private.current_member(p_household);
  v_recipe public.recipes%rowtype;
  v_id uuid;
begin
  if v_member is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  select * into v_recipe from public.recipes where id = p_recipe;
  if v_recipe.id is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.recipe_steps where recipe_id = p_recipe) then
    raise exception 'recipe has no steps' using errcode = '22023';
  end if;

  -- Leaving one dish for another: the earlier one is abandoned, not left dangling.
  update public.cooking_sessions set status = 'abandoned', last_activity_at = now()
   where household_id = p_household and member_id = v_member and status in ('active', 'paused');

  insert into public.cooking_sessions (household_id, member_id, recipe_id, adapted_recipe_id, recommendation_id,
    servings, who_eating, mode, language_code, current_step)
  values (p_household, v_member, coalesce(v_recipe.parent_recipe_id, v_recipe.id),
    case when v_recipe.parent_recipe_id is not null then v_recipe.id end, p_recommendation,
    greatest(1, least(coalesce(p_servings, v_recipe.base_servings), 50)), coalesce(p_who_eating, '{}'),
    coalesce(p_mode, 'touch'), coalesce(p_language, 'en-IN'), 1)
  returning id into v_id;

  if p_recommendation is not null then
    update public.recommendations set status = 'accepted', acted_at = coalesce(acted_at, now())
     where id = p_recommendation and household_id = p_household and status = 'shown';
  end if;
  return v_id;
end $$;

-- The recipe actually being cooked (the adapted variant when there is one).
create or replace function private.session_recipe(p_session uuid) returns uuid
language sql stable set search_path = '' as $$
  select coalesce(adapted_recipe_id, recipe_id) from public.cooking_sessions where id = p_session
$$;
grant execute on function private.session_recipe(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- advance_session_step: next (+1), back (-1) or repeat (0); clamped to the recipe; every move is logged.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.advance_session_step(p_session uuid, p_delta integer default 1, p_channel text default 'touch')
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_s public.cooking_sessions%rowtype;
  v_total integer;
  v_step integer;
begin
  select * into v_s from public.cooking_sessions where id = p_session for update;
  if v_s.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_s.status not in ('active', 'paused') then
    raise exception 'session is %', v_s.status using errcode = '22023';
  end if;
  select count(*) into v_total from public.recipe_steps where recipe_id = private.session_recipe(p_session);
  v_step := greatest(1, least(v_total, v_s.current_step + coalesce(p_delta, 0)));

  update public.cooking_sessions set current_step = v_step, status = 'active', last_activity_at = now() where id = p_session;
  insert into public.session_events (household_id, session_id, event_type, step_no, channel)
  values (v_s.household_id, p_session,
    case when p_delta > 0 then 'step_next' when p_delta < 0 then 'step_back' else 'repeat' end,
    v_step, case when p_channel = 'voice' then 'voice' else 'touch' end);
  return jsonb_build_object('current_step', v_step, 'total', v_total);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- complete_cooking_session: mark it done and preview what to take out of the pantry, scaled by servings and in
-- each item's own unit. Staples (Full/Low/Out) show with no quantity: the cook says if they ran low.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.complete_cooking_session(p_session uuid)
returns table (item_id uuid, ingredient text, quantity numeric, unit text, current_quantity numeric, staple boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_s public.cooking_sessions%rowtype;
  v_base integer;
begin
  select * into v_s from public.cooking_sessions where id = p_session for update;
  if v_s.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_s.status in ('active', 'paused') then
    update public.cooking_sessions set status = 'completed', completed_at = now(), last_activity_at = now() where id = p_session;
    if v_s.recommendation_id is not null then
      update public.recommendations set status = 'cooked', acted_at = now() where id = v_s.recommendation_id;
    end if;
  end if;
  select base_servings into v_base from public.recipes where id = private.session_recipe(p_session);

  return query
  with needed as (
    select ri.ingredient_id, sum(ri.quantity * v_s.servings / greatest(v_base, 1)) as qty, min(ri.unit) as unit
      from public.recipe_ingredients ri
     where ri.recipe_id = private.session_recipe(p_session) and ri.ingredient_id is not null and not ri.is_optional
     group by ri.ingredient_id
  ),
  -- The item that spoils first is used first.
  picked as (
    select distinct on (n.ingredient_id) n.ingredient_id, n.qty, n.unit, i.id as item_id, i.quantity as item_qty,
           i.unit as item_unit, i.staple_level, g.canonical_name, g.grams_per_measure
      from needed n
      join public.inventory_items i on i.ingredient_id = n.ingredient_id and i.household_id = v_s.household_id and i.status = 'active'
      join public.ingredients g on g.id = n.ingredient_id
     order by n.ingredient_id, i.expiry_date nulls last, i.created_at
  )
  select p.item_id, p.canonical_name,
         case when p.staple_level is not null or p.item_qty is null then null
              else least(p.item_qty, private.convert_qty(p.qty, p.unit, coalesce(p.item_unit, p.unit), p.grams_per_measure)) end,
         coalesce(p.item_unit, p.unit), p.item_qty, p.staple_level is not null
    from picked p
   order by p.canonical_name;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- apply_session_deduction: commit the reviewed preview. p_adjustments: [{item_id, quantity?, skip?, staple_level?}]
-- overrides lines; null applies the preview as is. Once per session.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.apply_session_deduction(p_session uuid, p_adjustments jsonb default null)
returns uuid[]
language plpgsql security invoker set search_path = '' as $$
declare
  v_s public.cooking_sessions%rowtype;
  v_member uuid;
  v_line record;
  v_adj jsonb;
  v_used numeric;
  v_left numeric;
  v_ids uuid[] := '{}';
begin
  select * into v_s from public.cooking_sessions where id = p_session;
  if v_s.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_s.status <> 'completed' then
    raise exception 'finish cooking first' using errcode = '22023';
  end if;
  if exists (select 1 from public.inventory_events where session_id = p_session and event_type in ('consumed', 'finished')) then
    raise exception 'already deducted for this session' using errcode = '23505';
  end if;
  v_member := private.current_member(v_s.household_id);

  for v_line in select * from public.complete_cooking_session(p_session) loop
    v_adj := (select a from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) a
               where a ->> 'item_id' = v_line.item_id::text limit 1);
    if coalesce((v_adj ->> 'skip')::boolean, false) then
      continue;
    end if;

    if v_line.staple then
      -- Staples only change level when the cook says so ("haldi is low now").
      if v_adj ? 'staple_level' and v_adj ->> 'staple_level' in ('full', 'low', 'out') then
        update public.inventory_items set staple_level = v_adj ->> 'staple_level', confidence = 0.95, last_confirmed_at = now()
         where id = v_line.item_id;
        insert into public.inventory_events (household_id, item_id, event_type, reason, session_id, actor_member_id, actor_kind)
        values (v_s.household_id, v_line.item_id, 'consumed', 'level after cooking: ' || (v_adj ->> 'staple_level'), p_session, v_member, 'user');
        v_ids := v_ids || v_line.item_id;
      end if;
      continue;
    end if;

    v_used := coalesce((v_adj ->> 'quantity')::numeric, v_line.quantity);
    if v_used is null or v_used <= 0 or v_line.current_quantity is null then
      continue;
    end if;
    v_left := greatest(0, v_line.current_quantity - v_used);
    if v_left = 0 then
      update public.inventory_items set quantity = 0, status = 'finished', confidence = 0.95, last_confirmed_at = now()
       where id = v_line.item_id;
      insert into public.inventory_events (household_id, item_id, event_type, quantity_delta, unit, reason, session_id, actor_member_id, actor_kind)
      values (v_s.household_id, v_line.item_id, 'finished', -v_used, v_line.unit, 'used up cooking', p_session, v_member, 'user');
    else
      update public.inventory_items set quantity = v_left, confidence = 0.95, last_confirmed_at = now() where id = v_line.item_id;
      insert into public.inventory_events (household_id, item_id, event_type, quantity_delta, unit, reason, session_id, actor_member_id, actor_kind)
      values (v_s.household_id, v_line.item_id, 'consumed', -v_used, v_line.unit, 'used cooking', p_session, v_member, 'user');
    end if;
    v_ids := v_ids || v_line.item_id;
  end loop;
  return v_ids;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- submit_feedback (finish sheet): one rating per member per session. Memory extraction arrives in Sprint 5.
-- ---------------------------------------------------------------------------------------------------------------
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
begin
  select * into v_s from public.cooking_sessions where id = p_session;
  if v_s.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  v_member := private.current_member(v_s.household_id);
  if v_member is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  delete from public.meal_feedback where session_id = p_session and member_id = v_member;
  insert into public.meal_feedback (household_id, session_id, member_id, rating, tags, comment, make_again)
  values (v_s.household_id, p_session, v_member, p_rating, coalesce(p_tags, '{}'), nullif(btrim(p_comment), ''), p_make_again)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.start_cooking_session(uuid, uuid, integer, uuid[], text, uuid, text) from public, anon;
revoke all on function public.advance_session_step(uuid, integer, text) from public, anon;
revoke all on function public.complete_cooking_session(uuid) from public, anon;
revoke all on function public.apply_session_deduction(uuid, jsonb) from public, anon;
revoke all on function public.submit_feedback(uuid, text, text[], text, boolean) from public, anon;
grant execute on function public.start_cooking_session(uuid, uuid, integer, uuid[], text, uuid, text),
  public.advance_session_step(uuid, integer, text), public.complete_cooking_session(uuid),
  public.apply_session_deduction(uuid, jsonb), public.submit_feedback(uuid, text, text[], text, boolean) to authenticated;
