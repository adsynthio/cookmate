-- Telemetry (KIT-069 voice latency and cost, KIT-132 AI request logging and the weekly cost report).
--
-- * private.usage_prices: what each model or speech service costs per million units, in USD or INR. Edit the rows
--   when prices change; reports read them at query time, so nothing needs re-running.
-- * ai_requests stays as generated: for speech services input_tokens holds the units billed (characters for TTS,
--   seconds for STT). Cache writes are counted in input_tokens at the base input price (a slight under-count:
--   writes cost 1.25x).
-- * public.record_voice_session: the voice agent closes its voice_sessions row with usage, p50/p95 latency and
--   cost, logs the session's model and speech usage to ai_requests, and records each turn's latency as a voice
--   session event when the voice session was cooking. Callable only by a member of the household, once.
-- * private.ai_cost_report / private.voice_report: the weekly report and dashboard queries (service role only).

create table private.usage_prices (
  model text primary key,
  unit text not null check (unit in ('token', 'character', 'second')),
  currency text not null default 'USD' check (currency in ('USD', 'INR')),
  input_per_million numeric not null default 0,
  cached_per_million numeric not null default 0,
  output_per_million numeric not null default 0,
  note text,
  updated_at timestamptz not null default now()
);
comment on table private.usage_prices is 'Price per million units (tokens, characters or seconds) for each model or speech service. Edit when prices change.';

create table private.telemetry_settings (key text primary key, value numeric not null, note text);
comment on table private.telemetry_settings is 'Numbers the reports use: the USD to INR rate and the per-session voice budget.';

insert into private.usage_prices (model, unit, currency, input_per_million, cached_per_million, output_per_million, note) values
  ('claude-haiku-5-5', 'token', 'USD', 0.10, 0.01, 0.50, 'Anthropic list price, prompts up to 100K tokens'),
  ('claude-sonnet-5-5', 'token', 'USD', 2.00, 0.10, 10.00, 'Anthropic list price'),
  ('claude-opus-5-5', 'token', 'USD', 4.00, 0.20, 20.00, 'Anthropic list price'),
  ('bulbul:v3', 'character', 'INR', 1500, 0, 0, 'Sarvam text to speech: planning figure of Rs 15 per 10,000 characters, to confirm against the Sarvam plan'),
  ('saaras:v3', 'second', 'INR', 8333.33, 0, 0, 'Sarvam speech to text: planning figure of Rs 30 per hour, to confirm against the Sarvam plan');

insert into private.telemetry_settings (key, value, note) values
  ('usd_inr', 88, 'Planning exchange rate (FX_INR_PER_USD in 13_env_and_secrets.csv)'),
  ('voice_budget_inr', 5, 'Variable cost target per 15-minute voice session (PLAN.md hard numbers)'),
  ('voice_p50_target_ms', 1000, 'Voice latency target, median'),
  ('voice_p95_target_ms', 1800, 'Voice latency target, 95th percentile');

revoke all on private.usage_prices, private.telemetry_settings from public, anon, authenticated;
grant select on private.usage_prices, private.telemetry_settings to service_role;

-- Cost in rupees of one usage line. Unknown models cost 0 (and show up in the report with no price).
create or replace function private.usage_cost_inr(p_model text, p_input numeric, p_cached numeric, p_output numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (coalesce(p_input, 0) * p.input_per_million + coalesce(p_cached, 0) * p.cached_per_million
            + coalesce(p_output, 0) * p.output_per_million) / 1e6
           * case p.currency when 'USD' then coalesce((select value from private.telemetry_settings where key = 'usd_inr'), 88) else 1 end
      from private.usage_prices p where p.model = p_model), 0)
$$;
revoke all on function private.usage_cost_inr(text, numeric, numeric, numeric) from public, anon, authenticated;

create or replace function public.record_voice_session(p_voice_session uuid, p_stats jsonb)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v public.voice_sessions%rowtype;
  n_turns int := greatest(0, coalesce((p_stats ->> 'turns')::int, 0));
  n_fast int := greatest(0, coalesce((p_stats ->> 'fast_path_turns')::int, 0));
  stt numeric := greatest(0, coalesce((p_stats ->> 'stt_seconds')::numeric, 0));
  tts int := greatest(0, coalesce((p_stats ->> 'tts_characters')::int, 0));
  tts_cached int := greatest(0, coalesce((p_stats ->> 'tts_cached_characters')::int, 0));
  llm_in int := greatest(0, coalesce((p_stats ->> 'llm_input_tokens')::int, 0));
  llm_cached int := greatest(0, coalesce((p_stats ->> 'llm_cached_tokens')::int, 0));
  llm_out int := greatest(0, coalesce((p_stats ->> 'llm_output_tokens')::int, 0));
  llm_model text := left(coalesce(p_stats ->> 'llm_model', 'claude-haiku-5-5'), 64);
  stt_model text := left(coalesce(p_stats ->> 'stt_model', 'saaras:v3'), 64);
  tts_model text := left(coalesce(p_stats ->> 'tts_model', 'bulbul:v3'), 64);
  p50 int := (p_stats ->> 'p50_latency_ms')::int;
  p95 int := (p_stats ->> 'p95_latency_ms')::int;
  cost numeric;
  turn jsonb;
