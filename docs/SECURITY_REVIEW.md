# Security review before beta (KIT-124)

Reviewed 11 Nov 2026, on `main` plus Sprint 6 part 1, and on the hosted ChefMate project (`usuwwzkorhsbaaziaanl`)
using Supabase's security and performance advisors. Each finding is **fixed**, **accepted** (with the reason), or
**open** (with who acts on it). Accepted findings need the product owner's sign-off below before the beta.

## What is checked automatically

| Check | Where |
|---|---|
| Every public table has row-level security; anon can read nothing; only `ai_requests` has no policies | `supabase/tests/database/00_rls_guardrails.test.sql` (CI) |
| Every foreign key has a covering index | same file |
| The only `SECURITY DEFINER` function a signed-in user can call is `create_household` | same file |
| Household isolation per feature (pantry, recipes, cooking, voice context, memories, shopping, privacy) | `supabase/tests/database/01`–`15` (CI) |
| No service-role key or Anthropic key in the app bundle | `ci.yml`, "No secrets in the app" step |
| Edge Function inputs, model output validation, safety guards | `supabase/functions/*/logic.test.ts` (CI) |

## Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `public.rls_auto_enable()` (created by the dashboard's "enable RLS on new tables" setting) is a `SECURITY DEFINER` function in `public`, callable through the API by anon and signed-in users | Medium | **Fixed**: EXECUTE revoked from API roles in `20270119000100_hardening.sql`; the event trigger still runs |
| 2 | `create_household` is `SECURITY DEFINER` and callable by signed-in users | Low | **Accepted**: a new user has no membership yet, so RLS can't let them create one. It refuses callers without `auth.uid()`, only ever makes the caller the owner, caps members at 6, and is pinned by the guard-rail test |
| 3 | `ai_requests` has RLS on but no policies | Info | **Accepted**: by design; only the service role writes or reads it, and it holds no prompt or answer text |
| 4 | 40 foreign keys without a covering index (performance advisor) | Low | **Fixed**: indexes added by `20270119000100_hardening.sql`; deleting a household or account no longer scans whole tables |
| 5 | `tts-cache` has gateway JWT checks off and compares the service key itself | Low | **Accepted**: it is run only by the scheduler, does nothing without the exact key, and writes only public, non-personal step audio |
| 6 | The `tts-cache` workflow needs the service-role key as a GitHub secret | Medium | **Open (you)**: prefer a Supabase secret key scoped to this job, or schedule it with `pg_cron` + Vault inside Supabase instead of GitHub |
| 7 | `voice-token` puts the user's JWT in the LiveKit dispatch metadata so the agent reads as the user | Low | **Accepted**: the metadata goes only to our agent worker, the JWT expires within the hour, and the agent never logs it |
| 8 | The voice agent logs fast-path arguments (for example a timer label the cook said) | Low | **Accepted for beta**: no transcript is logged; revisit when logs ship to a third party |
| 9 | Anonymous sign-ins can be abused to create many users (Supabase docs) | Medium | **Open (you)**: turn on CAPTCHA / Cloudflare Turnstile for anonymous sign-ins and review the auth rate limits before the beta |
| 10 | Old exports of households that never export again stay in the `exports` bucket | Low | **Fixed (Sprint 6 part 4)**: the `notify` job, which runs every 15 minutes, lists export files older than 7 days (`stale_exports`, service role only) and removes them through the Storage API (SQL deletes on `storage.objects` are blocked by Supabase) |
| 11 | Photo and scan images must be removed through the Storage API, not by deleting rows | Info | **Open (me)**: no image features have shipped; retention for their files comes with them (KIT-073, V1.5 scans) |
| 12 | `record_voice_session` (Sprint 6 part 3) is a second SECURITY DEFINER function signed-in users can call | Low | **Accepted (needs your sign-off)**: it lets a member of the household close their own voice session once, writes only that row, its usage lines in `ai_requests` and turn latencies on that household's cooking session, and computes cost on the server. The guard-rail test lists it by name, so any other such function still fails CI |
| 13 | Sprint 6 part 4 adds three more SECURITY DEFINER functions signed-in users can call: `pantry_check_today`, `get_notification_settings`, `set_notification_settings` | Low | **Accepted (needs your sign-off)**: each first checks the caller is an active member of the household (`private.current_member`) and only touches that member's or household's rows in `private.pantry_checks` / `private.notification_settings`, which no client can read directly. The guard-rail test lists them by name so a new one can't slip in |
| 14 | `notify` is deployed without JWT verification so pg_cron can call it | Low | **Accepted**: it refuses any call without the shared secret, which is random, kept in Vault and compared inside the database (`notify_secret_ok`, service role only); the function does nothing a caller can steer (no input is read) |
| 15 | Notification settings and the day's pantry question live in private tables, so "Download my data" didn't include them | Info | **Fixed (Sprint 6 part 5)**: `export_household` now adds them through `private.export_private`, which returns rows only to a member of that household (tested) |

## Privacy rights (DPDP)

- **Access:** You → Privacy → Download my data. `export-data` reads with the user's own JWT (`export_household`, invoker
  rights), zips one JSON file per table, stores it in the private `exports` bucket and returns a 24-hour signed link.
- **Erasure:** You → Privacy → Delete my account, with a typed confirmation word. Households the user alone owns are
  deleted with everything in them; in shared households the user is unlinked; then the auth user is deleted. It runs
  immediately (the PRD allows 30 days).
- **Retention:** `private.retention_cleanup()` runs daily and now covers every time limit in `02_database_tables.csv`.

## Sign-off

- [ ] Product owner accepts findings 2, 3, 5, 7, 8, 12, 13 and 14 as written
- [ ] Findings 6 and 9 done before the closed beta
