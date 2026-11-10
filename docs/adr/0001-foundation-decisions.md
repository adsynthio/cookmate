# ADR 0001: Foundation decisions

Date: 10 Nov 2026 · Status: accepted

## Name
The product is **Cookmate** everywhere (repo, app, package and bundle IDs, docs). The source BRD/PRD PDFs keep their original "Kitchnos" name; the architecture CSVs were updated to Cookmate. Bundle/package ID: `com.drishix.cookmate` (change before the first store build if needed).

## Schema is generated from the architecture CSVs
`tools/archgen` turns `02_database_tables.csv`, `03_database_columns.csv` and `05_rls_policies.csv` into the init migration and `apps/mobile/src/types/database.ts`. CI fails if they drift (`build.py --check`). All 46 tables are created up front (V1.5/V2 tables included) so foreign keys between releases need no follow-up migrations; V1 code only uses the V1 tables.

## Testing without Docker
`scripts/db/test-local.sh` runs migrations and pgTAP tests on plain Postgres with a small Supabase shim (`supabase/tests/shim`). This works in CI and in cloud dev containers without Docker.

## Hosted project and migration history
The ChefMate project was set up through the Supabase MCP connector, so its migration history versions do not match the repo's file timestamps. Before using `supabase db push` from CI, run `supabase migration repair` once to mark the repo's migrations (all files in `supabase/migrations`) as applied.

## Versions (verified 10 Nov 2026)
Expo SDK 58.0.23 (React Native 0.88.1, React 19.3), expo-router 58.0.30, @supabase/supabase-js 2.119, livekit-agents 1.8.11 with sarvam/anthropic/silero plugins 1.8.11, Postgres 17 on Supabase. The Sarvam STT plugin defaults to `saaras:v4`; we pin `saaras:v3` per the architecture docs via `SARVAM_STT_MODEL`.
