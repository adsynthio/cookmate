-- Catalog support for the content pipeline (tools/content/build.py -> supabase/seed.sql).

-- Curated recipes are upserted by slug; slugs are unique among global rows (household variants may reuse them).
create unique index if not exists recipes_global_slug_key on public.recipes (slug) where household_id is null;

-- Pantry parsing looks ingredients up by any alias ("pyaz", "kanda") and by fuzzy name.
create index if not exists ingredients_aliases_gin on public.ingredients using gin (aliases);
create index if not exists ingredients_canonical_name_trgm on public.ingredients
  using gin (canonical_name extensions.gin_trgm_ops);
