-- English is the default language for everyone (product decision, 10 Nov 2026).
-- Users still pick Hindi, Hinglish or English on onboarding; these defaults only apply when nothing was chosen.
-- Supersedes the 'hi-IN' fallbacks in 20261116000100_functions.sql.

alter table public.profiles alter column preferred_language set default 'en-IN';
alter table public.voice_profiles alter column language_code set default 'en-IN';
alter table public.cooking_sessions alter column language_code set default 'en-IN';

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, is_anonymous, preferred_language)
  values (
    new.id,
    new.phone,
    coalesce(new.is_anonymous, new.phone is null),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'en-IN')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.create_household(
  p_name text,
  p_language text,
  p_members jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
  v_owner_member uuid;
  v_member uuid;
  v_member_json jsonb;
  v_self_index int;
  v_index int := 0;
  v_language text := coalesce(nullif(p_language, ''), 'en-IN');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0 then
    raise exception 'at least one member is required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_members) > 6 then
    raise exception 'V1 supports up to 6 members' using errcode = '22023';
  end if;

  select coalesce(min(ord) - 1, 0) into v_self_index
    from jsonb_array_elements(p_members) with ordinality as e(m, ord)
   where (m ->> 'is_self')::boolean is true;

  insert into public.households (name, created_by)
  values (coalesce(nullif(p_name, ''), 'My kitchen'), v_uid)
  returning id into v_household;

  for v_member_json in select value from jsonb_array_elements(p_members) loop
    insert into public.household_members (household_id, user_id, display_name, role, age_group, diet)
    values (
      v_household,
      case when v_index = v_self_index then v_uid end,
      coalesce(nullif(v_member_json ->> 'display_name', ''), 'Member ' || (v_index + 1)),
      case when v_index = v_self_index then 'owner' else 'dependent' end,
      coalesce(v_member_json ->> 'age_group', 'adult'),
      v_member_json ->> 'diet'
    )
    returning id into v_member;

    if v_index = v_self_index then
      v_owner_member := v_member;
    end if;

    insert into public.voice_profiles (member_id, household_id, language_code)
    values (v_member, v_household, v_language);

    insert into public.taste_profiles (member_id, household_id, spice)
    values (
      v_member,
      v_household,
      least(5, greatest(1, coalesce((v_member_json ->> 'spice')::smallint, 3)))
    );

    v_index := v_index + 1;
  end loop;

  insert into public.storage_locations (household_id, name, kind, sort_order)
  values
    (v_household, 'Fridge', 'fridge', 1),
    (v_household, 'Pantry', 'pantry', 2),
    (v_household, 'Freezer', 'freezer', 3),
    (v_household, 'Staples', 'staples', 4),
    (v_household, 'Ready-made', 'ready_made', 5);

  insert into public.shopping_lists (household_id) values (v_household);

  update public.profiles
     set last_active_household_id = v_household,
         preferred_language = v_language
   where id = v_uid;

  return jsonb_build_object('household_id', v_household, 'member_id', v_owner_member);
end $$;

revoke all on function public.create_household(text, text, jsonb) from public, anon;
grant execute on function public.create_household(text, text, jsonb) to authenticated;
