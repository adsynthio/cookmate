-- Predictive restocking (KIT-181): learn how often a household buys each thing, and ask before it runs out
-- ("Running low on atta? You usually buy it every 12 days"). A question, never an order: the answer is Add to list
-- (the usual add_to_shopping_list, reason 'predicted') or Not yet, which the phone remembers for a few days.
--
-- A purchase is a day (India time) on which an item for that ingredient was added to the kitchen: by hand, by voice,
-- from a bill or barcode, or by ticking it off the shopping list. Setting up the kitchen at onboarding is not a
-- purchase. The rhythm needs at least three purchase days in the last six months (two gaps), so nothing is asked of a
-- new household; it starts on its own as the history builds.

create index if not exists inventory_events_household_added_idx
  on public.inventory_events (household_id, created_at) where event_type = 'added';

-- Nightly: rebuild every household's patterns from the last 180 days of purchases.
create or replace function private.refresh_purchase_patterns()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with buys as (
    select distinct e.household_id, i.ingredient_id,
           (e.created_at at time zone 'Asia/Kolkata')::date as day
      from public.inventory_events e
      join public.inventory_items i on i.id = e.item_id
     where e.event_type = 'added'
       and i.ingredient_id is not null
       and i.added_via <> 'onboarding'
       and e.created_at > now() - interval '180 days'
  ), rhythm as (
    select household_id, ingredient_id,
           count(*) - 1 as gaps,
           (max(day) - min(day))::numeric / nullif(count(*) - 1, 0) as every_days,
           max(day) as last_day
      from buys
     group by household_id, ingredient_id
    having count(*) >= 3
  )
  insert into public.purchase_patterns (household_id, ingredient_id, avg_interval_days, last_purchased_at,
    next_predicted_at, sample_count)
  select r.household_id, r.ingredient_id, round(r.every_days, 1),
         (r.last_day::timestamp at time zone 'Asia/Kolkata'),
         ((r.last_day + round(r.every_days)::int)::timestamp at time zone 'Asia/Kolkata'),
         r.gaps
    from rhythm r
   where r.every_days >= 2
  on conflict (household_id, ingredient_id) do update
    set avg_interval_days = excluded.avg_interval_days,
        last_purchased_at = excluded.last_purchased_at,
        next_predicted_at = excluded.next_predicted_at,
        sample_count = excluded.sample_count;
  get diagnostics n = row_count;
  -- Patterns with no purchase in the window are no longer a rhythm.
  delete from public.purchase_patterns where last_purchased_at < now() - interval '180 days';
  return n;
end $$;
revoke all on function private.refresh_purchase_patterns() from public, anon, authenticated;
grant execute on function private.refresh_purchase_patterns() to service_role;

-- What is due to run out within p_days, soonest first; runs as the caller so household RLS decides. Skips anything
-- already on the list and staples already marked Low or Out (the household knows about those).
create or replace function public.restock_due(p_household uuid, p_days int default 2)
returns table (ingredient_id uuid, name text, every_days numeric, last_bought date, due_in_days int)
language sql stable security invoker set search_path = '' as $$
  select p.ingredient_id, g.canonical_name, p.avg_interval_days,
         (p.last_purchased_at at time zone 'Asia/Kolkata')::date,
         ((p.next_predicted_at at time zone 'Asia/Kolkata')::date - (now() at time zone 'Asia/Kolkata')::date)
    from public.purchase_patterns p
    join public.ingredients g on g.id = p.ingredient_id
   where p.household_id = p_household
     and p.next_predicted_at < now() + make_interval(days => greatest(least(p_days, 14), 0) + 1)
     and not exists (select 1 from public.shopping_list_items s
                      where s.household_id = p_household and s.ingredient_id = p.ingredient_id
                        and s.status in ('needed', 'in_cart'))
     and not exists (select 1 from public.inventory_items i
                      where i.household_id = p_household and i.ingredient_id = p.ingredient_id
                        and i.status = 'active' and i.staple_level in ('low', 'out'))
   order by p.next_predicted_at
   limit 3;
$$;
revoke all on function public.restock_due(uuid, int) from public, anon;
grant execute on function public.restock_due(uuid, int) to authenticated;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; skipping restock job (local test database)';
    return;
  end if;
  -- 02:45 IST = 21:15 UTC, after the confidence decay.
  perform cron.schedule('refresh-purchase-patterns', '15 21 * * *', 'select private.refresh_purchase_patterns()');
end $$;
