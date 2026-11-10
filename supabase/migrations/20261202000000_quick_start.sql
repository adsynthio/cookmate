-- KIT-026 (ONB-07): quick start from what you cooked yesterday. The dish's ingredients become guesses in the pantry
-- (confidence 0.4, so they show "Still have this?", never count towards "You have 9 of 10" and never reach Use Soon),
-- and one tap clears every guess nobody confirmed.

create or replace function public.guess_pantry_from_recipe(p_household uuid, p_recipe uuid) returns uuid[]
language plpgsql security invoker set search_path = '' as $$
declare
  v_member uuid := private.current_member(p_household);
  v_ids uuid[] := '{}';
  v_location uuid;
  v_kind text;
  v_id uuid;
  r record;
begin
  if v_member is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  -- RLS decides which recipes this user can see.
  if not exists (select 1 from public.recipes where id = p_recipe) then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;

  for r in
    select distinct on (g.id) g.id, g.default_location_kind, g.is_staple
      from public.recipe_ingredients ri
      join public.ingredients g on g.id = ri.ingredient_id
     where ri.recipe_id = p_recipe and not ri.is_optional
       and not exists (select 1 from public.inventory_items i
                        where i.household_id = p_household and i.status = 'active' and i.ingredient_id = g.id)
  loop
    v_location := private.location_for(p_household, coalesce(r.default_location_kind, 'pantry'));
    select kind into v_kind from public.storage_locations where id = v_location;
    insert into public.inventory_items (household_id, ingredient_id, location_id, staple_level, state, expiry_date,
      expiry_estimated, confidence, added_via, created_by)
    values (p_household, r.id, v_location, case when r.is_staple or v_kind = 'staples' then 'full' end, 'raw',
      private.estimate_expiry(r.id, v_kind, 'raw'), true, 0.4, 'onboarding', v_member)
    returning id into v_id;
    insert into public.inventory_events (household_id, item_id, event_type, reason, actor_member_id, actor_kind)
    values (p_household, v_id, 'added', 'guessed from a dish cooked yesterday', v_member, 'ai');
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;
grant execute on function public.guess_pantry_from_recipe(uuid, uuid) to authenticated;

-- "Clear them in one tap": remove guesses that were never confirmed. They were never real food, so they are deleted
-- rather than marked discarded (which would count as waste).
create or replace function public.clear_pantry_guesses(p_household uuid, p_items uuid[] default null) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  n integer;
begin
  if private.current_member(p_household) is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  delete from public.inventory_items
   where household_id = p_household and status = 'active' and added_via = 'onboarding' and confidence <= 0.5
     and (p_items is null or id = any(p_items));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.clear_pantry_guesses(uuid, uuid[]) to authenticated;
