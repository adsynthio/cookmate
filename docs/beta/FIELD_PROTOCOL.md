# Rural field observation protocol (KIT-151)

Goal: find every point where a first-time user gets stuck with voice, by watching without helping. 5 sessions per
dialect. Findings become GitHub issues labelled `field-test`.

## Before the visit

- Consent on file (RECRUITMENT.md), including whether recording is allowed. Ask again at the door.
- Two people: one **observer** who watches and writes, one **companion** (the local coordinator) who puts the
  household at ease. Neither teaches the app.
- Go at a real cooking time, to cook a real meal the household was going to make anyway. Bring nothing they have to
  cook for you.
- Note the kitchen: stove type, where the phone can stand, noise (pressure cooker, exhaust fan, TV, children),
  network bars, and who else is in the room.

## What you say (and nothing more)

At the start, in their language:

> "We are testing this app, not you. There are no wrong answers. Please use it the way you would if we were not
> here, and say out loud what you are thinking. If you get stuck, I will stay quiet for a while to see what you try.
> You can stop whenever you like."

Then hand over the phone at the first screen and stop talking.

## The no-help rule

| Situation | What the observer does |
|---|---|
| They hesitate or look at you | Wait. Count 30 seconds silently. |
| They ask "what do I do?" | "What would you try?" Once. Then wait again. |
| Stuck for 2 minutes on the same thing | Give the smallest hint that unblocks them, write down exactly what you said, and mark the step **assisted**. |
| The app says something wrong or confusing | Don't correct it. Write down the words it used and what they did next. |
| **Anything unsafe** (hot oil, pressure cooker, undercooked meat or egg, a child near the stove) | **Step in at once.** Safety always beats the protocol. Log it as a P0 finding. |

## What to cover in one session (about 45 minutes)

1. First open → language → who eats here → consent screens. Do they understand what each consent is for?
2. Telling it what is in the kitchen, by voice: do they speak naturally ("do kilo aloo")? Is the read-back right?
3. Tonight's pick: do they understand why it was picked? Do they trust it?
4. Cooking one dish hands-free: "next", "repeat", a timer, a question mid-step, a whistle count.
5. One thing going wrong, if it happens by itself (don't stage it): what do they say to the app?
6. Finishing: rating, what comes off the kitchen list.

## What to write down

One line per event, as it happens, with the time:

`time · step · what they said or did (their words) · what the app did · outcome: ok / slow / wrong / gave up / assisted`

Also mark:
- every time they **repeat themselves** to the app (count per session);
- every time they **reach for the phone with wet or floury hands** (hands-free failed);
- words they use that the app didn't understand (exact spelling as heard);
- any moment they say something like "it doesn't listen", "too fast", "I don't know what to say".

Do not write names. Use the household code.

## Recording rules

- Audio only with the box ticked on the consent form **and** a yes on the day. No video. No faces in photos.
- Record on the observer's device, not the test phone. Transfer to the team drive the same day, delete from the
  device, name the file with the household code and date.
- Delete recordings 30 days after the gate review. They are for fixing the product, never for publicity.
- The app's own transcripts follow the in-app consent, not this form.

## After the session

Ask three questions, then stop:
1. "What was the hardest part?"
2. "Was there a moment you wanted to stop?"
3. "Would you use it tomorrow by yourself? What would have to change?"

Within 24 hours, file one issue per distinct friction point:

- Title: what the user tried and what happened ("Said 'agla' for next; nothing happened").
- Labels: `field-test`, the area (`area:voice`, `area:app`...), and a priority.
- Body: dialect, household code, step, their exact words, what the app did, assisted or not, how many of the
  sessions so far showed it.
- Priority: **P0** anything unsafe, or a user who could not finish a dish. **P1** needed help to continue. **P2**
  slowed down but recovered alone.

## Done when

- [ ] 5 sessions per dialect completed
- [ ] Every friction point filed with `field-test`
- [ ] A one-page summary per dialect: completion rate without help, top 5 frictions, words not understood
