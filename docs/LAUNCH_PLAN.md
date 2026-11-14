# Cookmate launch plan (solo, low cost)

Written 14 Nov 2026. Covers getting onto the Play Store, running the app cheaply, and finding the first users, done by one
person. Every number has a source at the bottom; where sources disagree, this says so. Check prices on the vendor's own
page before paying: several of them changed during 2026.

## The plan in one paragraph

Android only, India only, starting with Kannada-, Hindi- and English-speaking homes in Bengaluru. Open a personal Play
developer account now (US$25 once). Use Google's required 14-day closed test with 12+ testers as the beta. Then release to
production in stages. Stay on free tiers until real people use it daily; the first fixed bill is Supabase Pro (about
US$25 a month), and it starts the week the public launch begins. Growth comes from the people already around the
product: you cooking on camera, WhatsApp sharing that the app already does, a listing in three languages, and festival
moments. No paid ads until 30-day retention is known.

## Why these choices

| Choice | Reason |
|---|---|
| Android first, no iPhone yet | Android is about 92–93% of mobile use in India (Statcounter, mid-2026) and 91% of phones shipped in Q2 2026 (Counterpoint). An Apple developer account costs US$99 a year and adds a second review process. |
| India only, Bengaluru first | One city lets one person answer every message, visit homes and fix what breaks. In KPMG–Google research, about 70% of Indian-language internet users found local-language content more reliable than English, and 88% were more likely to respond to ads in their language. Kannada was among the largest language groups. The data is from 2016–2017, but the direction still holds. |
| Personal Play account, not an organisation | It is US$25 and ready in days. An organisation account skips the 12-tester rule but needs a D-U-N-S number, which can take up to 30 days. The tester rule is useful anyway: it is the beta. |
| Free at launch, no subscription yet | You first need to learn whether people come back. If you charge later, Google's fee is 15% or less for 99% of developers (Google). India also allows user-choice billing. |
| Voice limited at launch | Voice is the costliest part (LiveKit minutes plus Sarvam speech). Text cooking, photo scan and picks cost paise per use. |

## Phase 0: get ready (weeks 1–2, 16–29 Nov 2026)

What's already built (from earlier sprints): in-app account deletion, data export, consent screens, a report button on AI
recipes, kill switches, per-household AI limits, crash-safe offline cooking, and analytics with no personal data.

| # | Task | Who | Cost |
|---|---|---|---|
| 0.1 | Open a Google Play Console personal account and finish identity checks | You | US$25 once |
| 0.2 | Add `eas.json` and a production Android build (AAB) | Claude | Free: about 15 Android builds a month on Expo's free plan, or unlimited with `eas build --local` |
| 0.3 | Check the build targets Android 16 (API 36). Google has required this for new apps since 31 Aug 2026. Expo SDK 58 should meet it. | Claude | — |
| 0.4 | Privacy policy and an account-deletion web page. Play requires a working web link where people can ask to delete their account. Host on GitHub Pages. | Claude drafts, you approve | Free (domain optional, about ₹800–1,000 a year) |
| 0.5 | Play forms: Data safety, content rating, target audience (18+, which keeps the app out of the stricter Families rules), ads (none) | Claude drafts the answers from the code, you submit | — |
| 0.6 | Store listing in English, Hindi and Kannada: name, short description, 6–8 captioned screenshots, feature graphic | Claude drafts text and screenshots, you check the Kannada | — |
| 0.7 | Clear the open items: `ANTHROPIC_API_KEY` secret and one library batch; sign off security findings 28–29; Turnstile key; delete the unused `SUPABASE_SERVICE_ROLE_KEY` secret | You | — |
| 0.8 | Voice: deploy the voice agent to LiveKit Cloud's free Build plan (1,000 agent minutes a month, 5 at a time) and keep Voice Cook as an invite-only switch | Claude | Free |
| 0.9 | Fix the stored TTS price: Sarvam lists Bulbul v3 at ₹30 per 10,000 characters, not the ₹15 in `private.usage_prices` | Claude | — |

