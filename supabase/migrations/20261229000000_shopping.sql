-- Shopping list (KIT-111): what was bought goes into the pantry in one step. Bought items are added the same way
-- as items the cook types in (estimated expiry, top-ups, events), and a staple that was Low or Out is Full again.
-- Passing no ids marks everything still needed ("sab le aaye"). Invoker rights.

create or replace function public.mark_list_items_bought(
  p_household uuid,
  p_item_ids uuid[] default null,
  p_add_to_pantry boolean default true
) returns uuid[]
language plpgsql security invoker set search_path = '' as $$
declare
  v_bought uuid[];
  v_items jsonb;
  v_pantry uuid[] := '{}';
begin
  if private.current_member(p_household) is null then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;

  with marked as (
    update public.shopping_list_items s
       set status = 'bought', bought_at = now()
     where s.household_id = p_household and s.status in ('needed', 'in_cart')
       and (p_item_ids is null or s.id = any (p_item_ids))
    returning s.id
  )
  select coalesce(array_agg(id), '{}') into v_bought from marked;

  if p_add_to_pantry and cardinality(v_bought) > 0 then
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'ingredient_id', s.ingredient_id, 'name', s.display_name, 'quantity', s.quantity, 'unit', s.unit)))
      into v_items
      from public.shopping_list_items s where s.id = any (v_bought);
    v_pantry := public.add_inventory_items(p_household, v_items, 'manual');
    update public.inventory_items set staple_level = 'full', confidence = 0.95, last_confirmed_at = now()
     where id = any (v_pantry) and staple_level in ('low', 'out');
  end if;
  return v_pantry;
end $$;

create or replace function public.remove_list_item(p_item uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.shopping_list_items set status = 'removed' where id = p_item and status in ('needed', 'in_cart');
  if not found then
    raise exception 'list item not found' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.mark_list_items_bought(uuid, uuid[], boolean) from public, anon;
revoke all on function public.remove_list_item(uuid) from public, anon;
grant execute on function public.mark_list_items_bought(uuid, uuid[], boolean), public.remove_list_item(uuid) to authenticated;
