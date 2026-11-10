-- Sprint 2: the living pantry (KIT-030..036). Every change goes through these functions so it is logged in
-- inventory_events (KIT-032). All functions run as the caller (security invoker), so RLS still decides access.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The caller's active membership in a household, or null.
create or replace function private.current_member(p_household uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id
    from public.household_members m
   where m.household_id = p_household
     and m.user_id = (select auth.uid())
     and m.status = 'active'
   limit 1
$$;
revoke all on function private.current_member(uuid) from public;
grant execute on function private.current_member(uuid) to authenticated, service_role;

-- Kitchen "today" is India time, not UTC: an item added at 1 am IST belongs to that day.
create or replace function private.kitchen_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;
grant execute on function private.kitchen_today() to authenticated, service_role;

-- Map spoken/typed names to the catalog: canonical name, Hinglish name, Hindi name, alias, or a simple plural.
create or replace function public.match_ingredient(p_name text) returns uuid
language sql stable security invoker set search_path = '' as $$
  with q as (select lower(btrim(p_name)) as n, btrim(p_name) as raw)
  select i.id
    from public.ingredients i, q
   where q.n <> ''
     and (i.canonical_name = q.n
          or lower(i.names ->> 'hi-Latn') = q.n
          or i.names ->> 'hi' = q.raw
          or q.n = any (i.aliases)
          or (right(q.n, 1) = 's' and i.canonical_name = left(q.n, -1))
          or (right(q.n, 2) = 'es' and i.canonical_name = left(q.n, -2)))
   order by (i.canonical_name = q.n) desc, (lower(i.names ->> 'hi-Latn') = q.n) desc, i.canonical_name
   limit 1
$$;

-- Shelf-life estimate for an item: catalog days for that storage kind, else a cautious default for cooked food.
create or replace function private.estimate_expiry(p_ingredient uuid, p_kind text, p_state text) returns date
language sql stable set search_path = '' as $$
  select private.kitchen_today() + coalesce(
    (select (i.shelf_life_days ->> p_kind)::int from public.ingredients i
      where i.id = p_ingredient and p_state in ('raw', 'opened')),
    case
      when p_state in ('cooked', 'leftover', 'homemade') then
        case p_kind when 'freezer' then 30 when 'ready_made' then 5 when 'fridge' then 3 else 1 end
    end
  )
$$;
grant execute on function private.estimate_expiry(uuid, text, text) to authenticated, service_role;

create or replace function private.location_for(p_household uuid, p_kind text) returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    (select id from public.storage_locations where household_id = p_household and kind = p_kind order by sort_order limit 1),
    (select id from public.storage_locations where household_id = p_household and kind = 'pantry' order by sort_order limit 1)
  )
