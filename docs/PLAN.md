# Cookmate — Build Plan

Source documents: `docs/product/Kitchnos_BRD.pdf`, `docs/product/Kitchnos_PRD.pdf`, `docs/architecture/*.csv` (20 files).
This plan turns them into an ordered, buildable sequence for this repository. Requirement IDs (BR-xx, ONB-xx, KIT-0xx…) refer to those documents.

Status: draft, 10 Nov 2026. Sprint 1 proposed to start 16 Nov 2026.

---

## 0. Decisions

| # | Decision | Status |
|---|----------|--------|
| D1 | Name | **Done:** Cookmate everywhere; bundle/package ID `com.drishix.cookmate` (see `docs/adr/0001`). |
| D2 | Code pack | **Done:** built from the CSVs in this repo (no `kitchnos-repo.zip`). |
| D3 | Accounts | Supabase **done** (project ChefMate, Mumbai). Still needed: Expo/EAS, Anthropic (Sprint 2), Sarvam + LiveKit (Sprint 3), Sentry, PostHog, SMS provider with DLT (Sprint 5). |
| D4 | Launch regional language | Open; needed by Sprint 4. |
| D5 | Free-tier voice cap | Open; will be a `feature_flags` value (default 4/month). |
| D6 | Who curates the 300 dishes | Open; biggest non-code risk. |
| D7 | Palette | Using the PRD warm palette (`apps/mobile/src/design-system/tokens.ts`) until design sign-off. |
| D8 | Assistant persona (voice gender, Hindi verb forms) | Open; needed by Sprint 3 with the Sarvam voice choice. Until then Hindi/Hinglish copy speaks as "Cookmate" and addresses the user in the neutral respectful आप form, never assuming the cook's gender. |

### Phase 0 status (10 Nov 2026)
- [x] Monorepo layout, CI workflow (database, mobile, voice agent), PR/issue templates, README, ADR
- [x] `tools/archgen`: 46 tables, 501 columns, 146 RLS policies generated from the CSVs + TypeScript types
- [x] Migrations: schema, functions (`create_household`, auth triggers, decay/retention/abandon jobs), storage buckets, pg_cron
- [x] pgTAP tests: RLS guard rails, household isolation, jobs (26 passing locally)
- [x] Applied to Supabase ChefMate; policy fingerprint identical to local; advisors clean apart from expected notices
- [x] Expo SDK 58 app: tabs, design tokens, primitives, i18n (en/hi/hinglish), service layer (mock + live), Home/Kitchen/You with all states; Android bundle builds
- [x] Voice agent: LiveKit 1.8 worker skeleton, fast-path matcher (Hindi/Hinglish/English), confirmation gate, text harness (53 tests)
- [x] Seed data: see Sprint 1 status
- [ ] GitHub backlog: `scripts/github/bootstrap.py` is ready; run with `--apply` when you want the 105 issues created
- [ ] EAS project and first development build (needs your Expo account)

### Sprint 1 status (10 Nov 2026, branch `sprint-1/seed-and-onboarding`)
- [x] Content pipeline: `content/catalog/*.yaml` + `content/recipes/*.yaml` → `tools/content/build.py` validates (enums from the CSVs, catalog references, diet vs ingredients, safety notes for meat/egg/rajma, timers, whistles, ambiguous aliases) and generates an idempotent `supabase/seed.sql`; CI runs `--check` and 11 validator tests
- [x] Catalog: 177 ingredients (Hindi + Hinglish names, aliases, shelf life by storage kind, katori/chammach/mutthi weights, allergens), 16 techniques with sensory signs, 4 feature flags (incl. D5 voice cap)
- [x] 10 sample dishes as **drafts** (unpublished until the culinary lead cooks and approves them, REC-01): kadhi pakora, jeera aloo, dal tadka, moong dal khichdi, kanda poha, besan chilla, matar paneer, rajma, egg bhurji, chicken curry
- [x] Migration `20261117000000_catalog.sql` (global recipe slug index, alias/trigram indexes), applied to ChefMate
- [x] Onboarding (KIT-020/022/023, ONB-05): Try now → language (spoken prompt, big buttons) → who eats here (≤ 6, age groups) → spice → diet → consent per purpose (nothing pre-ticked) → `create_household` + consents → Home. Root layout gates tabs vs onboarding with `Stack.Protected`; returning users skip onboarding; language switches without restart
- [x] Tests: 43 pgTAP (catalog, seed idempotency, onboarding consents), 8 mobile unit tests; onboarding walked end to end in a browser build in Hindi
- [ ] KIT-143 asks for ≥ 500 ingredients; 177 are in. The rest should come with the culinary lead's dish list so names match real recipes
- [ ] Seed data on ChefMate: `.github/workflows/seed.yml` loads it once the `SUPABASE_DB_URL` secret is set (see Sprint 2 status)
- [ ] Sentry (KIT-131): needs your Sentry account
- [ ] Privacy notice text: consent rows carry `policy_version = 2026-11-draft-1` until the real notice is written

