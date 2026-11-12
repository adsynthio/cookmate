-- Community, first version: private cooking circles (family and friends), not a public feed.
-- A household creates a circle and shares an invite code; other households join with it. Members share dishes
-- they cooked (the recipe, their changes and a short note), see each other's dishes, and save them. Anyone can
-- report a post (it disappears for them at once, and for everyone after three reports); the author and the circle
-- owner can remove it. Nothing is shared unless the cook shares it. All writes go through the functions below.

create table public.community_circles (
  id uuid default gen_random_uuid() primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by_household uuid references public.households (id) on delete set null,
  created_at timestamptz default now() not null
);

create table public.community_members (
  circle_id uuid not null references public.community_circles (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  role text default 'member' not null check (role in ('owner', 'member')),
  -- How this household is shown in the circle ("Sunita's kitchen"); chosen by the household.
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  joined_at timestamptz default now() not null,
  primary key (circle_id, household_id)
);
create index community_members_household_idx on public.community_members (household_id);

create table public.community_invites (
  code text primary key check (code ~ '^[A-Z2-9]{8}$'),
  circle_id uuid not null references public.community_circles (id) on delete cascade,
  created_by_household uuid references public.households (id) on delete set null,
  created_at timestamptz default now() not null,
  expires_at timestamptz not null
);
create index community_invites_circle_idx on public.community_invites (circle_id);

create table public.community_posts (
  id uuid default gen_random_uuid() primary key,
  circle_id uuid not null references public.community_circles (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  author_name text not null,
  recipe_id uuid references public.recipes (id) on delete set null,
  recipe_slug text,
  dish_title text not null check (char_length(btrim(dish_title)) between 1 and 80),
  note text check (note is null or char_length(note) <= 500),
  changes text[] default '{}' not null check (cardinality(changes) <= 6),
  created_at timestamptz default now() not null,
  removed_at timestamptz
);
create index community_posts_feed_idx on public.community_posts (circle_id, created_at desc) where removed_at is null;
create index community_posts_household_idx on public.community_posts (household_id, created_at desc);

create table public.community_reports (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  reason text not null check (reason in ('spam', 'unsafe', 'offensive', 'other')),
  created_at timestamptz default now() not null,
  primary key (post_id, household_id)
);

-- Every foreign key has an index, so deleting a household or recipe doesn't scan these tables.
create index community_circles_created_by_idx on public.community_circles (created_by_household);
create index community_invites_created_by_idx on public.community_invites (created_by_household);
create index community_posts_circle_idx on public.community_posts (circle_id);
create index community_posts_recipe_idx on public.community_posts (recipe_id);
create index community_reports_household_idx on public.community_reports (household_id);

alter table public.community_circles enable row level security;
alter table public.community_members enable row level security;
alter table public.community_invites enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_reports enable row level security;

-- Anon reads nothing; signed-in users only read (rows their policies allow) and write through the functions.
revoke all on public.community_circles, public.community_members, public.community_invites, public.community_posts,
  public.community_reports from anon;
revoke insert, update, delete, truncate on public.community_circles, public.community_members, public.community_invites,
  public.community_posts, public.community_reports from authenticated;

create or replace function private.is_circle_member(p_circle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_members cm
     where cm.circle_id = p_circle and private.is_household_member(cm.household_id)
  );
$$;
revoke all on function private.is_circle_member(uuid) from public, anon;
grant execute on function private.is_circle_member(uuid) to authenticated, service_role;

-- Reads only; every write is a function call that checks who is asking.
create policy community_circles_member_select on public.community_circles for select to authenticated
  using (private.is_circle_member(id));
create policy community_members_member_select on public.community_members for select to authenticated
  using (private.is_circle_member(circle_id));
create policy community_invites_member_select on public.community_invites for select to authenticated
  using (private.is_circle_member(circle_id));
create policy community_posts_member_select on public.community_posts for select to authenticated
  using (removed_at is null and private.is_circle_member(circle_id));
create policy community_reports_own_select on public.community_reports for select to authenticated
  using (private.is_household_member(household_id));

-- Limits that keep a circle a circle.
create or replace function private.community_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select '{"circles_per_household": 10, "households_per_circle": 30, "posts_per_day": 20, "invite_days": 7, "reports_to_remove": 3}'::jsonb
$$;

create or replace function private.community_require(p_household uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not private.is_household_member(p_household) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
end $$;

create or replace function public.community_create_circle(p_household uuid, p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_circle uuid;
begin
  perform private.community_require(p_household);
  if (select count(*) from public.community_members where household_id = p_household)
     >= (private.community_limits() ->> 'circles_per_household')::int then
    raise exception 'too many circles' using errcode = '54000';
  end if;
  insert into public.community_circles (name, created_by_household) values (btrim(p_name), p_household)
  returning id into v_circle;
  insert into public.community_members (circle_id, household_id, role, display_name)
  values (v_circle, p_household, 'owner', btrim(p_display_name));
  return v_circle;
end $$;

create or replace function public.community_create_invite(p_circle uuid, p_household uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  perform private.community_require(p_household);
  if not exists (select 1 from public.community_members where circle_id = p_circle and household_id = p_household) then
    raise exception 'not in this circle' using errcode = '42501';
  end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '') into v_code from generate_series(1, 8);
    exit when not exists (select 1 from public.community_invites where code = v_code);
  end loop;
  insert into public.community_invites (code, circle_id, created_by_household, expires_at)
  values (v_code, p_circle, p_household, now() + make_interval(days => (private.community_limits() ->> 'invite_days')::int));
  return v_code;
end $$;

create or replace function public.community_join(p_code text, p_household uuid, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_circle uuid;
begin
  perform private.community_require(p_household);
  select circle_id into v_circle from public.community_invites
   where code = upper(btrim(p_code)) and expires_at > now();
  if v_circle is null then
    raise exception 'invite not found or expired' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.community_members where circle_id = v_circle and household_id = p_household) then
    return v_circle;
  end if;
  if (select count(*) from public.community_members where circle_id = v_circle)
     >= (private.community_limits() ->> 'households_per_circle')::int then
    raise exception 'circle is full' using errcode = '54000';
  end if;
  if (select count(*) from public.community_members where household_id = p_household)
     >= (private.community_limits() ->> 'circles_per_household')::int then
    raise exception 'too many circles' using errcode = '54000';
  end if;
  insert into public.community_members (circle_id, household_id, role, display_name)
  values (v_circle, p_household, 'member', btrim(p_display_name));
  return v_circle;
end $$;

-- Leaving keeps the circle going for everyone else: the longest-standing member becomes owner, and a circle with
-- nobody left is deleted with its posts.
create or replace function public.community_leave(p_circle uuid, p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_was_owner boolean;
begin
  perform private.community_require(p_household);
  delete from public.community_members where circle_id = p_circle and household_id = p_household
  returning role = 'owner' into v_was_owner;
  if not exists (select 1 from public.community_members where circle_id = p_circle) then
    delete from public.community_circles where id = p_circle;
  elsif v_was_owner then
    update public.community_members set role = 'owner'
     where (circle_id, household_id) = (
       select circle_id, household_id from public.community_members where circle_id = p_circle order by joined_at limit 1);
  end if;
end $$;

create or replace function public.community_share(
  p_circle uuid, p_household uuid, p_recipe_id uuid, p_recipe_slug text, p_dish_title text, p_note text, p_changes text[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_post uuid;
begin
  perform private.community_require(p_household);
  select display_name into v_name from public.community_members where circle_id = p_circle and household_id = p_household;
  if v_name is null then
    raise exception 'not in this circle' using errcode = '42501';
  end if;
  if (select count(*) from public.community_posts where household_id = p_household and created_at > now() - interval '1 day')
     >= (private.community_limits() ->> 'posts_per_day')::int then
    raise exception 'too many posts today' using errcode = '54000';
  end if;
  -- Only a dish this household can see may be linked (a curated recipe or its own).
  if p_recipe_id is not null and not exists (
    select 1 from public.recipes r where r.id = p_recipe_id and (r.household_id is null or r.household_id = p_household)) then
    p_recipe_id := null;
  end if;
  insert into public.community_posts (circle_id, household_id, author_name, recipe_id, recipe_slug, dish_title, note, changes)
  values (p_circle, p_household, v_name, p_recipe_id, nullif(btrim(p_recipe_slug), ''), btrim(p_dish_title),
          nullif(btrim(p_note), ''),
          coalesce((select array_agg(left(btrim(c), 80)) from unnest(p_changes) c where btrim(c) <> ''), '{}'))
  returning id into v_post;
  return v_post;
end $$;

create or replace function public.community_remove_post(p_post uuid, p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.community_require(p_household);
  update public.community_posts p set removed_at = now()
   where p.id = p_post and p.removed_at is null
     and (p.household_id = p_household
          or exists (select 1 from public.community_members m
                      where m.circle_id = p.circle_id and m.household_id = p_household and m.role = 'owner'));
  if not found then
    raise exception 'cannot remove this post' using errcode = '42501';
  end if;
end $$;

create or replace function public.community_report(p_post uuid, p_household uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_circle uuid;
begin
  perform private.community_require(p_household);
  select circle_id into v_circle from public.community_posts where id = p_post;
  if v_circle is null or not exists (select 1 from public.community_members where circle_id = v_circle and household_id = p_household) then
    raise exception 'not in this circle' using errcode = '42501';
  end if;
  insert into public.community_reports (post_id, household_id, reason) values (p_post, p_household, p_reason)
  on conflict do nothing;
  if (select count(*) from public.community_reports where post_id = p_post)
     >= (private.community_limits() ->> 'reports_to_remove')::int then
    update public.community_posts set removed_at = now() where id = p_post and removed_at is null;
  end if;
end $$;

-- The feed: dishes shared in this household's circles (or one circle), newest first, minus anything removed or
-- reported by this household.
create or replace function public.community_feed(p_household uuid, p_circle uuid default null, p_limit int default 50)
returns table (id uuid, circle_id uuid, circle_name text, author_name text, recipe_id uuid, recipe_slug text,
               dish_title text, note text, changes text[], created_at timestamptz, mine boolean, can_remove boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.community_require(p_household);
  return query
    select p.id, p.circle_id, c.name, p.author_name, p.recipe_id, p.recipe_slug, p.dish_title, p.note, p.changes,
           p.created_at, p.household_id = p_household, (p.household_id = p_household or me.role = 'owner')
      from public.community_posts p
      join public.community_circles c on c.id = p.circle_id
      join public.community_members me on me.circle_id = p.circle_id and me.household_id = p_household
     where p.removed_at is null
       and (p_circle is null or p.circle_id = p_circle)
       and not exists (select 1 from public.community_reports r where r.post_id = p.id and r.household_id = p_household)
     order by p.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $$;

-- This household's circles with who is in each; runs as the caller, so the read policies above decide.
create or replace function public.community_circles(p_household uuid)
returns table (id uuid, name text, role text, members jsonb)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, me.role,
         (select coalesce(jsonb_agg(jsonb_build_object('display_name', m.display_name, 'mine', m.household_id = p_household)
                                    order by m.joined_at), '[]'::jsonb)
            from public.community_members m where m.circle_id = c.id)
    from public.community_members me
    join public.community_circles c on c.id = me.circle_id
   where me.household_id = p_household
   order by me.joined_at;
$$;
revoke all on function public.community_circles(uuid) from public, anon;
grant execute on function public.community_circles(uuid) to authenticated;

revoke all on function private.community_limits() from public, anon;
revoke all on function private.community_require(uuid) from public, anon;
grant execute on function private.community_limits() to authenticated, service_role;
grant execute on function private.community_require(uuid) to authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array[
    'public.community_create_circle(uuid, text, text)', 'public.community_create_invite(uuid, uuid)',
    'public.community_join(text, uuid, text)', 'public.community_leave(uuid, uuid)',
    'public.community_share(uuid, uuid, uuid, text, text, text, text[])', 'public.community_remove_post(uuid, uuid)',
    'public.community_report(uuid, uuid, text)', 'public.community_feed(uuid, uuid, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