$$;
grant execute on function private.location_for(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- add_inventory_items (KIT-031): confirmed items from text, voice or touch.
-- p_items: [{name?, ingredient_id?, quantity?, unit?, location_kind?, staple_level?, state?, flavor_roles?, expiry_date?}]
-- The same ingredient already in the same place is topped up instead of duplicated.
-- ---------------------------------------------------------------------------
create or replace function public.add_inventory_items(
  p_household uuid,
  p_items jsonb,
  p_added_via text default 'manual'
) returns uuid[]
language plpgsql security invoker set search_path = '' as $$
declare
  v_member uuid := private.current_member(p_household);
  v_actor text := case when p_added_via = 'voice' then 'voice' else 'user' end;
  v_item jsonb;
  v_name text;
  v_ing public.ingredients%rowtype;
  v_kind text;
  v_location uuid;
  v_state text;
  v_qty numeric;
  v_unit text;
  v_level text;
  v_expiry date;
  v_estimated boolean;
  v_roles text[];
  v_existing public.inventory_items%rowtype;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if v_member is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'at most 50 items at a time' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_name := nullif(btrim(v_item ->> 'name'), '');
    v_ing := null;
    select * into v_ing from public.ingredients
     where id = coalesce((v_item ->> 'ingredient_id')::uuid, public.match_ingredient(v_name));
    if v_ing.id is null and v_name is null then
      raise exception 'each item needs a name or ingredient_id' using errcode = '22023';
    end if;

    v_kind := coalesce(v_item ->> 'location_kind', v_ing.default_location_kind, 'pantry');
    v_location := private.location_for(p_household, v_kind);
    select kind into v_kind from public.storage_locations where id = v_location;
    v_state := coalesce(v_item ->> 'state', case when v_kind = 'ready_made' and v_ing.id is null then 'homemade' else 'raw' end);
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is not null and v_qty < 0 then
      raise exception 'quantity cannot be negative' using errcode = '22023';
    end if;
    v_unit := coalesce(nullif(v_item ->> 'unit', ''), case when v_qty is not null then v_ing.default_unit end);
    v_level := v_item ->> 'staple_level';
    if v_level is null and (coalesce(v_ing.is_staple, false) or v_kind = 'staples') then
      v_level := 'full'; -- KIT-033: a staple just added is full
    end if;
    v_expiry := (v_item ->> 'expiry_date')::date;
    v_estimated := v_expiry is null;
    if v_expiry is null then
      v_expiry := private.estimate_expiry(v_ing.id, v_kind, v_state);
    end if;
    select coalesce(array_agg(r), '{}') into v_roles
      from jsonb_array_elements_text(coalesce(v_item -> 'flavor_roles', '[]'::jsonb)) r
     where r in ('rich', 'heat', 'acid', 'crunch', 'starch', 'sweet');

    -- Top up the same thing in the same place rather than creating a duplicate row.
    v_existing := null;
    select * into v_existing from public.inventory_items i
     where i.household_id = p_household and i.status = 'active' and i.location_id = v_location and i.state = v_state
       and ((v_ing.id is not null and i.ingredient_id = v_ing.id)
            or (v_ing.id is null and i.ingredient_id is null and lower(i.custom_name) = lower(v_name)))
       and (i.unit is not distinct from v_unit or i.quantity is null or v_qty is null)
     order by i.created_at
     limit 1
     for update;

    if v_existing.id is not null then
      update public.inventory_items
         set quantity = case when v_qty is null then quantity else coalesce(quantity, 0) + v_qty end,
             unit = coalesce(unit, v_unit),
             staple_level = coalesce(v_level, staple_level),
             expiry_date = case when expiry_date is null then v_expiry else least(expiry_date, v_expiry) end,
             expiry_estimated = expiry_estimated and v_estimated,
             flavor_roles = (select coalesce(array_agg(distinct x), '{}') from unnest(flavor_roles || v_roles) x),
             confidence = 0.95,
             last_confirmed_at = now()
       where id = v_existing.id
      returning id into v_id;
    else
      insert into public.inventory_items (household_id, ingredient_id, custom_name, location_id, quantity, unit,
        staple_level, state, flavor_roles, expiry_date, expiry_estimated, confidence, last_confirmed_at,
        added_via, created_by)
      values (p_household, v_ing.id, case when v_ing.id is null then v_name end, v_location, v_qty, v_unit,
        v_level, v_state, v_roles, v_expiry, v_estimated, 0.95, now(),
        coalesce(p_added_via, 'manual'), v_member)
      returning id into v_id;
    end if;

    insert into public.inventory_events (household_id, item_id, event_type, quantity_delta, unit, reason,
      actor_member_id, actor_kind)
    values (p_household, v_id, 'added', v_qty, v_unit,
      case when v_existing.id is not null then 'topped up' end, v_member, v_actor);
    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end $$;

-- ---------------------------------------------------------------------------
-- update_inventory_item (KIT-032): edit quantity, level, place, expiry or name, or confirm it is still there.
-- p_changes: {quantity?, unit?, staple_level?, location_kind?, expiry_date?, custom_name?, confirm?, via?}
-- One event per kind of change, so the history reads like what happened.
-- ---------------------------------------------------------------------------
create or replace function public.update_inventory_item(p_item uuid, p_changes jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_old public.inventory_items%rowtype;
  v_member uuid;
  v_actor text := case when p_changes ->> 'via' = 'voice' then 'voice' else 'user' end;
  v_kind text;
  v_location uuid;
  v_qty numeric;
begin
  select * into v_old from public.inventory_items where id = p_item for update;
  if v_old.id is null then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  v_member := private.current_member(v_old.household_id);

  if p_changes ? 'quantity' then
    v_qty := (p_changes ->> 'quantity')::numeric;
    if v_qty is not null and v_qty < 0 then
      raise exception 'quantity cannot be negative' using errcode = '22023';
    end if;
    update public.inventory_items
       set quantity = v_qty, unit = coalesce(nullif(p_changes ->> 'unit', ''), unit),
           confidence = 0.95, last_confirmed_at = now()
     where id = p_item;
    insert into public.inventory_events (household_id, item_id, event_type, quantity_delta, unit, actor_member_id, actor_kind)
    values (v_old.household_id, p_item, 'adjusted', v_qty - v_old.quantity,
      coalesce(nullif(p_changes ->> 'unit', ''), v_old.unit), v_member, v_actor);
  end if;

  if p_changes ? 'staple_level' and (p_changes ->> 'staple_level') is distinct from v_old.staple_level then
    update public.inventory_items
       set staple_level = p_changes ->> 'staple_level', confidence = 0.95, last_confirmed_at = now()
     where id = p_item;
    insert into public.inventory_events (household_id, item_id, event_type, reason, actor_member_id, actor_kind)
    values (v_old.household_id, p_item, 'adjusted', 'level ' || coalesce(v_old.staple_level, '-') || ' -> ' || (p_changes ->> 'staple_level'),
      v_member, v_actor);
  end if;

  if p_changes ? 'location_kind' then
    v_location := private.location_for(v_old.household_id, p_changes ->> 'location_kind');
    if v_location is distinct from v_old.location_id then
      select kind into v_kind from public.storage_locations where id = v_location;
      update public.inventory_items
         set location_id = v_location,
             -- Moving to the freezer (or out of it) changes how long an estimated expiry lasts.
             expiry_date = case when expiry_estimated then private.estimate_expiry(ingredient_id, v_kind, state) else expiry_date end
       where id = p_item;
      insert into public.inventory_events (household_id, item_id, event_type, reason, actor_member_id, actor_kind)
      values (v_old.household_id, p_item, 'moved', 'to ' || v_kind, v_member, v_actor);
    end if;
  end if;

  if p_changes ? 'expiry_date' or p_changes ? 'custom_name' then
    update public.inventory_items
       set expiry_date = case when p_changes ? 'expiry_date' then (p_changes ->> 'expiry_date')::date else expiry_date end,
           expiry_estimated = case when p_changes ? 'expiry_date' then false else expiry_estimated end,
           custom_name = case when p_changes ? 'custom_name' then nullif(btrim(p_changes ->> 'custom_name'), '') else custom_name end
     where id = p_item;
    insert into public.inventory_events (household_id, item_id, event_type, reason, actor_member_id, actor_kind)
    values (v_old.household_id, p_item, 'corrected',
      concat_ws(', ', case when p_changes ? 'expiry_date' then 'expiry' end, case when p_changes ? 'custom_name' then 'name' end),
      v_member, v_actor);
  end if;

  if coalesce((p_changes ->> 'confirm')::boolean, false) then
    update public.inventory_items set confidence = 0.95, last_confirmed_at = now() where id = p_item;
    insert into public.inventory_events (household_id, item_id, event_type, actor_member_id, actor_kind)
    values (v_old.household_id, p_item, 'confirmed', v_member, v_actor);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- finish / discard (KIT-032) and reopen (the 5-second undo).
-- ---------------------------------------------------------------------------
create or replace function public.finish_inventory_item(p_item uuid, p_discarded boolean default false) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_old public.inventory_items%rowtype;
begin
  update public.inventory_items
     set status = case when p_discarded then 'discarded' else 'finished' end
   where id = p_item and status = 'active'
  returning * into v_old;
  if v_old.id is null then
    raise exception 'active item not found' using errcode = 'P0002';
  end if;
  insert into public.inventory_events (household_id, item_id, event_type, quantity_delta, unit, actor_member_id, actor_kind)
  values (v_old.household_id, p_item, case when p_discarded then 'discarded' else 'finished' end,
    -v_old.quantity, v_old.unit, private.current_member(v_old.household_id), 'user');
end $$;

create or replace function public.reopen_inventory_item(p_item uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_old public.inventory_items%rowtype;
begin
  update public.inventory_items set status = 'active'
   where id = p_item and status in ('finished', 'discarded')
  returning * into v_old;
  if v_old.id is null then
    raise exception 'finished item not found' using errcode = 'P0002';
  end if;
  insert into public.inventory_events (household_id, item_id, event_type, quantity_delta, unit, reason, actor_member_id, actor_kind)
  values (v_old.household_id, p_item, 'corrected', v_old.quantity, v_old.unit, 'undo',
    private.current_member(v_old.household_id), 'user');
end $$;

-- ---------------------------------------------------------------------------
-- get_use_soon (HOME-04): confident items expiring within p_days, soonest first.
-- ---------------------------------------------------------------------------
create or replace function public.get_use_soon(p_household uuid, p_days int default 3)
returns table (id uuid, name text, quantity numeric, unit text, location_kind text, expiry_date date,
  days_left int, confidence numeric)
language sql stable security invoker set search_path = '' as $$
  select i.id, coalesce(g.canonical_name, i.custom_name), i.quantity, i.unit, l.kind, i.expiry_date,
         i.expiry_date - private.kitchen_today(), i.confidence
    from public.inventory_items i
    join public.storage_locations l on l.id = i.location_id
    left join public.ingredients g on g.id = i.ingredient_id
   where i.household_id = p_household
     and i.status = 'active'
     and i.confidence >= 0.5
     and i.expiry_date is not null
     and i.expiry_date <= private.kitchen_today() + p_days
   order by i.expiry_date, i.quantity desc nulls last
$$;

-- ---------------------------------------------------------------------------
-- add_to_shopping_list (KIT-033 "Low/Out offers Add to list"; full shopping flow is Sprint 5).
-- p_items: [{name, ingredient_id?, quantity?, unit?, reason?, recipe_id?}]. Skips things already on the list.
-- ---------------------------------------------------------------------------
create or replace function public.add_to_shopping_list(p_household uuid, p_items jsonb) returns uuid[]
language plpgsql security invoker set search_path = '' as $$
declare
  v_member uuid := private.current_member(p_household);
  v_list uuid;
  v_item jsonb;
  v_ing uuid;
  v_name text;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if v_member is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  select id into v_list from public.shopping_lists
   where household_id = p_household and status = 'active' order by created_at limit 1;
  if v_list is null then
    insert into public.shopping_lists (household_id) values (p_household) returning id into v_list;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_name := nullif(btrim(v_item ->> 'name'), '');
    v_ing := coalesce((v_item ->> 'ingredient_id')::uuid, public.match_ingredient(v_name));
    if v_ing is null and v_name is null then
      raise exception 'each item needs a name or ingredient_id' using errcode = '22023';
    end if;
    select id into v_id from public.shopping_list_items s
     where s.list_id = v_list and s.status in ('needed', 'in_cart')
       and ((v_ing is not null and s.ingredient_id = v_ing) or (v_ing is null and lower(s.display_name) = lower(v_name)))
     limit 1;
    if v_id is null then
      insert into public.shopping_list_items (household_id, list_id, ingredient_id, display_name, quantity, unit,
        reason, recipe_id, added_by)
      values (p_household, v_list, v_ing,
        coalesce(v_name, (select canonical_name from public.ingredients where id = v_ing)),
        (v_item ->> 'quantity')::numeric, v_item ->> 'unit', coalesce(v_item ->> 'reason', 'manual'),
        (v_item ->> 'recipe_id')::uuid, v_member)
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

revoke all on function public.match_ingredient(text) from public, anon;
revoke all on function public.add_inventory_items(uuid, jsonb, text) from public, anon;
revoke all on function public.update_inventory_item(uuid, jsonb) from public, anon;
revoke all on function public.finish_inventory_item(uuid, boolean) from public, anon;
revoke all on function public.reopen_inventory_item(uuid) from public, anon;
revoke all on function public.get_use_soon(uuid, int) from public, anon;
revoke all on function public.add_to_shopping_list(uuid, jsonb) from public, anon;
grant execute on function public.match_ingredient(text) to authenticated, service_role;
grant execute on function public.add_inventory_items(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.update_inventory_item(uuid, jsonb) to authenticated, service_role;
grant execute on function public.finish_inventory_item(uuid, boolean) to authenticated, service_role;
grant execute on function public.reopen_inventory_item(uuid) to authenticated, service_role;
grant execute on function public.get_use_soon(uuid, int) to authenticated, service_role;
grant execute on function public.add_to_shopping_list(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime (KIT-030): other phones in the household see pantry changes. RLS still filters what each user receives.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_items') then
    alter publication supabase_realtime add table public.inventory_items;
  end if;
end $$;