begin
  select * into v from public.voice_sessions where id = p_voice_session;
  if v.id is null or private.current_member(v.household_id) is null then
    raise exception 'not your voice session' using errcode = '42501';
  end if;
  if v.ended_at is not null then
    raise exception 'voice session already recorded' using errcode = '23505';
  end if;

  cost := round(private.usage_cost_inr(llm_model, llm_in, llm_cached, llm_out)
              + private.usage_cost_inr(tts_model, tts, 0, 0)
              + private.usage_cost_inr(stt_model, stt, 0, 0), 2);

  update public.voice_sessions set
    ended_at = now(),
    end_reason = left(p_stats ->> 'end_reason', 40),
    language_detected = left(coalesce(p_stats ->> 'language', language_detected), 16),
    turns = n_turns,
    fast_path_turns = least(n_fast, n_turns),
    stt_seconds = stt,
    tts_characters = tts,
    tts_cached_characters = tts_cached,
    llm_input_tokens = llm_in,
    llm_cached_tokens = llm_cached,
    llm_output_tokens = llm_out,
    p50_latency_ms = p50,
    p95_latency_ms = p95,
    cost_inr = cost
  where id = v.id;

  insert into public.ai_requests (household_id, task, model, prompt_version, input_tokens, cached_tokens, output_tokens, latency_ms, status)
  select v.household_id, x.task, x.model, x.version, x.i, x.c, x.o, x.ms, 'ok'
    from (values
      ('voice_turns', llm_model, coalesce(p_stats ->> 'prompt_version', 'voice_system@1'), llm_in, llm_cached, llm_out, p50),
      ('voice_tts', tts_model, 'speech', tts, null::int, null::int, null::int),
      ('voice_stt', stt_model, 'speech', round(stt)::int, null::int, null::int, null::int)
    ) as x(task, model, version, i, c, o, ms)
   where coalesce(x.i, 0) + coalesce(x.c, 0) + coalesce(x.o, 0) > 0;

  -- Each turn's latency, on the cooking session it belonged to (at most 500 turns).
  if v.cooking_session_id is not null and jsonb_typeof(p_stats -> 'turn_latencies') = 'array' then
    for turn in select t from jsonb_array_elements(p_stats -> 'turn_latencies') t limit 500 loop
      insert into public.session_events (household_id, session_id, event_type, channel, latency_ms, payload)
      values (v.household_id, v.cooking_session_id,
              case when (turn ->> 'fast_path')::boolean then 'fast_path' else 'answer' end,
              'voice', greatest(0, (turn ->> 'ms')::int),
              jsonb_build_object('kind', 'voice_turn', 'voice_session_id', v.id));
    end loop;
  end if;
  return cost;
end $$;
revoke all on function public.record_voice_session(uuid, jsonb) from public, anon;
grant execute on function public.record_voice_session(uuid, jsonb) to authenticated;

-- Weekly cost by task and model (KIT-132).
create or replace function private.ai_cost_report(p_from timestamptz, p_to timestamptz)
returns table (task text, model text, requests bigint, failed bigint, input_units bigint, cached_tokens bigint,
               output_tokens bigint, p50_latency_ms int, cost_inr numeric, priced boolean)
language sql stable security definer set search_path = '' as $$
  select r.task, r.model, count(*), count(*) filter (where r.status <> 'ok'),
         coalesce(sum(r.input_tokens), 0)::bigint, coalesce(sum(r.cached_tokens), 0)::bigint, coalesce(sum(r.output_tokens), 0)::bigint,
         (percentile_cont(0.5) within group (order by r.latency_ms))::int,
         round(private.usage_cost_inr(r.model, sum(r.input_tokens), sum(r.cached_tokens), sum(r.output_tokens)), 2),
         exists (select 1 from private.usage_prices p where p.model = r.model)
    from public.ai_requests r
   where r.created_at >= p_from and r.created_at < p_to
   group by r.task, r.model
   order by 9 desc, 1
$$;

-- Voice latency and cost per day (KIT-069): p50/p95 over every recorded turn, cost per session against budget.
create or replace function private.voice_report(p_from timestamptz, p_to timestamptz)
returns table (day date, sessions bigint, turns bigint, fast_path_share numeric, p50_latency_ms int, p95_latency_ms int,
               avg_cost_inr numeric, p95_cost_inr numeric, over_budget bigint, cached_tts_share numeric)
language sql stable security definer set search_path = '' as $$
  with s as (
    select (vs.started_at at time zone 'Asia/Kolkata')::date as day, vs.*
      from public.voice_sessions vs
     where vs.started_at >= p_from and vs.started_at < p_to and vs.ended_at is not null
  ), t as (
    select (e.created_at at time zone 'Asia/Kolkata')::date as day, e.latency_ms
      from public.session_events e
     where e.created_at >= p_from and e.created_at < p_to and e.payload ->> 'kind' = 'voice_turn'
  )
  select s.day, count(*), sum(s.turns)::bigint,
         round(sum(s.fast_path_turns)::numeric / nullif(sum(s.turns), 0), 3),
         coalesce((select percentile_cont(0.5) within group (order by t.latency_ms) from t where t.day = s.day)::int,
                  (percentile_cont(0.5) within group (order by s.p50_latency_ms))::int),
         coalesce((select percentile_cont(0.95) within group (order by t.latency_ms) from t where t.day = s.day)::int,
                  (percentile_cont(0.95) within group (order by s.p95_latency_ms))::int),
         round(avg(s.cost_inr), 2),
         round((percentile_cont(0.95) within group (order by s.cost_inr))::numeric, 2),
         count(*) filter (where s.cost_inr > (select value from private.telemetry_settings where key = 'voice_budget_inr')),
         round(sum(s.tts_cached_characters)::numeric / nullif(sum(s.tts_characters + s.tts_cached_characters), 0), 3)
    from s group by s.day order by s.day
$$;

revoke all on function private.ai_cost_report(timestamptz, timestamptz), private.voice_report(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function private.ai_cost_report(timestamptz, timestamptz), private.voice_report(timestamptz, timestamptz),
  private.usage_cost_inr(text, numeric, numeric, numeric) to service_role;
