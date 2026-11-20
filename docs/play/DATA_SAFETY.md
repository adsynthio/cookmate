# Data safety form: answers

Play Console → Policy → App content → Data safety. These answers come from the code and database as of
19 Nov 2026 (tables in `supabase/migrations`, analytics in `apps/mobile/src/services/analytics.ts`, AI calls in
`supabase/functions`). If a feature starts collecting something new, update this file and the form together,
because a mismatch gets the app rejected.

## Overview questions

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Every call goes over HTTPS: Supabase, Edge Functions, LiveKit, PostHog |
| Do you provide a way for users to request that their data is deleted? | **Yes** | In the app: You → Privacy → Delete my account (instant, `delete-account`). On the web: the deletion page in `site/delete-account.html` |
| Account creation | "My app allows users to create an account": **Yes, username/other** | Accounts start anonymous on first open; linking a phone number is optional |
| Delete account URL | `https://cookmate-chi.vercel.app/legal/delete-account` | |

**Sharing:** answer **No** for every type. Anthropic (AI), Sarvam (speech), LiveKit (voice relay), Supabase
(database) and PostHog (analytics) process data on Cookmate's behalf as service providers, and Google's form
doesn't count that as sharing. Nothing is sold, and there are no ads.

## Data types

Answer only the rows below; leave every other type unticked (no location, contacts, calendar, financial info,
messages, web history, files, or crash logs: Sentry isn't installed).

| Category → type | Collected | Ephemeral? | Required or optional | Purposes | What it is in Cookmate |
|---|---|---|---|---|---|
| Personal info → **Name** | Yes | No | Required | App functionality | Names the cook gives household members ("who eats here"), and the circle display name ("Sunita's kitchen") |
| Personal info → **Phone number** | Yes | No | Optional | App functionality, Account management | Only if the cook links a phone to keep the account (`profiles.phone`) |
| Personal info → **Other info** | Yes | No | Required | App functionality, Personalization | Each member's age group (child, teen, adult, elder) and diet (veg, Jain, …) |
| Health and fitness → **Health info** | Yes | No | Optional | App functionality, Personalization | Foods a member must avoid, which can include allergies the cook types in. Declared to be safe |
| Photos and videos → **Photos** | Yes | **Yes** | Optional | App functionality | Fridge, shelf and bill photos (`scan-pantry`) and "snap the pan" (`photo-check`) go to the model once and are never stored |
| Audio → **Voice or sound recordings** | Yes | **Yes** | Optional | App functionality | Voice Cook streams speech for transcription; no audio or transcript is stored (`voice_sessions` keeps only usage and timing) |
| App activity → **App interactions** | Yes | No | Optional | Analytics | PostHog events, only with the analytics consent from onboarding; ids and counts only, no names or free text (`docs/ANALYTICS.md`) |
| App activity → **Other user-generated content** | Yes | No | Required | App functionality, Personalization | Pantry items, shopping lists, cooking history, feedback, memories, family recipes, posts in private circles |
| App activity → **Other actions** | Yes | No | Required | App functionality, Analytics | Server log of each AI request (task, model, tokens, time, cost), kept 90 days, linked to the household |
| Device or other IDs → **Device or other IDs** | Yes | No | Optional | App functionality | Push token for notifications (`devices`), removed 90 days after last seen |

For every row: **"Is this data shared?" No.** "Is this data processed ephemerally?" Yes only where marked.

## What the listing then shows

- No data shared with third parties
- Data collected: personal info, health info, photos, audio, app activity, device IDs
- Data is encrypted in transit
- You can request that data be deleted

## Keep in step

- Turning on WhatsApp Business (F8) adds a phone number shared with Meta for messaging, which must be added here first.
- Turning on Sentry or any crash reporter adds App info and performance → Crash logs.
- Storing any photo (for example dish photos in circles) changes Photos from ephemeral to stored.
