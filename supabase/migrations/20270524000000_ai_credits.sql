-- T1, AI credits: the AI features that cost real money pause at zero instead of running up the bill.
--
-- 1 credit = ₹1 of real AI cost. Each ai_requests row is priced with private.usage_cost_inr and taken off its
-- kitchen's credits by the trigger below, so nothing in the Edge Functions has to count.
--   - A new kitchen starts with 50 credits (the trial). They don't expire.
--   - Every kitchen also gets 5 free credits a day (midnight India time). They're used first and don't pile up.
--   - At zero, the Edge Functions skip the model: photo scans, Ask Cookmate, new dishes and family recipes answer
--     402 out_of_credits (the app says when the free credits come back); AI picks and adapting a recipe quietly use
--     their rules.
--   - Free and never paused (private.ai_task_is_free): the safety review, help while cooking (questions, changes,
--     rescue, the photo check), understanding typed text, learning from cooking and read-aloud audio. Each costs
--     under 2 paise.
--   - A call can cost more than what's left; the balance stops at zero instead of going below.
--
-- Owner tools, from the SQL editor:
--   select private.add_ai_credits('<household id>', 100);      -- a top-up
--   select private.set_ai_unlimited('<household id>', true);   -- the owner's and testers' kitchens: never paused
--   select household_id, balance, daily_used, daily_on, unlimited, spent_total from public.ai_credits;
--   alter table public.ai_credits alter column balance set default 100;  -- a different trial for new kitchens

create table public.ai_credits (
  household_id uuid not null,
  balance numeric(12,4) default 50 not null,
  daily_allowance numeric(8,2) default 5 not null,
  daily_used numeric(12,4) default 0 not null,
  daily_on date,
  unlimited boolean default false not null,
  spent_total numeric(14,4) default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint ai_credits_pkey primary key (household_id),
  constraint ai_credits_household_fkey foreign key (household_id) references public.households (id) on delete cascade,
  constraint ai_credits_amounts_check check (balance >= 0 and daily_allowance >= 0 and daily_used >= 0 and spent_total >= 0)
);
comment on table public.ai_credits is
  'AI credits per kitchen (T1): trial and top-ups left, today''s free credits used, the owner''s unlimited switch. Retention: until household deletion.';

alter table public.ai_credits enable row level security;
create policy ai_credits_member_select on public.ai_credits for select to authenticated
  using (private.is_household_member(household_id));
-- No direct writes: spending happens in the trigger below, top-ups through the owner tools.
revoke all on public.ai_credits from anon, authenticated;
grant select on public.ai_credits to authenticated;
grant all on public.ai_credits to service_role;

-- What a kitchen has left right now, read as the signed-in cook (the app's meter and the Edge Functions' check).
-- Security invoker: RLS shows a member their own kitchen only. A kitchen without a row yet has the defaults.
create or replace function public.ai_credits_left(p_household_id uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'balance', round(coalesce(c.balance, 50), 2),
    'daily_left', round(d.daily_left, 2),
    'daily_allowance', coalesce(c.daily_allowance, 5),
    'unlimited', coalesce(c.unlimited, false),
    'allowed', coalesce(c.unlimited, false) or d.daily_left > 0 or coalesce(c.balance, 50) > 0,
    'refills_at', ((t.today + 1)::timestamp at time zone 'Asia/Kolkata')
  )
  from (select (now() at time zone 'Asia/Kolkata')::date as today) t
  left join public.ai_credits c on c.household_id = p_household_id
  cross join lateral (
    select greatest(0, coalesce(c.daily_allowance, 5) - case when c.daily_on = t.today then c.daily_used else 0 end) as daily_left
  ) d
$$;
revoke all on function public.ai_credits_left(uuid) from public, anon;
grant execute on function public.ai_credits_left(uuid) to authenticated, service_role;

-- Tasks that never cost credits and are never paused. Everything else is paid, so a new AI feature is paid by default.
create or replace function private.ai_task_is_free(p_task text)
returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_task = any (array[
    'review_recipe_safety', 'craving_interpret', 'parse_inventory_text', 'learn_from_cooking',
    'cook_question', 'cook_change', 'rescue_fix', 'photo_check', 'tts_cache'
  ]), false)
$$;

-- Takes one call's cost off a kitchen: today's free credits first, then the trial and top-ups, never below zero.
-- An unlimited kitchen only counts what it spent.
create or replace function private.spend_ai_credits(p_household uuid, p_cost numeric)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  c public.ai_credits%rowtype;
  v_used numeric;
  v_from_daily numeric;
begin
  if p_household is null or coalesce(p_cost, 0) <= 0 then
    return;
  end if;
  insert into public.ai_credits (household_id) values (p_household) on conflict (household_id) do nothing;
  select * into c from public.ai_credits where household_id = p_household for update;
  if not found then
    return;
  end if;
  v_used := case when c.daily_on = v_today then c.daily_used else 0 end;
  v_from_daily := case when c.unlimited then p_cost else least(p_cost, greatest(0, c.daily_allowance - v_used)) end;
  update public.ai_credits
     set daily_on = v_today,
         daily_used = v_used + v_from_daily,
         balance = case when c.unlimited then balance else greatest(0, balance - (p_cost - v_from_daily)) end,
         spent_total = spent_total + p_cost,
         updated_at = now()
   where household_id = p_household;
end $$;
revoke all on function private.spend_ai_credits(uuid, numeric) from public, anon, authenticated;

create or replace function private.ai_requests_spend_credits()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.household_id is not null and not private.ai_task_is_free(new.task) then
    begin
      perform private.spend_ai_credits(
        new.household_id,
        private.usage_cost_inr(new.model, coalesce(new.input_tokens, 0), coalesce(new.cached_tokens, 0), coalesce(new.output_tokens, 0))
      );
    exception when others then
      -- The log row matters more than the credits: never lose it over them.
      raise warning 'AI credits not taken for household %: %', new.household_id, sqlerrm;
    end;
  end if;
  return null;
end $$;
revoke all on function private.ai_requests_spend_credits() from public, anon, authenticated;
create trigger ai_requests_spend_credits after insert on public.ai_requests
  for each row execute function private.ai_requests_spend_credits();

-- Every new kitchen starts with the trial; kitchens that already exist get the same start.
create or replace function private.households_start_ai_credits()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ai_credits (household_id) values (new.id) on conflict (household_id) do nothing;
  return null;
end $$;
revoke all on function private.households_start_ai_credits() from public, anon, authenticated;
create trigger households_start_ai_credits after insert on public.households
  for each row execute function private.households_start_ai_credits();

insert into public.ai_credits (household_id) select id from public.households on conflict (household_id) do nothing;

-- Owner tools (SQL editor only).
create or replace function private.add_ai_credits(p_household uuid, p_amount numeric)
returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then
    raise exception 'a top-up is more than 0 and at most 100000 credits' using errcode = '22023';
  end if;
  insert into public.ai_credits (household_id) values (p_household) on conflict (household_id) do nothing;
  update public.ai_credits set balance = balance + p_amount, updated_at = now()
   where household_id = p_household returning balance into v_balance;
  return v_balance;
end $$;
revoke all on function private.add_ai_credits(uuid, numeric) from public, anon, authenticated;

create or replace function private.set_ai_unlimited(p_household uuid, p_on boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ai_credits (household_id) values (p_household) on conflict (household_id) do nothing;
  update public.ai_credits set unlimited = coalesce(p_on, false), updated_at = now() where household_id = p_household;
  return coalesce(p_on, false);
end $$;
revoke all on function private.set_ai_unlimited(uuid, boolean) from public, anon, authenticated;
