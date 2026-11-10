# Cookmate

An AI kitchen companion for Indian households. It knows what is in the kitchen, decides what to cook, guides cooking step by step by voice in the user's own language, and learns from every meal.

Everything reads from and writes to one **Kitchen Brain** per household: pantry, members, taste memories and cooking history.

- Product docs: [`docs/product/`](docs/product) (BRD, PRD)
- Architecture (source of truth for the database): [`docs/architecture/`](docs/architecture)
- Build plan and status: [`docs/PLAN.md`](docs/PLAN.md)

## Repository layout

| Path | What |
|------|------|
| `apps/mobile/` | Expo (SDK 58) React Native app, TypeScript, Expo Router |
| `services/voice-agent/` | Voice Cook worker: LiveKit Agents 1.8 (Python), Sarvam speech, Claude |
| `supabase/` | Migrations, pgTAP tests, CLI config (Edge Functions arrive per sprint) |
| `content/` | Ingredient catalog, techniques, feature flags and curated recipes (YAML) |
| `tools/archgen/` | Generates the schema migration and TypeScript types from the architecture CSVs |
| `tools/content/` | Validates `content/` and generates `supabase/seed.sql` |
| `scripts/` | Local database test runner, GitHub backlog bootstrap |

## Getting started

### Database

The schema is generated from `docs/architecture/02,03,05_*.csv`. After changing those files:

```bash
python3 tools/archgen/build.py
```

Run every migration and the RLS/isolation tests against a throwaway local Postgres (needs Postgres 15+ with pgvector and pgTAP, no Docker):

```bash
scripts/db/test-local.sh
```

Ingredients, techniques, flags and recipes live in `content/` as YAML. After editing them:

```bash
python3 tools/content/build.py              # validate and regenerate supabase/seed.sql
python3 -m unittest discover -s tools/content
```

Recipes are published only when `review_status: approved` (see `content/recipes/README.md`).

The hosted project is **ChefMate** (Supabase, Mumbai `ap-south-1`).

### Mobile app

```bash
cd apps/mobile
cp .env.example .env
npm install
npm run typecheck && npm test
npx expo start
```

The app uses mock services by default (`EXPO_PUBLIC_USE_MOCKS=1`). Voice needs a development build, not Expo Go.

### Voice agent

```bash
cd services/voice-agent
uv sync
uv run pytest
uv run python harness.py      # type utterances, see fast-path vs model routing; no keys needed
uv run python agent.py dev    # needs LiveKit, Sarvam and Anthropic keys (.env.example)
```

## Rules

- UI code never calls the backend directly; only `apps/mobile/src/services/*`.
- Every table has row-level security; the app holds only the publishable key.
- The voice agent acts only through the same RPCs and Edge Functions as the app, with the user's token.
- Every voice write is confirmed aloud first. Safety advice is never generated, shortened or softened.