WhatsApp Business (F8) and push notifications through an EAS phone build (F10) aren't needed for launch. Sharing to
WhatsApp through the phone's share sheet already works and costs nothing.

## Phase 1: closed test = beta (weeks 3–5, 30 Nov – 20 Dec 2026)

Google's rule for personal accounts opened after 13 Nov 2023: before production, the app needs a closed test with at
least 12 testers who stay opted in for 14 days in a row. This is confirmed by several guides; Google's help page is the
authority. One guide says Google started rejecting apps for low tester engagement in 2026, so testers should really use
the app.

- **Recruit 20–25, not 12.** Some people drop out. Use the plan in `docs/beta/RECRUITMENT.md`: friends and family
  (cap 30%), housing-society and school-parent WhatsApp groups. Ask for a Gmail address, which Play needs for the tester
  list.
- **Mix:** a third cook mainly in Kannada and a third in Hindi; some vegetarian, some Jain; a few homes with children.
- **Each tester's job:** cook at least 3 times over the 2 weeks, and answer one 10-minute call (script in `FIELD_PROTOCOL.md`).
- **Don't pause the testing track.** Pausing restarts the 14 days.
- **Measure:** first cook within 48 hours of install; cooks per week; AI cost per household (from the weekly report); crashes.
- **Day 15:** apply for production access. Fix whatever the testers hit hardest first.

## Phase 2: public launch (weeks 6–8, 21 Dec 2026 – 10 Jan 2027)

1. **Upgrade Supabase to Pro** (US$25 a month, which includes US$10 of compute). Free projects pause after 7 days with no
   activity. A paused database during launch week would be the worst failure.
2. **Staged rollout:** 10% → 50% → 100% over about a week. Halt the rollout if the crash rate rises. The AI kill
   switches turn off any single AI feature without an app update.
3. **Country: India only.** Language listings: English, Hindi, Kannada.
4. **Launch moment:** New Year cooking ("cook from what's left after the party") is a soft start. The real Kannada
   moment is **Ugadi in spring 2027**, so plan a "festival menu from your kitchen" push for it. The festival calendar is
   already in the app.

## Phase 3: grow (Jan – Mar 2027)

Steady work, about 10 hours a week on marketing. Weekly rhythm in the section "Doing it alone".

## Running costs

