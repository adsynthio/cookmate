-- "I changed something" (KIT-075, COOK-07): the cook says what they did differently; it is kept on the session with
-- notes for the steps still to come, and logged. Invoker rights: row-level security decides who may touch the session.

create or replace function public.log_session_change(
  p_session uuid,
  p_change text,
  p_notes jsonb default '[]'::jsonb,
  p_channel text default 'touch'
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_s public.cooking_sessions%rowtype;
  v_total integer;
  v_change text := left(btrim(coalesce(p_change, '')), 300);
  v_notes jsonb;
  v_entry jsonb;
begin
  select * into v_s from public.cooking_sessions where id = p_session for update;
  if v_s.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_s.status not in ('active', 'paused') then
    raise exception 'session is not in progress' using errcode = '22023';
  end if;
  if v_change = '' then
    raise exception 'say what changed' using errcode = '22023';
  end if;
  select count(*) into v_total from public.recipe_steps where recipe_id = coalesce(v_s.adapted_recipe_id, v_s.recipe_id);

  -- Keep only well-formed notes for steps that are still ahead, at most three.
  select coalesce(jsonb_agg(jsonb_build_object('step', (n ->> 'step')::int, 'note', left(btrim(n ->> 'note'), 200))), '[]'::jsonb)
    into v_notes
    from (
      select n from jsonb_array_elements(case when jsonb_typeof(p_notes) = 'array' then p_notes else '[]'::jsonb end) n
       where jsonb_typeof(n) = 'object' and (n ->> 'step') ~ '^[0-9]+$' and btrim(coalesce(n ->> 'note', '')) <> ''
         and (n ->> 'step')::int > v_s.current_step and (n ->> 'step')::int <= v_total
       limit 3
    ) kept;

  v_entry := jsonb_build_object('step', v_s.current_step, 'change', v_change, 'notes', v_notes, 'at', now());
  update public.cooking_sessions
     set modifications = modifications || jsonb_build_array(v_entry), last_activity_at = now()
   where id = p_session;
  insert into public.session_events (household_id, session_id, event_type, step_no, channel, payload)
  values (v_s.household_id, p_session, 'modification', v_s.current_step,
          case when p_channel = 'voice' then 'voice' else 'touch' end,
          jsonb_build_object('notes', jsonb_array_length(v_notes)));
  return v_entry;
end $$;

revoke all on function public.log_session_change(uuid, text, jsonb, text) from public, anon;
grant execute on function public.log_session_change(uuid, text, jsonb, text) to authenticated;
comment on function public.log_session_change(uuid, text, jsonb, text) is
  'Record a change the cook made mid-recipe, with notes for the steps still ahead. Invoker rights.';
