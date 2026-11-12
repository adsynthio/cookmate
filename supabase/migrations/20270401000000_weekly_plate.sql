-- Health (KIT-170/171): the weekly plate. Meals cooked to the end are counted by the food groups of their dish, week by
-- week (Monday to Sunday, India time); never calories. The app reads the current weeks live with `weekly_plate`; every
-- Monday at 03:15 IST the week just gone is kept in `nutrition_weekly` (kept a year) so the history outlives any change
-- to a recipe's groups. Tips are worked out on the phone from the counts (apps/mobile/src/domain/plate.ts).

create index if not exists cooking_sessions_household_completed_idx
  on public.cooking_sessions (household_id, completed_at) where status = 'completed';

-- Runs as the caller, so the household read policies on cooking_sessions and recipes decide what is counted.
create or replace function public.weekly_plate(p_household uuid, p_weeks int default 4)
returns table (week_start date, meals int, food_groups jsonb)
language sql stable security invoker set search_path = '' as $$
  with meals as (
    select (date_trunc('week', s.completed_at at time zone 'Asia/Kolkata'))::date as week_start,
           s.id,
           coalesce(nullif(a.food_groups, '{}'), r.food_groups) as groups
      from public.cooking_sessions s
      join public.recipes r on r.id = s.recipe_id
      left join public.recipes a on a.id = s.adapted_recipe_id
     where s.household_id = p_household
       and s.status = 'completed'
       and s.completed_at >= date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
                             - make_interval(weeks => greatest(least(p_weeks, 52), 1) - 1)
  )
  select m.week_start,
         count(distinct m.id)::int,
         coalesce((select jsonb_object_agg(g.grp, g.n) from (
                     select grp, count(distinct m2.id) as n
                       from meals m2, unnest(m2.groups) as grp
                      where m2.week_start = m.week_start
                      group by grp) g), '{}'::jsonb)
    from meals m
   group by m.week_start
   order by m.week_start desc;
$$;
revoke all on function public.weekly_plate(uuid, int) from public, anon;
grant execute on function public.weekly_plate(uuid, int) to authenticated;

-- The week just gone, for every household that cooked in it. Idempotent: a re-run replaces the week's rows.
create or replace function private.snapshot_weekly_plate(p_week date default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  wk date := coalesce(p_week, (date_trunc('week', now() at time zone 'Asia/Kolkata') - interval '7 days')::date);
  n int;
begin
  -- member_id is null for the household row, and nulls never conflict, so replace the week by hand.
  delete from public.nutrition_weekly where week_start = wk and member_id is null;
  insert into public.nutrition_weekly (household_id, member_id, week_start, food_groups, computed_at)
  select s.household_id, null, wk,
         (select coalesce(jsonb_object_agg(grp, c), '{}'::jsonb) from (
            select grp, count(*) as c
              from public.cooking_sessions s2
              join public.recipes r2 on r2.id = s2.recipe_id
              cross join unnest(r2.food_groups) as grp
             where s2.household_id = s.household_id and s2.status = 'completed'
               and (date_trunc('week', s2.completed_at at time zone 'Asia/Kolkata'))::date = wk
             group by grp) x)
         || jsonb_build_object('meals', count(*)),
         now()
    from public.cooking_sessions s
   where s.status = 'completed'
     and (date_trunc('week', s.completed_at at time zone 'Asia/Kolkata'))::date = wk
   group by s.household_id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.snapshot_weekly_plate(date) from public, anon, authenticated;
grant execute on function private.snapshot_weekly_plate(date) to service_role;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed; skipping weekly plate job (local test database)';
    return;
  end if;
  -- Monday 03:15 IST = Sunday 21:45 UTC
  perform cron.schedule('weekly-plate', '45 21 * * 0', 'select private.snapshot_weekly_plate()');
end $$;
