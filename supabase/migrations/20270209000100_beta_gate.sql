-- Beta gate review (KIT-152, PRD §15, BRD §3): the launch targets worked out from the database, so the review reads
-- real numbers even where product analytics are switched off (analytics need each household's consent; these rows
-- exist for everyone). Service role only. Each row: the KPI, its value, the target, whether it is met, and how many
-- things the value was measured on (a target met on 3 sessions is not met).
--
-- value and target are ratios (0..1) except: cooking_frequency (sessions per active household per week),
-- voice_latency_* (milliseconds), pantry_trust (corrections per household per week), voice_cost (rupees).

create or replace function private.beta_gate_report(p_from timestamptz, p_to timestamptz)
returns table (kpi text, value numeric, target numeric, met boolean, sample bigint, definition text)
language sql stable security definer set search_path = '' as $$
  with weeks as (
    select greatest(extract(epoch from (p_to - p_from)) / 604800.0, 1.0 / 7)::numeric as n
  ),
  batches as (
    select r.batch_id, bool_or(r.status in ('accepted', 'cooked')) as taken
      from public.recommendations r
     where r.created_at >= p_from and r.created_at < p_to
     group by r.batch_id
  ),
  done as (
    select s.* from public.cooking_sessions s
     where s.status = 'completed' and s.completed_at >= p_from and s.completed_at < p_to
  ),
  active as (
    select household_id from public.cooking_sessions where started_at >= p_from and started_at < p_to
    union
    select household_id from public.recommendations where created_at >= p_from and created_at < p_to
  ),
  -- Households old enough for their first week to be over.
  cohort7 as (
    select h.id, h.created_at from public.households h
     where h.created_at >= p_from and h.created_at < p_to - interval '7 days'
  ),
  cohort30 as (
    select h.id, h.created_at from public.households h
     where h.created_at >= p_from - interval '30 days' and h.created_at < p_to - interval '35 days'
  ),
  voice_done as (
    select d.id,
           not exists (select 1 from public.session_events e
                        where e.session_id = d.id and e.channel = 'touch'
                          and e.event_type in ('step_next', 'step_back', 'repeat')) as no_taps
      from done d where d.mode in ('voice', 'hands_free')
  ),
  turns as (
    select e.latency_ms from public.session_events e
     where e.created_at >= p_from and e.created_at < p_to and e.payload ->> 'kind' = 'voice_turn'
  ),
  fixes as (
    select count(*) as n, count(distinct household_id) as households
      from public.inventory_events
     where created_at >= p_from and created_at < p_to
       and event_type in ('corrected', 'adjusted') and actor_kind in ('user', 'voice')
  ),
  -- Things that were due to spoil in the window: used in cooking by the day after their date, or not.
  at_risk as (
    select i.id,
           exists (select 1 from public.inventory_events e
                    where e.item_id = i.id and e.event_type = 'consumed'
                      and e.created_at < (i.expiry_date + 2)::timestamptz) as used
      from public.inventory_items i
     where i.expiry_date >= p_from::date and i.expiry_date < p_to::date and i.staple_level is null
  ),
  voice as (
    select cost_inr from public.voice_sessions
     where ended_at >= p_from and ended_at < p_to and cost_inr is not null
  ),
  rescued as (
    select distinct s.id, s.status
      from public.session_events e
      join public.cooking_sessions s on s.id = e.session_id
     where e.event_type = 'rescue' and e.created_at >= p_from and e.created_at < p_to
       and s.status in ('completed', 'abandoned')
  ),
  rows as (
    select 1 as ord, 'pick_acceptance' as kpi,
           (select round(avg(taken::int), 3) from batches) as value, 0.40 as target, '>=' as dir,
           (select count(*) from batches) as sample,
           'Sets of picks where one was accepted or cooked / sets shown' as definition
    union all
    select 2, 'cooking_frequency',
           (select round(count(*) / nullif((select count(*) from active), 0) / (select n from weeks), 2) from done), 3, '>=',
           (select count(*) from active),
           'Completed cooking sessions per active household per week'
    union all
    select 3, 'activation',
           (select round(avg((exists (select 1 from public.cooking_sessions s
                                       where s.household_id = c.id and s.status = 'completed'
                                         and s.completed_at < c.created_at + interval '7 days'))::int), 3) from cohort7 c),
           0.40, '>=', (select count(*) from cohort7),
           'New households that finished a guided dish within 7 days'
    union all
    select 4, 'hands_free_rate', (select round(avg(no_taps::int), 3) from voice_done), 0.60, '>=',
           (select count(*) from voice_done),
           'Completed voice sessions with no step taps after starting'
    union all
    select 5, 'voice_latency_p50_ms', (select round((percentile_cont(0.5) within group (order by latency_ms))::numeric) from turns),
           (select value from private.telemetry_settings where key = 'voice_p50_target_ms'), '<=', (select count(*) from turns),
           'End of speech to first audio, median over voice turns'
    union all
    select 6, 'voice_latency_p95_ms', (select round((percentile_cont(0.95) within group (order by latency_ms))::numeric) from turns),
           (select value from private.telemetry_settings where key = 'voice_p95_target_ms'), '<=', (select count(*) from turns),
           'End of speech to first audio, 95th percentile over voice turns'
    union all
    select 7, 'pantry_trust',
           (select round(n / nullif((select count(*) from active), 0) / (select n from weeks), 2) from fixes), 5, '<=',
           (select count(*) from active),
           'Pantry corrections per active household per week'
    union all
    select 8, 'waste_rescue', (select round(avg(used::int), 3) from at_risk), 0.50, '>=', (select count(*) from at_risk),
           'Items due to spoil that were cooked by the day after their date'
    union all
    select 9, 'retention_d30',
           (select round(avg((exists (select 1 from public.cooking_sessions s where s.household_id = c.id
                                         and s.started_at >= c.created_at + interval '28 days' and s.started_at < c.created_at + interval '35 days')
                              or exists (select 1 from public.recommendations r where r.household_id = c.id
                                         and r.created_at >= c.created_at + interval '28 days' and r.created_at < c.created_at + interval '35 days'))::int), 3)
              from cohort30 c),
           0.25, '>=', (select count(*) from cohort30),
           'Households still using the app in their fifth week (days 28 to 35)'
    union all
    select 10, 'voice_cost_inr', (select round(avg(cost_inr), 2) from voice),
           (select value from private.telemetry_settings where key = 'voice_budget_inr'), '<=', (select count(*) from voice),
           'Average variable cost of a voice session, in rupees'
    union all
    select 11, 'rescue_success', (select round(avg((status = 'completed')::int), 3) from rescued), 0.80, '>=',
           (select count(*) from rescued),
           'Sessions finished after asking for a rescue / sessions that asked'
  )
  select r.kpi, r.value, r.target,
         case when r.value is null then null when r.dir = '>=' then r.value >= r.target else r.value <= r.target end,
         r.sample, r.definition
    from rows r order by r.ord
$$;
revoke all on function private.beta_gate_report(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function private.beta_gate_report(timestamptz, timestamptz) to service_role;
