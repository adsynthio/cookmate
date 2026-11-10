-- Sprint 3: recipe visibility for staging drafts, multilingual recipe search (KIT-054, REC-08).

-- Feature flag lookup usable inside RLS policies (feature_flags itself is not readable by users).
create or replace function private.flag_enabled(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select f.enabled and f.rollout_pct > 0 from public.feature_flags f where f.key = p_key), false)
$$;
grant execute on function private.flag_enabled(text) to authenticated, service_role;

-- A curated recipe is visible when published; drafts too while show_draft_recipes is on (staging only, REC-01).
-- Household recipes (adapted variants, family recipes) stay visible to their household only.
create or replace function private.recipe_visible(p_household uuid, p_published boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_household is null then p_published or private.flag_enabled('show_draft_recipes')
    else private.is_household_member(p_household)
  end
$$;
grant execute on function private.recipe_visible(uuid, boolean) to authenticated, service_role;

drop policy if exists recipes_visible_select on public.recipes;
create policy recipes_visible_select on public.recipes for select to authenticated
  using (private.recipe_visible(household_id, is_published));

drop policy if exists recipe_ingredients_visible_select on public.recipe_ingredients;
create policy recipe_ingredients_visible_select on public.recipe_ingredients for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and private.recipe_visible(r.household_id, r.is_published)));

drop policy if exists recipe_steps_visible_select on public.recipe_steps;
create policy recipe_steps_visible_select on public.recipe_steps for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and private.recipe_visible(r.household_id, r.is_published)));

drop policy if exists recipe_variation_rules_visible_select on public.recipe_variation_rules;
create policy recipe_variation_rules_visible_select on public.recipe_variation_rules for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and private.recipe_visible(r.household_id, r.is_published)));

drop policy if exists step_audio_cache_visible_select on public.step_audio_cache;
create policy step_audio_cache_visible_select on public.step_audio_cache for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and private.recipe_visible(r.household_id, r.is_published)));

-- REC-08: "rajma", "राजमा" and "kidney bean curry" find the same dish. Word-prefix matching over titles in every
-- script, the slug, the description and the main ingredients' names and aliases; title hits weigh double.
-- Same rules as searchScore() in apps/mobile/src/domain/recipes.ts. Runs as the caller, so RLS decides visibility.
create or replace function public.search_recipes(p_query text, p_limit integer default 20)
returns table (id uuid, slug text, title text, titles jsonb, course text, diet text, prep_time_min smallint,
  cook_time_min smallint, spice_level smallint, tags text[], score real)
language sql stable security invoker set search_path = '' as $$
  with words as (
    select array_agg(w) as all_words,
           array_agg(w) filter (where w not in ('curry', 'sabzi', 'sabji', 'subzi', 'masala')) as strong
    from regexp_split_to_table(lower(coalesce(p_query, '')), '[\s.,!?''"()/–—-]+') as w
    where w <> '' and w not in ('recipe', 'recipes', 'dish', 'how', 'to', 'make', 'the', 'a', 'of', 'with',
                                'wala', 'wali', 'wale', 'ki', 'ka', 'ke', 'bana', 'banana')
  ),
  terms as (
    select t.term,
           case when length(t.term) > 4 and t.term like '%es' then left(t.term, -2)
                when length(t.term) > 3 and t.term like '%s' then left(t.term, -1)
                else t.term end as stem
    from words, unnest(coalesce(words.strong, words.all_words)) as t(term)
  ),
  docs as (
    select r.id, r.slug, r.title, r.titles, r.course, r.diet, r.prep_time_min, r.cook_time_min, r.spice_level, r.tags,
      ' ' || regexp_replace(lower(concat_ws(' ', r.title, r.titles ->> 'hi', r.titles ->> 'hi-Latn', r.titles ->> 'en',
        replace(r.slug, '-', ' '))), '[.,!?''"()/–—-]+', ' ', 'g') as title_doc,
      ' ' || regexp_replace(lower(concat_ws(' ', r.description, r.course, array_to_string(r.tags, ' '),
        (select string_agg(concat_ws(' ', g.canonical_name, g.names ->> 'hi', g.names ->> 'hi-Latn',
                                     array_to_string(g.aliases, ' ')), ' ')
         from public.recipe_ingredients ri join public.ingredients g on g.id = ri.ingredient_id
         where ri.recipe_id = r.id and ri.role in ('base', 'protein', 'vegetable')))), '[.,!?''"()/–—-]+', ' ', 'g') as body_doc
    from public.recipes r
    where r.parent_recipe_id is null
  ),
  scored as (
    select d.id, d.slug, d.title, d.titles, d.course, d.diet, d.prep_time_min, d.cook_time_min, d.spice_level, d.tags,
      (sum(case
             when position(' ' || t.term in d.title_doc) > 0 or (length(t.stem) >= 3 and position(' ' || t.stem in d.title_doc) > 0) then 1
             when position(' ' || t.term in d.body_doc) > 0 or (length(t.stem) >= 3 and position(' ' || t.stem in d.body_doc) > 0) then 0.75
             else 0 end) / count(*))::real as score
    from docs d cross join terms t
    group by d.id, d.slug, d.title, d.titles, d.course, d.diet, d.prep_time_min, d.cook_time_min, d.spice_level, d.tags
  )
  select * from scored s where s.score >= 0.6
  order by s.score desc, s.title
  limit greatest(1, least(coalesce(p_limit, 20), 50))
$$;
grant execute on function public.search_recipes(text, integer) to authenticated;
