# App content forms: answers

Play Console → Policy → App content. Every form must be done before the first release, closed testing included.

| Form | Answer | Notes |
|---|---|---|
| **Privacy policy** | `https://adsynthio.github.io/cookmate/privacy.html` | From `site/privacy.html` |
| **App access** | All functionality is available without special access | No login: the app opens on an anonymous account. Voice Cook is switched on per household and isn't shown otherwise, so reviewers see a complete app |
| **Ads** | No, my app does not contain ads | |
| **Content rating** | See the questionnaire below | |
| **Target audience** | 18 and over only | The beta consent excludes under-18 account holders (`docs/beta/RECRUITMENT.md`). Choosing 18+ keeps the app out of the Families policy. Answer **No** to "appeal to children" |
| **News app** | No | |
| **COVID-19 tracing** | No | |
| **Data safety** | `docs/play/DATA_SAFETY.md` | |
| **Government app** | No | |
| **Financial features** | My app doesn't provide any financial features | Cost per plate is an estimate, not a payment |
| **Health apps** | Tick **Nutrition and weight management** only | The weekly plate shows food groups and a balance tip. No medical claims, no tracking of weight or conditions |
| **Account deletion** | Delete URL `https://adsynthio.github.io/cookmate/delete-account.html` | In-app path: You → Privacy → Delete my account |

## Content rating questionnaire (IARC)

Category: **All other app types** (not a game, not social: circles are private and invite-only).

| Question | Answer | Why |
|---|---|---|
| Violence, blood, sexual content, nudity, profanity, crude humour, fear | No | |
| Controlled substances: alcohol, tobacco or drugs | **Yes: references to alcohol** | The Drinks tab (off by default) has cocktail recipes, shown only after an "I'm 18 or older" confirmation (`app/(tabs)/drinks.tsx`). No tobacco or drugs |
| Gambling or simulated gambling | No | |
| Users can interact or exchange content | **Yes** | Private cooking circles: households share dishes and notes. Reports hide a post, and 3 reports remove it |
| Shares the user's current physical location with others | No | |
| Allows users to purchase digital goods | No | |
| Unrestricted internet access (a browser) | No | |

Expect a rating around 12+ / Teen because of the alcohol references, with the "Users interact" note. That's fine
for an 18+ audience. To get 3+ / Everyone instead, remove the cocktails from `apps/mobile/src/data/drinks.ts`
before the first release and answer No.

## AI-generated content policy

Play requires apps that generate content with AI to let users report or flag offensive output without leaving
the app. Cookmate already does this:

- The report button on every AI recipe (`report_recipe`) hides it at once.
- AI recipes are labelled.
- Kill switches (`ai_off_*` feature flags) turn any AI feature off without an app update.
- AI recipes pass a safety check before showing, and a second reviewer (`docs/AI_RECIPES_PLAN.md`).

## Permissions the build asks for

From `npx expo prebuild` on 19 Nov 2026. Each one is asked for at the moment it's needed, not at install.

| Permission | Used for | Play declaration needed? |
|---|---|---|
| `CAMERA` | Fridge, shelf and bill photos, barcodes, "snap the pan" | No |
| `RECORD_AUDIO` | Voice commands while cooking, Voice Cook | No |
| `POST_NOTIFICATIONS` | Prep nudges, use-soon and restock reminders (each can be switched off) | No |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE`, `RECEIVE_BOOT_COMPLETED`, `MODIFY_AUDIO_SETTINGS` | Normal permissions | No |

Removed in `app.json` → `blockedPermissions`: storage read/write and draw-over-other-apps, which Expo adds by default
but the app never uses. Photos from the gallery come through the system photo picker, so the photo and video
permissions policy doesn't apply.
