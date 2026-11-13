-- Security review, November 2026 (findings 19-23 in docs/SECURITY_REVIEW.md).
--
-- 19. A plain member could promote themselves: the "admin or self" update policy on household_members let a member
--     change their own row's role (to owner), and then remove the real owner. Policies can't compare old and new
--     values, so a trigger now guards the columns that carry power: who the row belongs to, which household, the role
--     and the status. App users change them only as an owner or admin, only an owner makes or unmakes an owner, and
--     only an owner removes an owner. Server-side code (definer functions, the service role) is not affected.
-- 20. One account could create any number of households, which also gets round per-household limits. Now at most 5.
-- 21. Three plain functions in public were callable without signing in; they now need a signed-in user.
-- 22. household-media accepted any image type, including SVG (which can carry script). Now JPEG, PNG and WebP only.

-- 19 ---------------------------------------------------------------------------------------------------------------
create or replace function private.guard_member_change() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_house uuid := coalesce(old.household_id, new.household_id);
begin
  -- Only app users are limited; definer functions and the service role run as other roles.
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' and not private.has_household_role(v_house, array['owner']) then
      raise exception 'only an owner can remove an owner' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'owner' and not private.has_household_role(new.household_id, array['owner']) then
      raise exception 'only an owner can add an owner' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.household_id is distinct from old.household_id then
    raise exception 'a member can''t be moved to another household' using errcode = '42501';
  end if;
  if (new.role, new.user_id, new.status) is distinct from (old.role, old.user_id, old.status) then
    if not private.has_household_role(v_house, array['owner', 'admin']) then
      raise exception 'only an owner or admin can change roles, links or status' using errcode = '42501';
    end if;
    if (old.role = 'owner' or new.role = 'owner') and new.role is distinct from old.role
       and not private.has_household_role(v_house, array['owner']) then
      raise exception 'only an owner can make or unmake an owner' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists household_members_guard on public.household_members;
create trigger household_members_guard
  before insert or update or delete on public.household_members
  for each row execute function private.guard_member_change();

-- 20 ---------------------------------------------------------------------------------------------------------------
create or replace function private.guard_household_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- create_household runs as its owner, so the signed-in user is read from the request, not the role.
  if (select auth.uid()) is not null
     and (select count(*) from public.households h where h.created_by = (select auth.uid())) >= 5 then
    raise exception 'an account can create at most 5 households' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function private.guard_household_count() from public, anon, authenticated;

drop trigger if exists households_count_guard on public.households;
create trigger households_count_guard
  before insert on public.households
  for each row execute function private.guard_household_count();

-- 21 ---------------------------------------------------------------------------------------------------------------
-- They were callable through the default PUBLIC grant, which anon inherits.
revoke execute on function public.clear_pantry_guesses from public, anon;
revoke execute on function public.guess_pantry_from_recipe from public, anon;
revoke execute on function public.search_recipes from public, anon;
grant execute on function public.clear_pantry_guesses to authenticated, service_role;
grant execute on function public.guess_pantry_from_recipe to authenticated, service_role;
grant execute on function public.search_recipes to authenticated, service_role;
-- And the default for anything created later in public: no EXECUTE for anon unless granted on purpose.
alter default privileges in schema public revoke execute on functions from public, anon;

-- 22 ---------------------------------------------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'household-media';
