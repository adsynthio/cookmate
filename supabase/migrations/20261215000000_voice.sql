-- Voice context packet (KIT-062, VOICE-07): everything the voice agent should already know before the cook speaks,
-- so it never asks for it. Read with the user's own JWT (security invoker), so row-level security decides what is
-- visible; a caller outside the household gets an error, not an empty packet. Kept small on purpose: capped lists
-- and short text, so a typical household stays well under 3,000 tokens.

create or replace function public.get_voice_context(p_household uuid, p_member uuid default null, p_session uuid default null)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_member uuid;
  v_today date := private.kitchen_today();
  v_s public.cooking_sessions%rowtype;
  v_recipe uuid;
  v_total integer;
  v_session jsonb := null;
begin
  if not private.is_household_member(p_household) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  v_member := coalesce(p_member, private.current_member(p_household));
  if not exists (select 1 from public.household_members m where m.id = v_member and m.household_id = p_household and m.status = 'active') then
    raise exception 'member not found in this household' using errcode = 'P0002';
  end if;

  if p_session is not null then
    select * into v_s from public.cooking_sessions where id = p_session and household_id = p_household;
    if v_s.id is null then
      raise exception 'session not found' using errcode = 'P0002';
    end if;
    v_recipe := coalesce(v_s.adapted_recipe_id, v_s.recipe_id);
    select count(*) into v_total from public.recipe_steps where recipe_id = v_recipe;
    v_session := jsonb_build_object(
      'session_id', v_s.id,
      'status', v_s.status,
      'dish', (select r.title from public.recipes r where r.id = v_recipe),
      'servings', v_s.servings,
      'step', v_s.current_step,
      'total_steps', v_total,
      'current', (select jsonb_strip_nulls(jsonb_build_object(
                    'text', st.instruction, 'cue', st.sensory_cue, 'safety', st.safety_note,
                    'whistles', st.whistles, 'seconds', st.duration_sec))
                    from public.recipe_steps st where st.recipe_id = v_recipe and st.step_no = v_s.current_step),
      'next', (select st.instruction from public.recipe_steps st where st.recipe_id = v_recipe and st.step_no = v_s.current_step + 1),
      'eating', coalesce((select jsonb_agg(m.display_name order by m.created_at)
                            from public.household_members m where m.id = any (v_s.who_eating)), '[]'::jsonb),
      'ingredients', coalesce((select jsonb_agg(distinct g.canonical_name)
                                 from public.recipe_ingredients ri join public.ingredients g on g.id = ri.ingredient_id
                                where ri.recipe_id = v_recipe), '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'speaker', (
      select jsonb_strip_nulls(jsonb_build_object(
        'member_id', m.id, 'name', m.display_name, 'age_group', m.age_group, 'diet', m.diet, 'spice', tp.spice,
        'language', vp.language_code, 'dialect', vp.dialect, 'units', vp.units_system, 'pace', vp.pace,
        'verbosity', vp.verbosity, 'skill', vp.skill_level, 'hands_free', vp.hands_free_default))
        from public.household_members m
        left join public.voice_profiles vp on vp.member_id = m.id
        left join public.taste_profiles tp on tp.member_id = m.id
       where m.id = v_member),
    'household', jsonb_build_object(
      'name', (select h.name from public.households h where h.id = p_household),
      'members', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'name', m.display_name, 'age_group', m.age_group, 'diet', m.diet, 'spice', tp.spice, 'notes', left(m.notes, 120)))
               order by m.created_at)
          from public.household_members m left join public.taste_profiles tp on tp.member_id = m.id
         where m.household_id = p_household and m.status = 'active'), '[]'::jsonb)),
    'pantry', jsonb_build_object(
      -- What the household is sure about, soonest to spoil first.
      'items', coalesce((
        select jsonb_agg(x.item) from (
          select jsonb_strip_nulls(jsonb_build_object(
                   'name', coalesce(g.canonical_name, i.custom_name), 'qty', i.quantity, 'unit', i.unit,
                   'days_left', i.expiry_date - v_today)) as item
            from public.inventory_items i left join public.ingredients g on g.id = i.ingredient_id
           where i.household_id = p_household and i.status = 'active' and i.staple_level is null and i.confidence >= 0.5
           order by i.expiry_date nulls last, i.created_at
           limit 60) x), '[]'::jsonb),
      'staples_low', coalesce((
        select jsonb_agg(g.canonical_name order by g.canonical_name)
          from public.inventory_items i join public.ingredients g on g.id = i.ingredient_id
         where i.household_id = p_household and i.status = 'active' and i.staple_level = 'low'), '[]'::jsonb),
      'staples_out', coalesce((
        select jsonb_agg(g.canonical_name order by g.canonical_name)
          from public.inventory_items i join public.ingredients g on g.id = i.ingredient_id
         where i.household_id = p_household and i.status = 'active' and i.staple_level = 'out'), '[]'::jsonb),
      -- Guesses nobody confirmed: the agent may ask about these, never assume them.
      'unsure', coalesce((
        select jsonb_agg(x.name) from (
          select coalesce(g.canonical_name, i.custom_name) as name
            from public.inventory_items i left join public.ingredients g on g.id = i.ingredient_id
           where i.household_id = p_household and i.status = 'active' and i.staple_level is null and i.confidence < 0.5
           order by i.created_at desc
           limit 15) x), '[]'::jsonb)),
    'memories', coalesce((
      select jsonb_agg(x.memory) from (
        select jsonb_strip_nulls(jsonb_build_object(
                 'about', (select m.display_name from public.household_members m where m.id = mem.member_id),
                 'text', left(mem.statement, 160))) as memory
          from public.memories mem
         where mem.household_id = p_household and mem.status = 'active' and (mem.expires_at is null or mem.expires_at > now())
         order by mem.last_confirmed_at desc nulls last, mem.created_at desc
         limit 20) x), '[]'::jsonb),
    'session', v_session
  );
end $$;

revoke all on function public.get_voice_context(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_voice_context(uuid, uuid, uuid) to authenticated;
comment on function public.get_voice_context(uuid, uuid, uuid) is
  'Voice agent context packet: speaker profile, household, confident pantry, memories and the cooking session. Invoker rights; capped lists.';
