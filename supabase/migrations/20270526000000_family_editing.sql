-- Family editing after setup. Onboarding says "you can change this later", and nothing could: a kitchen that missed
-- Dadi, gained a baby, or had a cousin move in was stuck with the people it started with, so picks, spice and diet
-- were wrong for the whole table.
--
-- Three functions, all SECURITY INVOKER: they run as the signed-in person, so the existing row policies and the
-- household_members guard trigger decide exactly as for direct table writes (an owner or admin adds and removes
-- people; anyone fixes their own row). They only bundle the writes so a new person always gets their voice and
-- taste profiles, and they check the same limits as create_household (names 1 to 40 characters, up to 12 people).
-- Removing sets status 'removed' and keeps the row, so past reactions and memories still name the person; only
-- people without an account of their own are removed here (someone with an account leaves from their own phone).

create or replace function public.add_household_member(p_household_id uuid, p_member jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_member uuid;
  v_name text := btrim(coalesce(p_member ->> 'display_name', ''));
  v_age text := coalesce(nullif(p_member ->> 'age_group', ''), 'adult');
  v_diet text := nullif(p_member ->> 'diet', '');
  v_spice smallint;
  v_language text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not private.has_household_role(p_household_id, array['owner', 'admin']) then
    raise exception 'only the kitchen''s owner can add people' using errcode = '42501';
  end if;
  if v_name = '' or char_length(v_name) > 40 then
    raise exception 'a name has 1 to 40 characters' using errcode = '22023';
  end if;
  if v_age not in ('child', 'teen', 'adult', 'elder') then
    raise exception 'unknown age group' using errcode = '22023';
  end if;
  if v_diet is not null and v_diet not in ('veg', 'eggetarian', 'nonveg', 'jain', 'vegan') then
    raise exception 'unknown diet' using errcode = '22023';
  end if;
  v_spice := case when jsonb_typeof(p_member -> 'spice') = 'number'
                  then least(5, greatest(1, round((p_member ->> 'spice')::numeric)))::smallint
                  else case when v_age = 'child' then 2 else 3 end end;

  -- One add at a time per kitchen, so two phones can't both add the 13th person.
  perform 1 from public.households where id = p_household_id for update;
  if (select count(*) from public.household_members
       where household_id = p_household_id and status = 'active') >= 12 then
    raise exception 'a household has up to 12 members' using errcode = '22023';
  end if;

  -- The new person hears Cookmate in the language of whoever added them.
  select vp.language_code into v_language
    from public.voice_profiles vp
    join public.household_members m on m.id = vp.member_id
   where m.household_id = p_household_id and m.user_id = v_uid;

  insert into public.household_members (household_id, user_id, display_name, role, age_group, diet)
  values (p_household_id, null, v_name, 'dependent', v_age, v_diet)
  returning id into v_member;

  insert into public.voice_profiles (member_id, household_id, language_code)
  values (v_member, p_household_id, coalesce(v_language, 'en-IN'));

  insert into public.taste_profiles (member_id, household_id, spice)
  values (v_member, p_household_id, v_spice);

  return v_member;
end $$;

create or replace function public.update_household_member(p_member_id uuid, p_changes jsonb)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_house uuid;
  v_user uuid;
  v_name text;
  v_age text;
  v_diet text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select household_id, user_id into v_house, v_user
    from public.household_members where id = p_member_id and status = 'active';
  if v_house is null
     or not (private.has_household_role(v_house, array['owner', 'admin']) or v_user = v_uid) then
    raise exception 'only the kitchen''s owner can change this person' using errcode = '42501';
  end if;

  if p_changes ? 'display_name' then
    v_name := btrim(coalesce(p_changes ->> 'display_name', ''));
    if v_name = '' or char_length(v_name) > 40 then
      raise exception 'a name has 1 to 40 characters' using errcode = '22023';
    end if;
    update public.household_members set display_name = v_name where id = p_member_id;
  end if;
  if p_changes ? 'age_group' then
    v_age := p_changes ->> 'age_group';
    if v_age is null or v_age not in ('child', 'teen', 'adult', 'elder') then
      raise exception 'unknown age group' using errcode = '22023';
    end if;
    update public.household_members set age_group = v_age where id = p_member_id;
  end if;
  if p_changes ? 'diet' then
    v_diet := nullif(p_changes ->> 'diet', '');
    if v_diet is not null and v_diet not in ('veg', 'eggetarian', 'nonveg', 'jain', 'vegan') then
      raise exception 'unknown diet' using errcode = '22023';
    end if;
    update public.household_members set diet = v_diet where id = p_member_id;
  end if;
  if p_changes ? 'spice' then
    if jsonb_typeof(p_changes -> 'spice') <> 'number' then
      raise exception 'spice is 1 to 5' using errcode = '22023';
    end if;
    insert into public.taste_profiles (member_id, household_id, spice)
    values (p_member_id, v_house, least(5, greatest(1, round((p_changes ->> 'spice')::numeric)))::smallint)
    on conflict (member_id) do update set spice = excluded.spice;
  end if;
end $$;

create or replace function public.remove_household_member(p_member_id uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_house uuid;
  v_user uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select household_id, user_id into v_house, v_user
    from public.household_members where id = p_member_id and status = 'active';
  if v_house is null or not private.has_household_role(v_house, array['owner', 'admin']) then
    raise exception 'only the kitchen''s owner can remove people' using errcode = '42501';
  end if;
  if v_user is not null then
    raise exception 'someone with their own account leaves from their own phone' using errcode = '42501';
  end if;
  update public.household_members set status = 'removed' where id = p_member_id;
end $$;

revoke all on function public.add_household_member(uuid, jsonb) from public, anon;
revoke all on function public.update_household_member(uuid, jsonb) from public, anon;
revoke all on function public.remove_household_member(uuid) from public, anon;
grant execute on function public.add_household_member(uuid, jsonb) to authenticated;
grant execute on function public.update_household_member(uuid, jsonb) to authenticated;
grant execute on function public.remove_household_member(uuid) to authenticated;
