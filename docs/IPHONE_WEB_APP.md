# Cookmate on iPhone (web app)

The Android app is the product. To use Cookmate every day on an iPhone without an Apple developer account
(US$99 a year), it is also published as a web app that installs on the home screen and opens full screen like an app.
It talks to the same live database and AI as the phone builds, so whatever you do in it is real data.

**Address:** `https://cookmate-chi.vercel.app/` (Vercel project `cookmate` in the `adsynth` team, linked to this repository)

## Deploy on Vercel (done 20 Nov 2026)

`vercel.json` at the repository root holds every setting, so there is nothing to fill in:

1. vercel.com → **Add New… → Project** → import the GitHub repository `adsynthio/cookmate`.
2. Leave **Root Directory** as the repository root and **Framework Preset** as "Other"; `vercel.json` sets the install
   command (`npm ci` in `apps/mobile`), the build (`node tools/web/vercel-build.mjs`) and the output (`apps/mobile/dist`).
3. Optional, for Google Play: Settings → Environment Variables → `SUPPORT_EMAIL` and `OPERATOR`. With both set, the
   privacy policy and account deletion pages are added at `/legal/privacy` and `/legal/delete-account`.
4. **Deploy.** The first build takes a few minutes. After that, every push to `main` redeploys, and every pull request
   gets its own preview address.

The live Supabase URL and its public (anon) key come from `apps/mobile/eas.json`; no secrets are needed on Vercel.

## Install on the iPhone

1. Open the address above in **Safari** (not Chrome; only Safari can add a web app to the home screen).
2. Tap **Share** (the square with an arrow) → **Add to Home Screen** → keep "Open as Web App" on → **Add**.
3. Open Cookmate **from the home screen icon** and do the setup there.

Opened from the icon, Cookmate fills the whole screen edge to edge, with no Safari address bar or toolbar: the app runs
under the status bar (clock and battery sit on an olive band) and down to the home indicator. In a Safari tab you
always see Safari's own bars; that's Safari, not the app.

Do step 3 in the installed app, not in a Safari tab. The home-screen app keeps its own storage, separate from Safari,
and your account lives in that storage. Set up in a Safari tab and you'd have to set up again in the app. Safari can
also clear a tab's data after 7 days without a visit; the home-screen app is exempt.

## What works and what doesn't

| Feature | On iPhone web app |
|---|---|
| Setup, family, diets, kitchen, picks, recipes, cooking steps, cues, whistle counter | Works |
| AI: picks, "make it from my kitchen", new dishes, ask a question, rescue, swaps | Works (live AI) |
| Photo scan of fridge, shelf or bill | Works: **Take or choose a photo** opens the iPhone camera or library. The live camera view and barcode scanning are Android only |
| Shopping list, share to WhatsApp | Works (iPhone share sheet) |
| Timers | Run while the app is open. With the screen locked or another app in front, they keep counting but **no alarm sounds**. Keep Cookmate open while something is on the stove |
| Screen staying on while cooking | Usually works (iOS 18.4 or later); if it dims, raise Settings → Display → Auto-Lock |
| Voice commands ("next", "repeat") | Depends on iOS: Safari's speech recognition isn't reliable in home-screen apps. Use the buttons |
| Voice Cook (talking with the app) | Not in the web app |
| Notifications (prep nudges, use-soon, restock reminders) | Not in the web app |
| No internet | The app opens and says you're offline; it needs the internet to load your kitchen |

## If something goes wrong

- **Blank or old screen after an update:** close the app (swipe it away) and open it again.
- **Starting over:** You → Privacy → Delete my account, then open the app again.
- **Losing the account:** deleting the home-screen icon deletes its storage, and with it the account. Linking a phone
  number would bring it back, but that needs an SMS provider in Supabase (PLAN.md, KIT-021).

## How it's built

- `apps/mobile/public/`: page template with the iPhone home-screen tags (full screen, `viewport-fit=cover`,
  black-translucent status bar with an olive band behind it), icons, manifest, and `sw.js` (keeps the app files on
  the phone so it opens on a weak connection).
- `tools/web/vercel-build.mjs`: exports the app with the public settings from `eas.json`, fills in the template and
  adds the `/legal` pages when `SUPPORT_EMAIL` and `OPERATOR` are set.
- `vercel.json`: build settings, the fallback that sends every app route to `index.html` (so reloading any screen
  works), `/privacy` and `/delete-account` shortcuts, and cache headers (bundles cached for a year, `sw.js` never).