Rates are from late 2026 vendor pages and guides; recheck before paying. US$1 ≈ ₹88 (the rate the app's telemetry uses).

| Item | Testing (Phase 0–1) | Launch, up to about 1,000 households | When it grows |
|---|---|---|---|
| Google Play | US$25 once (≈ ₹2,200) | — | — |
| Supabase | Free (pauses after 7 idle days) | Pro US$25 a month ≈ ₹2,200 | Bigger compute only if the database is the bottleneck |
| Expo / EAS | Free plan or local builds | Free | Starter US$19 a month only if you need faster builds |
| LiveKit (voice) | Build plan, free: 1,000 agent minutes (~65 fifteen-minute sessions) | Free; keep voice invite-only | Ship US$50 a month for 5,000 minutes |
| Sarvam speech | ₹1,000 free credit | Speech to text ₹30 an hour; Bulbul v3 ₹30 per 10,000 characters | Grows with voice minutes; cached step audio keeps it down |
| Claude API | Pennies | See below | Per-household limits already cap it |
| PostHog, GitHub Actions, GitHub Pages | Free tiers | Free tiers | Check limits when monthly users pass a few thousand |
| **Total fixed** | **≈ ₹2,200 once** | **≈ ₹2,200 a month + usage** | |

**AI usage, worked example.** Haiku 5.5 costs US$0.10 per million input tokens and US$0.50 per million output. A
typical Haiku call (about 3,000 tokens in, 500 out) costs about ₹0.05. A Sonnet 5.5 call (US$2 / US$10) for a new dish
(about 5,000 in, 2,000 out) costs about ₹2.6. With caching and the per-household limits, 1,000 active households
should cost a few thousand rupees a month, mostly Sonnet. The Monday cost report shows the real figure from week one.
If it runs high, lower the Sonnet limit per household first.

**Cost rules to keep:**
- Turn on paid plans only on the day they are needed.
- Set a billing alert on every paid service.
- Voice stays invite-only until a cooking session costs under ₹5 (the target in PLAN.md).

## Marketing and distribution

### Who it's for and what to say

**First user:** the person who cooks every day for a family in Bengaluru, at the 7 pm question "what do I make with
what's at home?"

**Message:** *"Tell it what's in your kitchen. It tells you what to cook, and helps you make it — in Kannada, Hindi or
English."*

**Proof points:**
- Swaps the way a real cook swaps (Eno for soda in boondi).
- Breaks a fancy dish into simple parts.
- Knows each person in the family: diet, things they avoid, children.
- Checks the pan from a photo.

**Competitors to know:**
- Sweet'N'Spicy (has a "Pantry Match")
- PlanNEat, AMIYAA, Cookd (meal planning)
- BetterButter (a large recipe library)

None of them sells "cook like an experienced home cook, in your language, from what you have." Lead with that.

### Channels, in order of value for one person with no budget

1. **WhatsApp (about 536 million users in India, DataReportal 2025).** It's where cooking talk already happens. The app
   already shares recipe cards, shopping lists and family hand-offs. Make sure every share carries the Play link. Post
   once in housing-society and parent groups where you are a member. Don't spam groups you aren't in.
2. **Your own cooking on Instagram Reels and YouTube Shorts.** India is Instagram's largest market (estimates range
   from about 360 to 470 million users). Founder-led content costs only time. The Diwali boondi-with-Eno story is
   exactly the kind of clip that works: one real problem, solved with what was in the kitchen, with the app on screen
   for 5 seconds. Film one cooking session and cut it into 3–5 clips. Post 3 a week. Use Kannada captions on some.
3. **Store listing optimisation (free, keeps working).**
   - Captioned screenshots in all three languages.
   - Keywords people type: "what to cook", "Indian recipes from ingredients", "ಅಡುಗೆ", "रेसिपी".
   - After about 2,000 listing visitors, run Play's store listing experiments on the icon and first screenshot. Run each
     test for at least 7–14 days.
   - Google case studies: Koo got 15% more organic installs from local-language custom store listings, and Splendid
     Apps got a 2% conversion lift in India from tested icons and screenshots. Expect gains like these, not the 2–5× that
     vendors advertise.
4. **Invite the family.** A household has up to 6 members, so "add the person who cooks with you" is the most natural
   referral. In a study by Schmitt, Skiera and Van den Bulte (2011), referred customers stayed longer and were worth
   16–25% more. Ask right after a good cook ("Dinner went well? Share it with whoever eats it").
5. **Festival moments.** Ugadi, Ganesh Chaturthi, Navratri fasting, Diwali and Onam. The app already knows these dates
   and the vrat rules. Plan one "festival menu from your kitchen" post and listing update for each.
6. **Small home-cook creators (barter, not paid).** Kannada and Hindi cooks with 2,000–50,000 followers. Offer to feature
   their dish as "dish of the day" with credit. Ask for nothing in return except a fair review if they like it.
7. **Communities (low effort, honest posts only):** r/bangalore, r/IndianFood, Bengaluru food groups. Tell the real
   story, ask for feedback, and don't post the same link everywhere.

**Skip for now:**
- Paid ads, until 30-day retention is known.
- WhatsApp Business API.
- iPhone.
- Other cities.
- Play pre-registration rewards. They need an in-app product, and the app has none.

### What "working" looks like

Food and drink apps keep only about 3–4% of users at day 30 (Braze, UXCam; OneSignal reports about 8% under a different
definition).

| Measure | Target by end of March 2027 |
|---|---|
| Households installed | 1,000 |
| First cook within 48 h of install | 40% (the beta gate in PLAN.md) |
| Day-30 retention | 8% or more (double the category) |
| Cooks per active household per week | 3 or more |
| AI + voice cost per active household per month | under ₹10 |
| Crash-free sessions | 99.5% |