### Sprint 2 status (10 Nov 2026, branch `sprint-2/kitchen`)
- [x] Pantry backend (KIT-030..035): migration `20261124000000_pantry.sql` with `match_ingredient`, `add_inventory_items` (tops up the same thing in the same place), `update_inventory_item`, `finish_inventory_item` / `reopen_inventory_item` (undo), `get_use_soon`, `add_to_shopping_list`, every change logged as an inventory event, pantry tables on the Realtime publication; applied to ChefMate; 20 pgTAP tests
- [x] Rule parser shared by the app and the Edge Function (`apps/mobile/src/domain/pantryParse.ts`, copied by `scripts/sync-shared.py`): Hindi/Hinglish/English numbers, sawa/paune/dedh/paav kilo, units, homemade and leftover, confidence per item
- [x] `parse-inventory` Edge Function: rules first, Claude Haiku only for what the rules can't place (structured output, no thinking, cached catalog prompt, "never invent items" guardrail, every call logged to `ai_requests`), falls back to rules if the model is unavailable. **Deployed** to ChefMate
- [x] Kitchen tab: one tab per storage place, staples as Full / Low / Out with "Add to list", "Still have this?" for unsure items, live updates from other phones
- [x] Add items (KIT-031): type it like you'd say it → editable read-back cards with "Please check" on unsure items → Read aloud → Add. Nothing is written before Add
- [x] Item screen (KIT-032/035): quantity and place, how long it keeps in each place, Finished / Threw it away with a 5-second Undo
- [x] Brand kit applied to the whole app (tokens, Inter + Noto Sans Devanagari, bottom bar with the raised lime mic, outline icons in code); generated media wired through `tools/media/sync.py` (see `apps/mobile/assets/media/PROMPTS.md`)
- [x] CI: Edge Function job (shared parser in sync, `deno check`, `deno test`), media map check
- [ ] **You:** add the `ANTHROPIC_API_KEY` Edge Function secret on ChefMate (until then `parse-inventory` answers from the rules only)
- [ ] **You:** add the `SUPABASE_DB_URL` repository secret, then run "Seed hosted database" from the Actions tab. ChefMate has 0 ingredients until then, so the deployed parser can't match anything yet
- [ ] **You:** enable anonymous sign-ins on ChefMate (needed for "Try now" in live mode)
- [ ] Dish photos are temporary placeholders: replace before any release; redo three cropped illustrations and the produce pile (PROMPTS.md checklist)
- [ ] Voice add (KIT-031 by voice) arrives with the voice session in Sprint 4; the mic button is in place

### Sprint 3 status (10 Nov 2026, merged to `main` in adsynthio/cookmate#4)
- [x] Ranking engine (KIT-041), shared by the app and the Edge Functions (`apps/mobile/src/domain/ranking.ts`): hard filters for slot, every eater's diet, avoided ingredients, time, equipment and "use these first"; nine factors (coverage², use soon, taste, novelty, time, equipment, calendar, craving, slot); weights in `feature_flags.ranking_weights`; reasons built only from factors that scored, in three languages, ≤ 90 characters
- [x] `suggest-meals` Edge Function (KIT-040): ranks under the user's own RLS; Haiku only reads free-text cravings and rewords reasons, both with rule fallbacks; a reworded reason must keep the same facts and make no health claims; every batch stored in `recommendations` with its score breakdown
- [x] Home: meal-slot switch (KIT-046), who's eating (KIT-057), craving chips and typed cravings in Hindi, Hinglish or English (KIT-042), "You have X of Y", Use Soon cards that ask for picks using that item (KIT-043), empty state when nothing fits
- [x] Recipe screen (KIT-050/052/053): pantry match from confident items and staples, substitutes from your own kitchen, Add to list, servings from who's eating, katori / chammach / chutki with fractions, Why this works, family plates naming who each branch is for, steps with cues, whistles and safety notes, Draft badge on unreviewed dishes
- [x] Search in any script (KIT-054): `search_recipes` RPC and screen; "rajma", "राजमा" and "kidney bean curry" find the same dish
- [x] Your way (KIT-051): reviewed rules first (diet, missing items, equipment, spice, time, servings), Sonnet only for essentials nothing replaces, every result validated (safety notes unchanged, no dropped steps, no shorter cooking on safety steps, catalog ingredients that fit the diet, no unsafe shortcuts) and saved as the household's variant
- [x] Quick start from yesterday's meal (KIT-026): guesses at confidence 0.4, cleared in one tap
- [x] Draft recipes visible only while `show_draft_recipes` is on (staging)
- [x] Tests: 59 mobile unit tests, 13 Edge Function tests, 17 new pgTAP tests (visibility, search, quick start); every screen walked in a browser build
- [x] Migrations `recipes` and `quick_start` applied to ChefMate (11 Nov)
- [ ] **You:** before production, set `show_draft_recipes` off in `feature_flags`
- [ ] KIT-141 (100 curated dishes) needs the culinary lead; there are 10 drafts, so picks repeat quickly
- [ ] Omitted ingredients stay mentioned in step text after a rules-only adaptation (the summary says to leave them out); rewording needs the model

