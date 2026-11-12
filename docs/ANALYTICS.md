# Analytics, cost and latency

What Cookmate measures, where each number comes from, and how to read it. Sprint 6 part 3 (KIT-069, KIT-130,
KIT-132, KIT-133).

## Product analytics (PostHog)

- **What is sent:** only the V1 events in `docs/architecture/12_analytics_events.csv`, with only the properties
  listed there. `apps/mobile/src/domain/analytics.ts` holds the same list, and a test fails if the two drift.
- **What is never sent:** names, transcripts, recipe free text, or pantry contents beyond counts (PRD §15). The app
  drops any value that isn't shaped like an id, a code or a number: a string with a space or an `@`, or one longer
  than 64 characters, is removed even under an allowed property name.
- **Identity:** the distinct id is the member id, and the household id is a property. There are no person
  profiles and no GeoIP lookup.
- **Consent:** nothing is sent unless the cook allowed analytics on the onboarding consent screen. Deleting the
  account clears the consent and any unsent events.
- **Turning it on:** set `EXPO_PUBLIC_POSTHOG_KEY`, and `EXPO_PUBLIC_POSTHOG_HOST` if not the EU cloud, in the
  EAS environment. In the PostHog project settings, also turn on "Discard client IP data".

### KPI dashboard (PRD §15)

Create one insight per row in PostHog and put them on a dashboard called "V1 beta KPIs".

| KPI | Beta target | Insight |
|---|---|---|
| Pick acceptance | ≥ 40% | Trends, formula: `pick_accepted` ÷ `pick_shown` (total count), weekly |
| Cooking frequency | ≥ 3 per week | Trends: `cook_completed` total ÷ unique `household_id` with `app_open`, weekly |
| Activation | ≥ 40% | Funnel: `onboarding_completed` → `cook_completed`, within 7 days, by `household_id` |
| Hands-free rate | ≥ 60% | Trends: `cook_completed` where `mode = voice` and `taps_after_start = 0`, ÷ `voice_session_started` |
| Voice latency | p50 ≤ 1.0 s | From the database (`voice_report`), see below. Turn latencies stay server-side |
| Pantry trust | ≤ 5 per household-week | Trends: `inventory_corrected` ÷ unique `household_id`, weekly |
| Waste rescue | ≥ 50% | Trends: `inventory_consumed.use_soon_items_count` ÷ `use_soon_shown.items_count` |
| Retention | ≥ 25% on day 30 | Retention: `onboarding_completed` → `app_open`, day 30, by `household_id` |
| Cost | ≤ ₹5 per session | From the database (`voice_report`), see below |
| Rescue success | ≥ 80% | Funnel: `rescue_requested` → `cook_completed`, same `session_id` |

Emitted from the service layer (`apps/mobile/src/services/tracked.ts`), so screens carry no tracking code:
`app_open`, `onboarding_completed`, `consent_changed`, `pick_shown`, `pick_accepted`, `pick_dismissed`,
`craving_submitted`, `inventory_added`, `inventory_corrected`, `inventory_consumed`, `use_soon_shown`,
`recipe_viewed`, `recipe_adapted`, `cook_started`, `cook_step`, `timer_set`, `rescue_requested`, `cook_completed`,
`cook_abandoned`, `feedback_submitted`, `memory_saved`, `memory_forgotten`, `voice_session_started`,
`list_item_added`, `list_items_bought` and `notification_opened`.

- `cook_completed` carries `duration_min`, `mode`, `taps_after_start` and `rescues` when the same launch of the app
  saw the session from start to finish (a session resumed after a restart sends only its id). Step moves made by a
  spoken command are sent with `channel: voice` and are not counted as taps.
- `pick_shown.source` is `home`, `craving` or `push` (opened from the daily notification).

Not emitted yet: `onboarding_step`, `checkpoint_used` (no photo checkpoint yet), and `voice_turn` /
`voice_session_ended` (the voice agent records these in the database instead; see below).

### Beta targets without analytics consent

Product analytics only cover households that agreed to them. The launch targets are therefore also worked out from
the database, for every household, by `private.beta_gate_report(from, to)` (service role only): pick acceptance,
cooking frequency, activation, hands-free rate, voice latency, pantry trust, waste rescue, day-30 retention, voice
cost and rescue success, each with the number of things it was measured on. The Monday report prints it; the gate
review uses it (`docs/beta/GATE_REVIEW.md`).

## AI and speech cost (database)

- **One `ai_requests` row per call:** every Edge Function that calls a model (`parse-inventory`, `suggest-meals`,
  `adapt-recipe`, `cook-assist`, `rescue`), plus `tts-cache` and the voice agent, writes one row per model or
  speech call. Each row holds the task, model, prompt version, usage, latency and outcome; prompts and answers are
  never stored. Speech services put the billed units (characters or seconds) in `input_tokens`.
- **Prices** are in `private.usage_prices`, and the exchange rate and targets are in `private.telemetry_settings`.
  Edit these rows when prices change; the reports pick the new values up on the next run.
  - The Claude prices are Anthropic's list prices.
  - **The two Sarvam rows are planning figures to confirm against your Sarvam plan.**
- **Weekly report:** `.github/workflows/weekly-report.yml` runs on Mondays (and on demand) and writes cost by task
  and model, plus voice latency and cost by day, to the run summary. It needs the `SUPABASE_DB_URL` repository
  secret. To run it by hand:

  ```bash
  SUPABASE_DB_URL=postgresql://... python3 scripts/ops/weekly_report.py
  ```

## Voice latency and cost per session

When a voice session ends, the agent sends one summary to `public.record_voice_session`:
- turns and fast-path turns;
- speech-to-text seconds;
- text-to-speech characters, live and from the step recordings;
- model tokens;
- p50 and p95 latency.

The database prices the session into `voice_sessions.cost_inr` and logs the usage to `ai_requests`. If the voice
session belonged to a dish, each turn's latency also goes on that cooking session (`session_events`, payload
`kind = voice_turn`).

How latency is measured:
- A turn's latency is end of speech, plus the model's first token, plus the first audio.
- Fast-path turns have no model call, so their latency is end of speech plus the agent's own handling time.

`private.voice_report` gives, per day:
- sessions, turns and fast-path share;
- p50 and p95 latency over every turn;
- average and p95 cost per session;
- sessions over the ₹5 budget;
- the share of speech that came from the step recordings.

## AI evaluations

`supabase/functions/_evals` holds the evaluation cases and graders.

- **What is covered now:**
  - `parse_inventory_text`: item F1, floor 0.9.
  - `rescue_fix`: the function's own safety validator plus per-case checks, floor 0.9.
- **Same request as production:** each function's `prompt.ts` builds the exact request the function sends, so the
  evaluations test what ships.
- **Offline checks:** with every `deno test`, the cases and graders are checked without calling the model.
- **In CI:** `.github/workflows/evals.yml` runs the real evaluations on any pull request that changes a prompt. It
  needs the `ANTHROPIC_API_KEY` repository secret. To make a regression block the merge, mark "AI evaluations /
  evals" as a required check on `main`.
- **After a prompt change you accept,** record its score as `last` in `_evals/baseline.json`.

To run them by hand:

```bash
ANTHROPIC_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net supabase/functions/_evals/run.ts
```

Next:
- Move the `cook-assist`, `adapt-recipe` and `suggest-meals` prompts into `prompt.ts` with their own cases.
- Grow the parse set toward the 300 utterances the AI tasks sheet asks for.
- Add the voice-turn scripted scenarios.