If day-30 retention is under 5% in January, stop marketing and fix the product. More installs won't help an app people
leave.

## Doing it alone

**Weekly rhythm (about 25 hours):**

| Day | Work |
|---|---|
| Monday | Read the automatic weekly report (cost, retention, crashes). Pick the one most important problem. |
| Tuesday–Wednesday | Build or fix that one thing. Ship it through the normal PR, CI and staged rollout. |
| Thursday | Content: cook once, film it, cut 3–5 clips, schedule them for the week. |
| Friday | People: answer every review and message, do 2 tester or user calls, post in one community. |
| Weekend | Cook with the app like a user and note what annoys you. |

**What's already automated:**
- CI tests, function deploys and migrations.
- The Monday cost and latency report.
- AI kill switches and per-household limits.
- Play's staged rollout with halt.
- Evaluations in CI.

**What to hand to Claude:**
- Code and the build setup.
- Store listing text and screenshots.
- Policy page drafts.
- Data safety answers.
- Reply templates for reviews.
- Weekly report summaries.

**What only you can do:**
- Play account identity checks.
- Testers and phone calls.
- Filming yourself cooking.
- Checking Kannada and Hindi copy.
- Any legal sign-off.

**Support:** one email address and the in-app report button. Reply within a day. Write each answer once as a template.

## Risks