### Sprint 4 status (11 Nov 2026, merged to `main` in adsynthio/cookmate#5)
- [x] Cooking sessions and deduction (KIT-037, KIT-070): `start_cooking_session`, `advance_session_step`, `complete_cooking_session`, `apply_session_deduction` (once per session, every line adjustable), `submit_feedback`; unit conversion in the database
- [x] Cook screen (KIT-070/072): one instruction at a time in 30 pt type, progress, safety notes and sensory cues on every step, notes for who is eating, scaled ingredients on demand, swipe or 56 dp Back / Next, read-aloud, screen kept awake, dish photo on the last step
- [x] Timers (KIT-071): several labelled timers kept as end times, mirrored to scheduled local notifications, saved on the device, spoken in-app alarm on any tab
- [x] Whistle counter (KIT-078): tap per whistle, count shown and spoken, moves on at the target
- [x] Finish sheet (KIT-077): rate, review what comes off the pantry (55 g rather than 0.055 kg, any line off, staple levels), save leftovers, cooked-rice storage line for rice dishes; every part optional
- [x] Resume (KIT-079): the Cook tab offers the dish in progress with its timers, or stops it
- [x] Something's wrong (KIT-090/091/092): seven problems, at most three steps using what is in the kitchen, in three languages; pinned safety playbook used word for word; undercooked meat, egg and kidney beans always answered from the playbook; `rescue` Edge Function with a validated Haiku answer and the same rules on the phone when offline
- [x] Ask mid-step and "I changed something" (KIT-074/075): `cook-assist` Edge Function and `log_session_change`; the cook's place never moves; reminders appear on later steps
- [x] Voice backend (KIT-061/062): `get_voice_context` packet (capped, under 12,000 characters for a 150-item kitchen) and `voice-token` (membership, voice consent, one room, agent dispatch with the user's JWT)
- [x] Tests: 79 mobile unit tests, 24 Edge Function tests, 37 new pgTAP tests (cooking, voice context, session changes); cook, finish, rescue and help flows walked in a browser build
- [ ] **You:** have the culinary lead or a food-safety reviewer sign off the safety playbook and rescue fixes in `apps/mobile/src/domain/rescue.ts` (English, Hindi, Hinglish) before real users see them
- [x] Migrations `cooking`, `voice` and `session_changes` applied to ChefMate (11 Nov)
- [ ] **You:** add the repository secret `SUPABASE_ACCESS_TOKEN` (Supabase dashboard → Account → Access Tokens); `.github/workflows/deploy-functions.yml` then deploys `suggest-meals`, `adapt-recipe`, `rescue`, `cook-assist` and `voice-token` on every merge that touches them (they are too large for the Supabase tool). Only `parse-inventory` is deployed today
- [ ] **You:** LiveKit and Sarvam accounts, then `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` as Edge Function secrets. Until then the mic says voice isn't switched on
- [ ] Mic joins the room (KIT-063), hands-free cooking (KIT-064), barge-in (KIT-065) and voice tools (KIT-067) need the LiveKit client in a device build and the accounts above; the agent skeleton, fast-path matcher and confirmation gate are in `services/voice-agent`
- [ ] Timers ringing with the app killed can only be confirmed on a phone (needs the first EAS build); the alarm uses the default notification sound until a louder one is added
- [ ] Photo checkpoint (KIT-073) not started: needs camera capture in a device build and labelled photos to evaluate against
- [ ] Recipe step text is English only, so read-aloud of a step uses the English voice; Hindi and Hinglish step text comes with the curated dishes (KIT-140/141)

### Sprint 5 status (11 Nov 2026, adsynthio/cookmate#6 and branch `sprint-5/learning`)
- [x] Memory model (KIT-101): `save_memory`, `forget_memory`, `keep_memory`, `update_memory`. Repeats strengthen a memory; what the user says replaces older memories about the same subject; observations never override it; temporary memories expire and never change preferences; forgetting removes what was derived
- [x] Learning from feedback (KIT-100, KIT-103): the first feedback for a session nudges the taste dials one step; the finish sheet suggests what to remember about the dish and saves only what the cook taps
- [x] What I've learned (KIT-102): Edit in the user's own words, Keep, Forget with a second tap
- [x] Shopping list (KIT-110/111/112): grouped by shop section, add by typing, tick a line or "Sab le aaye" to move it into the pantry with an estimated expiry (staples refill), remove a line, share as plain text
- [x] Dismiss a pick with a reason (KIT-044): not today, don't like, no time, missing something; the dish isn't offered again that day; "don't like" asks before remembering, and a remembered dislike keeps the dish out of picks
- [x] Tests: 86 mobile unit tests, 25 Edge Function tests, 27 new pgTAP tests (memories, shopping); remember, You, shopping and dismiss flows walked in a browser build
- [x] Picks reflect memories (KIT-104), part 2: "Agli baar lahsun zyada" (typed on You, or "more garlic" on the finish sheet) raises garlic one step (×1.25) on the recipe and cook screens with "more, as you asked"; "less salt" lowers it (×0.75). A note about one dish wins over a general one. Picks that have something the household loves say so ("Has paneer, a favourite here")
- [x] Likes and dislikes (KIT-105): per person on You, added by name or from a typed note ("Riya ko karela pasand nahi"); picks leave out what anyone eating avoids, household-wide dislikes always. Memory subjects are now ingredient + aspect + dish (migration `memory_subjects`), so "less salt" never reads as "avoids salt" and a note about one dish never replaces a like
- [x] Saved dishes (KIT-055): heart on the recipe screen, list on You, shared by the household
- [x] Polish: secondary buttons have a pale lime fill and read as buttons on white cards
- [x] Tests (part 2): 93 mobile unit tests, 25 Edge Function tests, 10 new pgTAP tests (memory subjects); You, likes, saved dishes and remembered amounts walked in a browser build
- [x] Remembered amounts also start the finish sheet's pantry deduction (40 g garlic remembered as "more" comes off as 50 g); amounts named inside step text are unchanged
- [ ] Named collections beyond Favourites (KIT-055) are not built
- [x] Personal voice (KIT-068): You → "How I talk to you" sets speed, detail, experience and units. The voice agent adds them to its instructions and speaking rate; the app's read-aloud uses the same rate. Steps are read with the same words in both: a learner hears the sensory cue, an expert just the instruction, and the safety note is always read
- [x] Switch speaker (KIT-083): "Main Sunita hoon", "मैं सुनीता हूँ" or "I'm Sunita" loads Sunita's profile and answers "Namaste Sunita ji." Names match across scripts and spellings; an unknown or ambiguous name lists who is in the household instead of guessing. The context packet now carries member and step ids (migration `voice_personal`)
- [x] VAD-gated speech-to-text (KIT-081): `STT_MODE=gated` (the default) wraps Sarvam batch recognition in LiveKit's `StreamAdapter` with Silero VAD, so only speech segments are sent; each session logs STT seconds against its length (target ≤ 40%)
- [x] Step audio cache (KIT-080): `tts-cache` Edge Function records published steps per language into the public `step-audio` bucket and `step_audio_cache`; the agent plays the recording when there is one and live speech otherwise. The cache key is pinned in both the Python and TypeScript tests so they can't drift
- [x] Phone link (KIT-021): You → "Keep your kitchen safe" texts a code and links the number to the same anonymous account, so every row stays where it is; wrong codes, numbers already in use and SMS not being switched on each get a plain message
- [ ] KIT-081's "≤ 40% in tests" is checked with a simulated session, not real kitchen audio; measuring it needs a device session
- [ ] KIT-021's Send SMS hook to a DLT-registered provider is not built: Supabase's built-in SMS providers (Textlocal works for India) are enough to start, and a hook is only needed if you pick a provider Supabase doesn't support
- [ ] **You:** to switch on phone linking: Authentication → Sign In / Providers → Phone (choose an SMS provider with a DLT-registered sender and template), and turn on manual linking
- [ ] **You:** to record step audio: set `SARVAM_API_KEY` as an Edge Function secret and `SUPABASE_SERVICE_ROLE_KEY` as a repository secret; `.github/workflows/tts-cache.yml` then runs daily (or from the Actions tab). Only published recipes are recorded, and none are published yet
- [ ] Memory extraction from free speech (KIT-103's 200-utterance test set) is not built; memories come from feedback tags and what the user confirms
- [ ] **You:** phone OTP upgrade (KIT-021) needs an SMS provider registered for DLT
- [x] Migrations `memories` and `shopping` applied to ChefMate (11 Nov)

### Sprint 6 status (11 Nov 2026) — in progress
Part 1, privacy and security (branch `sprint-6/hardening`):
- [x] Export my data (KIT-121): You → Privacy → a zip of every table of the household, read under the user's own row-level security, in the private `exports` bucket with a 24-hour link
- [x] Delete my account (KIT-122): typed confirmation; households you alone own are deleted with everything in them, shared ones keep going without you; runs at once
- [x] Retention (KIT-123): the daily job now covers every time limit in `02_database_tables.csv` (AI logs 90 days, suggestions 1 year, sessions 2 years, expired temporary memories, and the rest)
- [x] Security review (KIT-124): `docs/SECURITY_REVIEW.md`; Supabase advisors run on ChefMate; two fixes (closed a dashboard-created definer function, indexed 40 foreign keys) and guard-rail tests so they stay fixed
- [ ] **You:** sign off the accepted findings in `docs/SECURITY_REVIEW.md`; turn on CAPTCHA for anonymous sign-ins; decide how `tts-cache` is scheduled (GitHub secret or `pg_cron` + Vault)
- [ ] Not doable from here: kitchen noise test set (KIT-082) needs real recordings; regional language (KIT-085) waits for the BRD decision; 300 dishes (KIT-142) need the culinary lead

---

## 1. What we are building (V1 in one page)

**Cookmate** — an AI kitchen companion for Indian households. One persistent **Kitchen Brain** per household (pantry, members, taste memory, cooking history). Every screen and the voice assistant read and write that one brain.

**V1 acceptance loop ("first magic moment", PRD §1)** — the build is done when this passes by touch and by voice in Hindi, Hinglish and English:

1. Talk pantry in: "do kilo aloo, pyaaz, besan, dahi hai"
2. Say a craving
3. Get one pick using what you have, with a one-line reason
4. Start Cook With Me, hands-free
5. Ask a question mid-step, get a step-aware answer
6. Finish the meal
7. Say "agli baar lahsun zyada"
8. See it as a memory on the You tab
9. See pantry quantities update

**V1 in scope:** onboarding without password (anonymous → phone OTP), household of up to 6 members, living pantry (5 locations, staples Full/Low/Out, homemade components, confidence decay), NL/voice pantry entry, "Tonight, decided" + craving search + Use Soon, 300 curated dishes with adaptation and family plates, Cook With Me (timers, sensory cues, photo checkpoints, offline), Voice Cook (Hindi, Hinglish, English + 1 regional), Recipe Rescue with food-safety guards, feedback + memories (Edit · Keep · Forget), shopping list, DPDP consent/export/delete, analytics + cost telemetry.

**Not in V1:** scanning (V1.5), weekly plate (V1.5), leftovers, restock, grocery agent, WhatsApp, paid tier, cook handoff (V2), IVR and family recipes (V3).

**Hard numbers V1 must hit:** voice latency p50 ≤ 1.0 s / p95 ≤ 1.8 s; fast-path ≤ 400 ms; barge-in ≤ 300 ms; ≤ ₹5 variable cost per 15-min voice session; cold start ≤ 3 s on 3 GB Android; Cook mode completes in airplane mode; ≤ 40 MB download; RLS on every table.

---

## 2. Architecture

```
┌────────────────────────── Phone ───────────────────────────┐
│ Expo app (RN + TS, Expo Router, dev build)                 │
│  screens ─► services/* (mock | live) ─► supabase-js        │
│  Zustand (cook/voice state) · TanStack Query (server)      │
│  SQLite + MMKV (offline bundle, write queue)               │
│  expo-notifications (timers) · LiveKit RN client           │
└────────┬───────────────────────────────┬───────────────────┘
         │ HTTPS (user JWT)              │ WebRTC audio + data ('cook-state')
         ▼                               ▼
┌──── Supabase (Mumbai) ─────┐   ┌──── LiveKit Cloud ────┐
│ Postgres + RLS (Kitchen    │   │ room per voice session│
│   Brain, ~35 V1 tables)    │   └──────────┬────────────┘
│ RPCs (create_household,    │              │ explicit dispatch
│   add_inventory_items, …)  │              ▼
│ Edge Functions (Deno):     │   ┌── Voice agent worker (Python, Mumbai) ─┐
│   suggest-meals,           │◄──┤ Silero VAD → Sarvam STT                 │
│   parse-inventory,         │   │ fast-path commands (no LLM)             │
│   adapt-recipe, rescue,    │   │ else get_voice_context → Claude Haiku   │
│   checkpoint, voice-token, │   │   + tools (same RPCs/Edge, user JWT)    │
│   session-bundle, notify,  │   │ Sarvam Bulbul TTS (streamed)            │
│   tts-cache, embed, export │   │ telemetry → voice_sessions              │
│ pg_cron jobs · Realtime    │   └─────────────────────────────────────────┘
│ Storage buckets            │
└───────────┬────────────────┘
            ▼
   Anthropic API (Haiku 5.5 turns/parsing, Sonnet 5.5 plans/vision)
```

Rules that hold everywhere:
- **No UI component calls the backend directly.** Only `apps/mobile/src/services/*`. Each service has a mock and a live implementation behind one interface (`EXPO_PUBLIC_USE_MOCKS=1`).
- **The voice agent never writes the database directly.** It calls the same RPCs/Edge Functions as the app, with the user's JWT, so RLS applies to voice exactly as to touch.
- **All model keys live server-side** (Edge Functions + agent secret store). The app only holds the publishable anon key.
- **Every voice write is confirmed aloud first** (pantry, memories, list, timers > 30 min).
- **Safety text is never generated or softened by a model** — it comes from a pinned playbook and is copied verbatim.

---

## 3. Repository layout

Follows `docs/architecture/18_repo_structure.csv`.

```
cookmate/
├─ apps/mobile/                 Expo app
│  ├─ app.config.ts, eas.json
│  └─ src/
│     ├─ app/                   Expo Router: (onboarding)/, (tabs)/index|kitchen|cook|you, recipe/[id], cook/[sessionId]
│     ├─ components/            kit.tsx, app-tabs.tsx, MicButton, StepView, TimerRing…
│     ├─ design-system/         tokens.ts + primitives (Button, Chip, Sheet, Card)
│     ├─ services/              types.ts, live/*.ts, mock/*.ts, voice-session.ts, supabase.ts
│     ├─ state/                 Zustand stores (session, cook, voice, onboarding)
│     ├─ offline/               SQLite bundle store, write queue, sync
│     ├─ i18n/                  hi.json, hinglish.json, en.json, <regional>.json
│     └─ types/database.ts      generated from Supabase
├─ services/voice-agent/        Python 3.12 LiveKit Agents worker + Dockerfile
│  ├─ agent.py  cook_agent.py  fast_path.py  context.py  backend.py  telemetry.py
│  ├─ prompts/                  system prompt, safety playbook, rescue playbook
│  └─ tests/                    fast-path matcher tests, scripted scenarios
├─ supabase/
│  ├─ migrations/               0000 schema, 0100 functions, 0200 storage, 0300 cron
│  ├─ functions/                one folder per Edge Function + _shared/ (ai.ts, auth.ts, log.ts)
│  ├─ seed.sql                  ingredients, techniques, sample recipes, calendar
│  └─ tests/database/           pgTAP: RLS isolation, kitchen loop
├─ content/recipes/             curated dish YAML + review status
├─ tools/
│  ├─ archgen/                  CSV → SQL/TS generator (schema stays in sync with docs)
│  └─ content/                  YAML → seed loader, validator, translation batch
├─ scripts/github/bootstrap.py  labels, milestones, 105 issues, Project board
├─ docs/  (product/, architecture/, adr/, PLAN.md)
└─ .github/ (workflows, ISSUE_TEMPLATE, PULL_REQUEST_TEMPLATE.md, CODEOWNERS)
```

Package management: npm workspaces for `apps/mobile` and `tools`; `uv` for the Python agent; Supabase CLI for the backend.

---

## 4. Data model (V1)

46 tables are specified (`02_database_tables.csv`, 501 columns in `03`). All 46 are created up front by the generated migration (so cross-release foreign keys need no follow-ups); **V1 code uses 35** of them.

| Domain | V1 tables |
|--------|-----------|
| Identity | profiles, households, household_members, voice_profiles |
| Privacy | consents |
| Catalog (global, read-only) | ingredients, techniques, calendar_events, feature_flags |
| Kitchen | kitchen_equipment, storage_locations, inventory_items, inventory_events |
| Recipes | recipes, recipe_ingredients, recipe_steps, recipe_variation_rules, step_audio_cache, saved_recipes |
| Planning | recommendations, meal_plans |
| Cooking | cooking_sessions, session_timers, session_events, photo_checkpoints |
| Learning | meal_feedback, memories, taste_profiles, ingredient_preferences |
| Shopping | shopping_lists, shopping_list_items |
| Platform | devices, notifications |
| Telemetry | voice_sessions, ai_requests |

Used later: products, scans, scan_items, nutrition_weekly (V1.5); member_skills, purchase_patterns, grocery_providers, provider_connections, carts, cart_items, channel_identities (V2).

RLS templates from `05_rls_policies.csv`: `self`, `households`, `members`, `hh_rw`, `hh_append` (insert/select only — event logs and consents), `hh_read`, `global_read`, `recipes` (global rows readable by all; household rows by members), `recipe_child`, `calendar`, `service_only`. All built on one `private.is_household_member(household_id)` security-definer helper.

**Schema generation:** I'll write `tools/archgen` to emit the migration SQL and `database.ts` from `02/03/04/05` CSVs, so the docs and the database can't drift (PRD §18). pgTAP tests assert every table has RLS enabled and that household A can never read household B.

---

## 5. Core logic (the Kitchen Brain)

These are the parts with real design content. Weights and constants are starting values, stored in `feature_flags` so they can be tuned in beta without a release.

### 5.1 Pantry confidence (KIT-02, KIT-08)
- `confidence` ∈ [0,1]. Set on add: confirmed by user 0.95, voice/NL parse = parse confidence × 0.95, seeded from "what did you cook yesterday" 0.4 (unconfirmed).
- Daily decay job (`private.decay_inventory_confidence`, 02:30 IST): `confidence *= exp(-Δdays / half_life)`, half-life by state/location (e.g. fresh produce in fridge 5 d, staples 30 d, frozen 60 d).
- Raised to 0.95 on confirm, cook deduction, or purchase.
- **Coverage only counts items with confidence ≥ 0.5** (REC-02).
- Targeted check (≤ 1/day): only when an item with 0.3–0.6 confidence would flip tonight's hero pick.

### 5.2 Expiry and Use Soon (KIT-09, HOME-04)
- `expiry_date` actual or estimated from `ingredients.shelf_life_days[location]`; `expiry_is_estimated` shown in UI.
- Use Soon = active items with days_left ≤ 3, sorted by `days_left × quantity_normalised` (HOME-04).

### 5.3 Ranking — "Tonight, decided" (HOME-01/02, KIT-041)
Deterministic in SQL/TS; the model only writes the one-line reason.

1. **Hard filters:** diet of every eating member (veg / eggetarian / non-veg / Jain), required equipment owned, not cooked in last 3 days, total time ≤ available time, fasting calendar rules, recipe published.
2. **Candidates:** top ~50 by pantry coverage + craving match (trigram + embedding).
3. **Score** (stored as JSON breakdown per recommendation):

| Factor | Weight | Meaning |
|--------|-------:|---------|
| coverage | 0.30 | share of required ingredients present (confident items only) |
| use_soon | 0.15 | uses at-risk items, weighted by days_left |
| taste_fit | 0.20 | distance between dish profile and eating members' taste dials |
| member_fit | 0.10 | dislikes ranked down (never silently removed — LRN-07), kids/elders |
| craving_fit | 0.10 | match to chips/free text (0 when no craving) |
| time_fit | 0.05 | fits meal slot and time available |
| memory_boost | 0.05 | positive feedback / "make again" |
| novelty | 0.05 | not cooked recently, variety across the week |

4. Hero = top; alternates = next two **from different dish families** (avoid three dals).
5. `pick_reasons` (Haiku) writes ≤ 90-char reasons citing a real factor from the breakdown; template fallback if the model fails or times out.
6. Cached pick shown instantly on app open, refreshed in background (NFR-02).

### 5.4 Cooking session state machine (COOK)
`active → paused → active … → completed | abandoned`. Single source of truth is `cooking_sessions` (current_step, servings, who_eating, substitutions, mode). The phone and the voice agent sync through the LiveKit data channel `cook-state`; the server row is updated via `advance_session_step`. Offline: the phone is authoritative, writes queue, server catches up.

### 5.5 Completion and deduction (KIT-05, KIT-037)
`complete_cooking_session` → deduction preview = recipe_ingredients × (servings / base_servings), mapped to inventory items (FIFO by expiry), staples move Full→Low instead of grams. User can correct each line → `apply_session_deduction` writes `inventory_events`. Corrections fire `inventory_corrected` (pantry-trust KPI).

### 5.6 Memory rules (LRN)
- Record: statement, category, scope (permanent | temporary), source (explicit | observed | correction), confidence, evidence_count, last_confirmed_at, provenance.
- "aaj …" → temporary, session only (never touches taste profile). "hamesha / agli baar …" → proposed permanent memory, confirmed by user.
- Corrections supersede conflicting memories on the same subject immediately.
- Forget = status `forgotten`, excluded everywhere at once, hard-deleted after 30 days, along with anything derived only from it.
- Taste dials move by small steps per feedback (e.g. ±0.15 on a 1–5 scale), so changes are visible after ~3 meals (LRN-06).

### 5.7 Food safety (RES-03, R-03)
A versioned `safety_rules` playbook (undercooked meat/poultry, raw-egg sauces, reheated rice, spoiled items, pressure-cooker misuse). Applied in three places: adapt-recipe validator (reject unsafe plans), rescue (append safety note verbatim), voice agent (playbook pinned in the system prompt; replies containing safety notes are not shortened). Covered by eval tests.

---

## 6. Voice Cook (E08, the riskiest epic: 16 stories, 67 points)

Pipeline per turn (PRD §9.2): LiveKit WebRTC → Silero VAD (agent) → Sarvam Saaras STT (only VAD segments; `STT_MODE=gated`) → **fast path?** → else `get_voice_context` + Claude Haiku with tools → Sarvam Bulbul streamed TTS sentence by sentence → telemetry row.

**Fast path (no LLM, ≤ 400 ms, works offline):** next / back / repeat / slower / pause / resume / set timer N min / check timers / whistle count / done. A multilingual phrase matcher (Hindi, Hinglish, English, regional), e.g. "agla", "ho gaya", "next", "phir se", "ruko", "ek seeti hui". Next-step audio comes from `step_audio_cache` (pre-generated per recipe × language × voice).

**Tools (24 in V1)** from `07_voice_agent_tools.csv`: get_kitchen, find_items, add_items, update_item, mark_finished, suggest_dishes, adapt_recipe, start_cooking, next_step, previous_step, repeat_step, set_timer, check_timers, count_whistle, report_problem, log_change, complete_cooking, confirm_deduction, submit_feedback, remember, list_memories, forget, add_to_list, read_list, switch_speaker, set_voice_preference. Write tools require a spoken "yes" — enforced in code, not left to the prompt.

**Cost controls (VOICE-14):** VAD gating, cached step audio, Haiku for turns with prompt caching of the system prompt + context packet, idle disconnect during long timers (reconnect on timer end or mic tap). Cost per session computed from STT seconds, TTS characters, tokens and LiveKit minutes and written to `voice_sessions.cost_inr`.

**Latency budget (target p50 1.0 s):** VAD end-of-speech ~200 ms · STT final ~250 ms · Haiku first token ~300 ms · TTS first audio ~200 ms · transport ~50 ms. Everything streams. Every turn logs `latency_ms` from end of speech to first audio.

**Approach:** build the agent behind a text harness first (type a turn, get the reply + tool calls) so prompt/tool logic is testable in CI without audio. Add audio once Sarvam and LiveKit accounts exist.

---

## 7. AI tasks

From `11_ai_tasks_and_models.csv`. All calls go through one `_shared/ai.ts` (Edge) / `backend.py` (agent) wrapper that: picks the model from env (`CLAUDE_TURN_MODEL`, `CLAUDE_PLAN_MODEL`), enforces JSON output schemas, applies timeouts and the listed fallback, and writes an `ai_requests` row (model, tokens, latency, cost).

| Task | Model | Budget | Fallback |
|------|-------|-------:|----------|
| voice_turn | Haiku 5.5 | 700 ms | Sonnet on repeated tool errors |
| parse_inventory_text | Haiku 5.5 | 1.2 s | low-confidence items for review |
| craving_interpret | Haiku 5.5 | 600 ms | keyword map |
| pick_reasons | Haiku 5.5 | 900 ms | template from score breakdown |
| rescue_fix | Haiku 5.5 | 1.5 s | static playbook |
| memory_extraction | Haiku 5.5 | 800 ms | propose nothing |
| adapt_recipe | Sonnet 5.5 | 3.5 s | rule-only adaptation |
| invent_combination | Sonnet 5.5 | 5 s | hide option |
| photo_checkpoint | Sonnet 5.5 | 3.5 s | "I can't tell — check that…" |
| content_translation | Sonnet 5.5 (batch) | — | human translator |

**Eval harness (NFR-17, KIT-133):** fixed test sets in `evals/` (300 pantry utterances, 100 cravings, 50 adaptations, rescue scenarios, 200 memory utterances, voice scripts). CI runs them on any prompt or model change; regressions block the merge.

---

## 8. Offline (BR-13, COOK-08, NFR-04/05)

- On cook start, `session-bundle` returns steps, image URLs, step-audio URLs and a version → the phone downloads all of them into SQLite + the file cache **before** step 1 is shown.
- Offline in Cook: steps, timers (local notifications), cached step audio and tap controls all work. Speech-to-text is a cloud API, so offline voice commands need on-device keyword spotting, which is a stretch goal (see §12, item 2).
- Pantry/list edits offline go into a write queue (MMKV) and replay on reconnect, last-write-wins with the event log as the audit trail.

---

## 9. Privacy and security (BR-14/15, NFR-10–13)

- Anonymous sign-in → phone OTP upgrade with `linkIdentity`, data stays on the same user id.
- Consents per purpose (voice, memory, analytics, transcripts) per member, append-only, latest wins; app fully usable with voice declined.
- No raw audio stored, ever, by default. Transcripts in `session_events` only if consented, deleted after 30 days. Checkpoint/scan images 90 days.
- Export (zip, signed URL 24 h) and delete (≤ 30 days) as Edge Functions.
- Retention jobs in pg_cron, each covered by a test.
- Security review before beta: RLS pgTAP suite on every table, grep the app bundle for service keys in CI, Supabase advisors clean.
- Hosting: Supabase `ap-south-1`, agent containers in Mumbai.

---

## 10. Build sequence

The docs plan six 2-week sprints with a team of ~8 roles. Here it's you + me in this repo, so I've kept the sprint goals and story IDs, but rebalanced (Sprint 4 had 83 points and Sprint 6 had 81 vs 39 in Sprint 1) and front-loaded the risky items (voice, ranking). For each phase: **I build** = code I can write and test here; **You do** = accounts, devices, content, decisions.

### Phase 0 — Foundation (start now, ~3–4 days)
- Monorepo, npm workspaces, lint/format/typecheck, CI workflows (mobile, supabase, voice-agent), PR template, CODEOWNERS (KIT-001)
- `tools/archgen` → V1 migration + `database.ts`; pgTAP RLS isolation tests (KIT-003)
- Seed: ingredients (with local names + gram-per-katori/chammach/mutthi), techniques, 10 sample dishes
- `scripts/github/bootstrap.py` → labels, milestones, 105 issues, Project board (optional; needs `gh` access to the repo)
- **You do:** D1, D2, create Supabase staging project (Mumbai) and Expo account (KIT-002, KIT-004)
- **Done when:** `supabase db reset` applies cleanly, pgTAP passes, CI is green on an empty app.

### Phase 1 — Sprint 1: Shell + Home (16–29 Nov)
KIT-005, 010, 011, 012, 013, 020, 022, 023, 131
- Expo dev build, Expo Router tabs (Home, Kitchen, Cook, You), design tokens + primitives, i18n (hi/hinglish/en), all screen states (loading/empty/offline/error)
- Service layer interfaces + full mock implementations mirroring `seed.sql`
- Anonymous auth, onboarding (language → who eats here → spice/diet → consent), `create_household` RPC
- Home with mock picks, Use Soon strip, craving sheet UI; Sentry
- **Done when:** Home renders all states on a 3 GB Android build; onboarding creates a real household in staging.

### Phase 2 — Sprint 2: Kitchen (30 Nov–13 Dec)
KIT-025, 030–034, 036, 120, 140, 143
- Kitchen tab (5 locations), item detail, add/edit/finish/discard, staples Full/Low/Out, homemade components with flavour roles
- `parse-inventory` Edge Function (Haiku) + confirm sheet; `add_inventory_items` RPC; Realtime pantry sync across phones
- Consent per purpose; recipe YAML format, validator and loader; ingredient catalog
- **You do:** Anthropic key; culinary lead starts the first 100 dishes
- **Done when:** "2 kilo aloo, 1 dozen ande" becomes two confirmed items, and shows on a second phone within 3 s.

### Phase 3 — Sprint 3: Craving + recipes (14–27 Dec)
KIT-026, 040–043, 046, 050–054, 057, 141
- `suggest-meals` (filters, scoring, reasons), hero + alternates, craving interpret, meal slots
- Recipe detail with pantry match ("9 of 10"), missing → list, `adapt-recipe` (Sonnet) with rule validator and safety checks, family plates (per-member branch steps), Why this works, multilingual search
- **Start voice early:** voice-agent skeleton + text harness + `voice-token` (pulled forward from Sprint 4)
- **You do:** Sarvam + LiveKit accounts; 100 dishes reviewed
- **Done when:** a pick uses real pantry items and its reason names a real factor.

### Phase 4 — Sprint 4: Cook With Me + Voice (28 Dec–10 Jan)
KIT-024, 037, 060–067, 070–078, 090–092
- Cook step view (≥ 28 pt, ≥ 56 dp targets, keep-awake), multiple timers with local alarms, sensory cues/photos, ask mid-step, "I changed something", finish sheet + deduction review, whistle counting
- Recipe Rescue sheet + `rescue` Edge Function + safety guards; photo checkpoint
- Voice: LiveKit room, VAD-gated STT, fast path, tools, barge-in, hands-free mode, mic button on every tab, voice-only onboarding
- **You do:** test on a real phone in a real kitchen (I can't run audio on a device from here)
- **Done when:** a dish is cooked start to finish by voice only.

### Phase 5 — Sprint 5: You + learning + shopping (11–24 Jan)
KIT-021, 044, 055, 068, 080, 081, 083, 100–105, 110–112
- Feedback sheet, memory extraction, memories with Edit · Keep · Forget (touch + voice), taste dials, likes/dislikes, picks cite memories
- Step audio cache job (`tts-cache`), voice personalisation, switch speaker, phone OTP upgrade
- Shopping list: add missing, staples Low/Out, mark bought → pantry, share as WhatsApp text
- **Done when:** "agli baar lahsun zyada" shows on You and changes the next recipe.

### Phase 6 — Sprint 6: Integration + hardening (25 Jan–7 Feb)
KIT-035, 045, 056, 069, 076, 079, 082, 084, 085, 121–124, 130, 132, 133, 142, 144
- Mocks → live everywhere, offline session bundles, resume session, confidence decay + targeted checks, daily pick notification with cap/quiet hours
- Retention jobs, export, delete, security review, PostHog events, AI request logs, latency/cost dashboards, eval harness in CI
- Regional language, noise robustness tuning, 300 dishes, festival/fast calendar
- **Done when:** the 9-step loop passes on 5 devices, by touch and by voice.

### Phase 7 — Closed beta (8 Feb–7 Mar) · KIT-150–152
150 urban + 30 rural households; gate review against BRD §3 (pick acceptance ≥ 40%, ≥ 3 sessions/week, activation ≥ 40%, hands-free ≥ 60%, latency, cost ≤ ₹5).

### Later
- **V1.5 (Apr 2027):** barcode (Open Food Facts), fridge photo, receipt scan, in-dish nudge, weekly plate — KIT-160–171
- **V2 (Jul 2027):** leftovers, predictive restock, grocery provider adapters with approval, WhatsApp voice notes, cook handoff, Kitchnos Plus — KIT-180–201
- **V3:** auto-replenish (approved), provider comparison, IVR, family recipes

---

## 11. Testing and quality gates

| Layer | Tooling | Gate |
|-------|---------|------|
| Database | pgTAP (`supabase test db`) | RLS on every table; cross-household isolation; kitchen loop (add → cook → deduct) |
| Edge Functions | Deno test with mocked model client | schema validation, fallbacks, safety validator |
| Mobile | Jest + React Native Testing Library; Maestro for E2E flows | all states render; onboarding → cook → finish flow |
| Voice agent | pytest: fast-path matcher, tool confirmation rules, text-harness scenarios | ≥ 95% scenario pass per language |
| AI quality | `evals/` harness | no regression on prompt/model change |
| Device | real 3 GB Android, airplane-mode cook, noisy kitchen | PRD §16 release checklist |

CI on every PR: typecheck, lint, unit tests, pgTAP, archgen freshness (CSV ↔ migration in sync), no service keys in the app bundle.

---

## 12. Gaps and inconsistencies I found in the documents

1. **Multilingual search vs embeddings.** REC-08 needs "rajma", "राजमा" and "kidney bean curry" to match, but the chosen embedding model (gte-small, 384-d) is English-only. Plan: store transliterated and Devanagari aliases per recipe and ingredient, search with pg_trgm over all aliases, use embeddings only for English/Hinglish craving text. Revisit with a multilingual embedding model if search quality is poor.
2. **Offline voice.** VOICE-12/NFR-04 say fast-path commands work offline, but STT is a cloud API. Offline realistically means cached step audio + taps; true offline voice needs on-device keyword spotting (stretch goal). Needs an explicit decision.
3. **Uneven sprint loads.** 39 / 41 / 63 / 83 / 48 / 81 points across sprints 1–6. Rebalanced above by pulling voice foundations into Sprint 3.
4. **Model pricing.** BRD uses third-party figures for Haiku 5.5 / Sonnet 5.5 pricing and flags them as unconfirmed; the ₹5/session target depends on them. Cost telemetry from day one will give real numbers.
5. **Missing code pack.** `kitchnos-repo.zip` is referenced but not included (D2).
6. **Team assumption.** The docs assume ~8 roles. Content curation (300 dishes, photos, gram-per-measure conversions), field testing and the rural pilot need people regardless of how fast the code moves.
7. **Version pins** (Expo SDK 58, livekit-agents 1.8.11, Saaras v3/v4, Bulbul v3/v4-flash) will be verified when installing; I'll pin to what actually resolves and record it in an ADR.

---

## 13. Accounts, keys and where they go

| Need | When | Where it lives |
|------|------|----------------|
| Supabase staging + prod (Mumbai) | Phase 0 | `SUPABASE_*` in GitHub Actions secrets; anon key in app env |
| Expo / EAS | Phase 0 | `EXPO_TOKEN` in GitHub Actions |
| Anthropic API | Sprint 2 | `supabase secrets set`; agent secret store |
| Sarvam | Sprint 3 | agent secret store; supabase secrets (tts-cache) |
| LiveKit Cloud | Sprint 3 | `LIVEKIT_*` in agent + supabase secrets |
| Sentry, PostHog | Sprint 1 / 6 | EAS env |
| SMS provider (DLT registered) | Sprint 5 | supabase secrets (Send SMS hook) |
| Agent hosting (Mumbai container) | Sprint 4 | e.g. AWS ap-south-1 / Fly.io bom |

Full list: `docs/architecture/13_env_and_secrets.csv`. No secret is ever committed or put in the app.

---

## 14. What's next

1. Sprint 1: seed data, onboarding flow (language → who eats here → spice/diet → consent) against the live `create_household`, anonymous sign-in, phone OTP later.
2. You: enable anonymous sign-ins in Supabase (Authentication → Sign In / Providers), create the Expo account, decide whether to create the GitHub backlog.
