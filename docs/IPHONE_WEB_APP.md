# Cookmate on iPhone (web app)

The Android app is the product. To use Cookmate every day on an iPhone without an Apple developer account
(US$99 a year), it is also published as a web app that installs on the home screen and opens full screen like an app.
It talks to the same live database and AI as the phone builds, so whatever you do in it is real data.

**Address:** `https://adsynthio.github.io/cookmate/app/`

## Turn it on (once)

GitHub → `adsynthio/cookmate` → Settings → Pages → Source: **GitHub Actions**. Then Actions → "Publish site and web
app" → Run workflow. After that, every change merged into `apps/mobile` republishes it within a few minutes.

## Install on the iPhone

1. Open the address above in **Safari** (not Chrome; only Safari can add a web app to the home screen).
2. Tap **Share** (the square with an arrow) → **Add to Home Screen** → keep "Open as Web App" on → **Add**.
3. Open Cookmate **from the home screen icon** and do the setup there.

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

- `apps/mobile/public/`: page template with the iPhone home-screen tags, icons, manifest, and `sw.js` (keeps the app
  files on the phone so it opens on a weak connection).
- `apps/mobile/app.config.js`: sets the `/cookmate/app` base path when `WEB_BASE_URL` is set; native builds don't set it.
- `tools/web/finalize.py`: fills in the base path and adds `404.html`, so reloading any screen works on GitHub Pages.
- `.github/workflows/site.yml`: builds with the public settings from `apps/mobile/eas.json` and publishes.
