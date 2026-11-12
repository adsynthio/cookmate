# Beta gate review (KIT-152)

One meeting at the end of the beta (week of 8 Mar 2027) to decide: **launch**, **extend the beta**, or **stop and
rework**. This page is the template; copy it to `GATE_REVIEW_<date>.md`, fill it in, and commit it so the decision is
on record.

## The targets (PRD §15, BRD §3)

| # | Target | Goal | Where the number comes from |
|---|---|---|---|
| 1 | Pick acceptance: sets of picks where one was accepted | ≥ 40% | gate report `pick_acceptance` |
| 2 | Cooking frequency: completed sessions per active household per week | ≥ 3 | `cooking_frequency` |
| 3 | Activation: new households that finish a guided dish within 7 days | ≥ 40% | `activation` |
| 4 | Hands-free rate: completed voice sessions with no taps after starting | ≥ 60% | `hands_free_rate` |
| 5 | Voice latency, end of speech to first audio | p50 ≤ 1.0 s, p95 ≤ 1.8 s | `voice_latency_p50_ms`, `voice_latency_p95_ms` |
| 6 | Pantry trust: corrections per household per week | ≤ 5 | `pantry_trust` |
| 7 | Waste rescue: items due to spoil that were cooked in time | ≥ 50% | `waste_rescue` |
| 8 | Retention: households still active on day 30 | ≥ 25% | `retention_d30` |
| 9 | Cost per voice session | ≤ ₹5 | `voice_cost_inr` |
| 10 | Rescue success: sessions finished after asking for a rescue | ≥ 80% | `rescue_success` |

How each is worked out is in `supabase/migrations/20270209000100_beta_gate.sql`. Two things to know when reading them:
- every number comes with **how many things it was measured on**. The Monday report says "too few to say" under 20.
  A target met on a handful of sessions is not met.
- these count every household. The PostHog dashboard (`docs/ANALYTICS.md`) counts only households that agreed to
  analytics, so the two will differ a little; where they differ a lot, find out why before deciding.

## Taking the snapshot

For the whole beta, with the database connection string (never commit it):

```bash
psql "$SUPABASE_DB_URL" -c "select kpi, value, target, met, sample from private.beta_gate_report('2027-02-08 00:00+05:30', '2027-03-08 00:00+05:30')"
```

Or run "Weekly cost and latency report" from the Actions tab with `days` set to 28 and copy the "Beta targets" table.
Paste the table below, and attach a screenshot of the PostHog dashboard taken the same day.

## Snapshot (date: ______)

| Target | Now | Goal | Measured on | Met? |
|---|---|---|---|---|
| | | | | |

Urban and rural separately, if the numbers differ:

## Beyond the numbers

- Food safety: any incident or near miss reported? (One unresolved incident blocks launch whatever the numbers say.)
- Field findings: open `field-test` issues at P0 / P1 / P2: __ / __ / __
- Security review (`docs/SECURITY_REVIEW.md`): all findings fixed or signed off? Open: ______
- Content: published, reviewed dishes: ____ of the 300 planned. Fasting dishes: ____
- What users said, in their words (three quotes, good and bad):

## Decision

☐ **Launch** ☐ **Extend the beta by __ weeks** to fix: ______ ☐ **Stop and rework**: ______

Decided by: ______ Date: ______

Targets missed and accepted anyway, with the reason for each:

What changes before launch (owner, date):
