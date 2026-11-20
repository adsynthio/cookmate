# Getting Cookmate onto Google Play

Step by step, for one person. Plan and dates: `docs/LAUNCH_PLAN.md`. The text and form answers referred to below
are in this folder.

| File | What it is |
|---|---|
| `LISTING.md` | App name, short and full description in English, Hindi and Kannada, plus the graphics checklist |
| `DATA_SAFETY.md` | Every answer for the Data safety form, taken from the code |
| `APP_CONTENT.md` | Content rating, target audience, ads, health and the other App content forms, plus permissions |

## 1. Accounts (you, once)

1. **Google Play Console:** play.google.com/console → personal account → pay US$25 → finish identity checks
   (government ID; this can take a few days).
2. **Expo:** expo.dev → create a free account. On your computer, run:

   ```bash
   npm install -g eas-cli
   ```

   ```bash
   eas login
   ```

3. **Public pages** (privacy policy and account deletion, which Play requires) are served by the same Vercel project
   as the web app (`docs/IPHONE_WEB_APP.md`):
   - Vercel → the Cookmate project → Settings → Environment Variables → add `SUPPORT_EMAIL` (the address people
     write to; it is shown publicly) and `OPERATOR` (the name shown as who runs Cookmate, your name or a business
     name). Redeploy.
   - The pages appear at `https://cookmate-chi.vercel.app/legal/privacy` and `/legal/delete-account`. Until both
     variables are set they are left out, so a page with a blank email never goes live.
   - The deletion page promises: email requests are verified with a code to the linked phone and done within 30
     days. Delete those accounts with the `delete-account` function or `private.delete_account_data`.

## 2. First build

From `apps/mobile`:

```bash
eas init
```

This links the project to your Expo account and adds the project id to `app.json`. Commit that change.

```bash
eas build --platform android --profile production
```

The build runs on Expo's servers (free plan: about 15 Android builds a month, in a slower queue) and gives you an
`.aab` file. `eas.json` already points the build at the live Supabase project. EAS creates the signing key and keeps
it; let Play App Signing manage the upload key when Play asks.

To try the app on your own phone first, build an installable APK instead:

```bash
eas build --platform android --profile preview
```

**Analytics:** builds send nothing to PostHog unless `EXPO_PUBLIC_POSTHOG_KEY` is set. Add it in expo.dev →
Project → Environment variables (Production) when you want the KPI dashboard (`docs/ANALYTICS.md`).

## 3. Play Console set-up

1. **Create app:** name "Cookmate: Indian Home Cooking", default language English (India), App, Free.
2. **Store listing:** paste from `LISTING.md`, add the Hindi and Kannada translations, upload icon, feature graphic
   and screenshots.
3. **App content:** fill every form from `APP_CONTENT.md` and `DATA_SAFETY.md`. Privacy policy and delete-account
   links must open before you submit.
4. **Countries:** India only.

## 4. Closed test (14 days, 12+ testers)

1. Testing → Closed testing → create a track → add testers by email list (their Gmail addresses).
2. Upload the `.aab` from step 2 **by hand** the first time. Play needs one manual upload before
   `eas submit` can send builds.
3. Send testers the opt-in link. They must stay opted in for 14 days in a row; don't pause the track.
4. Later builds:

   ```bash
   eas build --platform android --profile production --auto-submit
   ```

   This sends each new build to the internal track as a draft (`eas.json` → `submit`); promote it to closed testing
   in the Console. `--auto-submit` needs a Google service account key; until you set one up, keep uploading by hand.

## 5. Production

After 14 days: Dashboard → Apply for production. Answer the questions about the test honestly (how many testers,
what you changed). Once approved: Production → create release → staged rollout 10%.

## Before every release

- `python3 tools/play/check_listing.py` if you changed the listing text.
- If a feature now collects new data, update `DATA_SAFETY.md` and the Data safety form together.
- The version code goes up by itself (`autoIncrement`); change `version` in `app.json` for a user-visible version.
