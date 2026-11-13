-- Your kitchen week (D3): a warm look back at the last seven days, for the You screen (and Home on Sundays).
--   * meals cooked at home, and the dishes, with the ones tried for the first time;
--   * things used up in cooking before they went off (consumed by a cooking session within two days of the use-by);
--   * who loved what (reactions from the finish sheet);
--   * a gentle count of weeks in a row with at least three home-cooked meals. A count to enjoy, never a streak to
--     lose: it is measured over rolling seven-day blocks, and nothing is said when it is zero.
-- Invoker rights: row-level security decides which household can be read.

create or replace function public.week_recap(p_household uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with done as (
    select s.recipe_id, s.completed_at
      from public.cooking_sessions s
     where s.household_id = p_household and s.status = 'completed' and s.completed_at is not null
  ),
  week as (select * from done where completed_at >= now() - interval '7 days'),
  dishes as (
    select r.id, r.title, r.titles, count(*)::int as times,
           not exists (select 1 from done d where d.recipe_id = r.id and d.completed_at < now() - interval '7 days') as is_new
      from week w
      join public.recipes r on r.id = w.recipe_id
     group by r.id, r.title, r.titles
  ),
  saved as (
    select count(distinct e.item_id)::int as n
      from public.inventory_events e
      join public.inventory_items i on i.id = e.item_id
     where e.household_id = p_household and e.event_type = 'consumed' and e.session_id is not null
       and e.created_at >= now() - interval '7 days'
       and i.expiry_date is not null
       and i.expiry_date <= (e.created_at at time zone 'Asia/Kolkata')::date + 2
  ),
  blocks as (
    select k, (select count(*) from done
                where completed_at >= now() - make_interval(days => 7 * (k + 1))
                  and completed_at < now() - make_interval(days => 7 * k)) as n
      from generate_series(0, 51) k
  ),
  loved as (
    select m.display_name as name, r.title as dish, r.titles
      from public.memories mm
      join public.household_members m on m.id = mm.member_id
      join public.recipes r on r.id = mm.subject_recipe_id
     where mm.household_id = p_household and mm.status = 'active' and mm.polarity > 0
       and mm.attributes ->> 'about' = 'reaction' and mm.created_at >= now() - interval '7 days'
     order by mm.created_at desc
     limit 5
  )
  select jsonb_build_object(
    'meals', (select count(*) from week)::int,
    'dishes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'titles', titles, 'times', times, 'new', is_new)
                                         order by times desc, title) from dishes), '[]'::jsonb),
    'saved', (select n from saved),
    'weeks_cooking', (select coalesce(min(k), 52) from blocks where n < 3)::int,
    'loved', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'dish', dish, 'titles', titles)) from loved), '[]'::jsonb)
  );
$$;
revoke all on function public.week_recap(uuid) from public, anon;
grant execute on function public.week_recap(uuid) to authenticated;
comment on function public.week_recap(uuid) is
  'The last seven days at home: meals, dishes (new ones marked), things used before they went off, who loved what, and weeks in a row with three or more home-cooked meals. Invoker rights.';
