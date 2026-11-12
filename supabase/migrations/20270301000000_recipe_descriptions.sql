-- Recipe descriptions in the app's other languages ({"hi": "...", "hi-Latn": "..."}), next to `titles`.
-- Steps already carry theirs in recipe_steps.instructions.
alter table public.recipes add column if not exists descriptions jsonb default '{}'::jsonb not null;