| Risk | What to do |
|---|---|
| Testers drop out and the 14 days restart | Recruit 20–25. Message testers on days 3, 7 and 11. |
| Play rejects the app (Data safety doesn't match the code, deletion link broken) | Claude fills the form from the actual code, and the deletion page is tested before submitting. |
| AI or voice cost spike | Kill switches, per-household limits, billing alerts, voice invite-only. |
| Food-safety mistake in an AI recipe | Safety gate, second reviewer, report button and hide. Keep the in-app "check doneness yourself" wording. |
| India's data law (DPDP Rules notified Nov 2025; most duties apply by about May 2027) | Consent, export and delete are built. Get a lawyer to read the privacy policy once (a one-time fee). |
| Burnout | One focus a week. Marketing capped at about 10 hours. Weekends are for cooking. |

## Dates

| When | Milestone |
|---|---|
| 16–29 Nov 2026 | Play account, build, policy pages, listing, open items cleared |
| 30 Nov 2026 | Closed test opens (aim for 20+ testers by 2 Dec) |
| ~16 Dec 2026 | 14 days done; apply for production |
| Late Dec 2026 | Supabase Pro; staged rollout to 100% |
| Jan–Feb 2027 | Content 3×/week, WhatsApp sharing, first listing experiment, retention fixes |
| Ugadi 2027 | First big Kannada push |
| End of Mar 2027 | Review against the targets above; decide on paid features, voice for all, next city |

## Sources

- **Play 12-tester rule:**
  - [ProAndroidDev](https://proandroiddev.com/how-to-get-12-testers-for-google-play-closed-testing-and-actually-pass-6a2ab52a0779)
  - [Choicely](https://www.choicely.com/blog/google-play-12-tester-rule)
  - [ExtendsClass 2026](https://extendsclass.com/blog/google-plays-closed-testing-requirement-what-developers-need-to-know-in-2026)
  - [Google Play Console help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- **Target API 36:**
  - [Android developers: target SDK](https://developer.android.com/google/play/requirements/target-sdk)
  - [Google Play help](https://support.google.com/googleplay/android-developer/answer/11926878?)
- **Account deletion and Data safety:** [Google Play help](https://support.google.com/googleplay/android-developer/answer/13327111)
- **AI-generated content (report button):**
  - [Google Play help](https://support.google.com/googleplay/android-developer/answer/14094294)
  - [Android Developers blog](https://android-developers.googleblog.com/2024/06/enabling-safe-ai-experiences.html)
- **Play fees and India billing:**
  - [Google Play help](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)
  - [Google India blog](https://blog.google/intl/en-in/products/platforms/sustaining-google-play-as-a-valuable-partner-to-indias-app-ecosystem/)
- **Android developer verification (India in 2027):**
  - [Android Authority](https://www.androidauthority.com/android-developer-verification-rollout-sideloading-flow-3653395)
  - [The Register](https://www.theregister.com/2025/08/26/android_developer_verification_sideloading)
- **Expo pricing:**
  - [Expo billing docs](https://docs.expo.dev/billing/plans.md)
  - [Expo pricing](https://expo.dev/pricing)
  - [Toolradar](https://toolradar.com/tools/expo/pricing)
- **Supabase pricing and pausing:**
  - [Supabase FAQ](https://supabase.com/kb/faqs/platform/free-project-pausing)
  - [Toolradar](https://toolradar.com/tools/supabase/pricing)
  - [MakerKit](https://makerkit.dev/blog/saas/supabase-pricing)
- **LiveKit pricing:**
  - [LiveKit pricing](https://livekit.io/pricing)
  - [LiveKit quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/)
- **Sarvam pricing:**
  - [Sarvam API pricing](https://sarvam.ai/api-pricing)
  - [Sarvam docs](https://docs.sarvam.ai/api/pricing)
- **Claude pricing:** Anthropic model list (Haiku 5.5 US$0.10 / US$0.50; Sonnet 5.5 US$2 / US$10 per million tokens)
- **Android share in India:**
  - [Statcounter](https://gs.statcounter.com/os-market-share/mobile/india)
  - [ProPakistani (Counterpoint)](https://propakistani.pk/2026/08/27/android-now-owns-every-three-in-four-smartphones-shipped-worldwide/)
- **WhatsApp in India:**
  - [DemandSage](https://demandsage.com/whatsapp-statistics)
  - [Statista](https://www.statista.com/statistics/1146773/whatsapp-users-in-india/)
- **Instagram in India:**
  - [DemandSage](https://demandsage.com/instagram-reel-statistics)
  - [Free Press Journal](https://www.freepressjournal.in/amp/tech/instagram-reaches-3-billion-monthly-users-tests-reels-first-experience-in-india)
- **Indian languages online:**
  - [KPMG–Google 2017 (PDF)](https://assets.kpmg.com/content/dam/kpmg/in/pdf/2017/04/Indian-languages-Defining-Indias-Internet.pdf)
  - [Quartz](https://qz.com/india/972844/indias-internet-users-have-more-faith-in-content-thats-not-in-english-study-says)
- **Listing experiments and localisation:**
  - [Splendid Apps case study](https://play.google.com/console/about/splendid-casestudy/)
  - [Koo case study](https://play.google.com/console/about/koo-casestudy/)
  - [AppTweak](https://www.apptweak.com/en/aso-blog/basics-of-a-b-testing-in-aso)
- **Referrals:** [Marketing Science Institute report 15-102](https://thearf-org-unified-admin.s3.amazonaws.com/MSI/2020/06/MSI_Report_15-102.pdf)
- **Retention benchmarks:**
  - [Braze](https://www.braze.com/resources/articles/mobile-app-retention)
  - [UXCam](https://uxcam.com/blog/mobile-app-retention-benchmarks/)
  - [Stream](https://getstream.io/blog/app-retention-guide)
- **Pre-registration:** [Google Play help](https://support.google.com/googleplay/android-developer/answer/9859047)
- **Competitors:**
  - [Similarweb (Sweet'N'Spicy and related apps)](https://www.similarweb.com/app/google/com.endless.indianrecipes)
  - [PlanNEat](https://apps.apple.com/app/id6761127147)
- **DPDP Rules:**
  - [YourStory](https://yourstory.com/2025/11/digital-personal-data-protection-dpdp-rules-2025-rollout-over-18-months)
  - [AZB & Partners](https://www.azbpartners.com/bank/update-indias-digital-personal-data-protection-framework-comes-into-effect/)
