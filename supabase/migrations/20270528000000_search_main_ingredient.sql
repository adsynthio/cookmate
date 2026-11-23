-- Recipe search: when scores tie, the dish whose main ingredient matches comes first (23 Nov 2026). With 24 new
-- library dishes, "kidney bean curry" found Dal Makhani (urad with a little rajma) before Rajma, because both matched
-- "kidney bean" in their ingredients and the tie went to the title. A word found in the dish's first main ingredient
-- (base, protein or vegetable, in recipe order) now counts 0.8, between a title hit (1) and any other hit (0.75).
-- The same rule as searchScore in apps/mobile/src/domain/recipes.ts. Same signature, so grants are unchanged.
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
         where ri.recipe_id = r.id and ri.role in ('base', 'protein', 'vegetable')))), '[.,!?''"()/–—-]+', ' ', 'g') as body_doc,
      ' ' || coalesce(regexp_replace(lower(
        (select concat_ws(' ', g.canonical_name, g.names ->> 'hi', g.names ->> 'hi-Latn', array_to_string(g.aliases, ' '))
         from public.recipe_ingredients ri join public.ingredients g on g.id = ri.ingredient_id
         where ri.recipe_id = r.id and ri.role in ('base', 'protein', 'vegetable')
         order by ri.sort_order, ri.id
         limit 1)), '[.,!?''"()/–—-]+', ' ', 'g'), '') as lead_doc
    from public.recipes r
    where r.parent_recipe_id is null
  ),
  scored as (
    select d.id, d.slug, d.title, d.titles, d.course, d.diet, d.prep_time_min, d.cook_time_min, d.spice_level, d.tags,
      (sum(case
             when position(' ' || t.term in d.title_doc) > 0 or (length(t.stem) >= 3 and position(' ' || t.stem in d.title_doc) > 0) then 1
             when position(' ' || t.term in d.lead_doc) > 0 or (length(t.stem) >= 3 and position(' ' || t.stem in d.lead_doc) > 0) then 0.8
             when position(' ' || t.term in d.body_doc) > 0 or (length(t.stem) >= 3 and position(' ' || t.stem in d.body_doc) > 0) then 0.75
             else 0 end) / count(*))::real as score
    from docs d cross join terms t
    group by d.id, d.slug, d.title, d.titles, d.course, d.diet, d.prep_time_min, d.cook_time_min, d.spice_level, d.tags
  )
  select * from scored s where s.score >= 0.6
  order by s.score desc, s.title
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
