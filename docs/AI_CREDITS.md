# AI credits

Every kitchen has AI credits. When they run out, the AI features that cost real money pause instead of running up the
bill. Added 21 Nov 2026 (T1). Code: `supabase/migrations/20270524000000_ai_credits.sql` and
`supabase/functions/_shared/credits.ts`.

## How it works

- 1 credit = ₹1 of real AI cost. Each AI call is logged in `ai_requests`, priced with `private.usage_cost_inr`, and
  taken off the kitchen's credits by a database trigger.
- A new kitchen starts with **50 credits** (the trial). They don't expire.
- Every kitchen also gets **5 free credits a day**. They come back at midnight India time, are used first, and don't
  pile up.
- At zero, the paid features pause until the next day's free credits or a top-up. Photo scans, Ask Cookmate, new
  dishes, family recipes and voice cooking say so in the app. AI picks and adapting a recipe quietly use the app's rules.
- These are free and never pause: the safety review of AI recipes, help while cooking that is typed or tapped
  (questions, "I changed something", rescue, the photo check), understanding typed text, learning from cooking and
  read-aloud audio of recipe steps. Each costs under 2 paise.
- Voice cooking is paid. When a voice session ends, `record_voice_session` logs its model and speech use in
  `ai_requests` (`voice_turns`, `voice_tts`, `voice_stt`), and the trigger takes that off. At zero, `voice-token` starts
  no new session and the app offers tapping and typing instead.
- A call can cost more than what's left; the balance stops at zero instead of going below.
- The limits of 60 AI calls an hour and 300 a day per kitchen still apply.

In the app, You → AI credits shows what's left and today's free credits (an unlimited kitchen just says so). When a
paused feature is used, Ask, Scan, New dish and Family recipe say that the AI is paused until midnight; scanning still
takes typed items and barcodes. The preview (mock) build keeps the same rules on the phone, under
`cookmate.mock.credits` in local storage.

What things cost (Sonnet 5.5, Nov 2026):

| Feature | Credits |
|---|---|
| Photo scan | about 1.8 (about 0.7 for more photos within a few minutes) |
| New dish | about 1.7 |
| Ask Cookmate | about 0.3 |
| AI picks | about 0.5 |

So the trial is about 25 photo scans, or 28 new dishes, or 150 questions. The daily 5 is about 2 scans or 15 questions.

## Owner tools

Run these in the Supabase SQL editor.

```sql
-- See every kitchen's credits
select household_id, balance, daily_used, daily_on, unlimited, spent_total from public.ai_credits;

-- Top up a kitchen (adds to its balance)
select private.add_ai_credits('<household id>', 100);

-- The owner's and testers' kitchens: never paused (spending is still counted)
select private.set_ai_unlimited('<household id>', true);

-- A different trial for new kitchens, or a different daily amount for new kitchens
alter table public.ai_credits alter column balance set default 100;
alter table public.ai_credits alter column daily_allowance set default 10;
-- ...and for kitchens that already exist
update public.ai_credits set daily_allowance = 10;
```

A new AI task is paid unless it's added to `private.ai_task_is_free`.
