import assert from "node:assert/strict";
import { test } from "node:test";

import { nextRestock, rhythmKey, snoozeDays, snoozeUntil, type RestockDue } from "./restock.ts";

const atta: RestockDue = { ingredientKey: "whole wheat flour", everyDays: 12, lastBought: "2026-11-01", dueInDays: 1 };
const oil: RestockDue = { ingredientKey: "mustard oil", everyDays: 30, lastBought: "2026-10-14", dueInDays: 0 };
const now = Date.parse("2026-11-12T10:00:00Z");

test("one question at a time, the soonest first, skipping snoozed ones", () => {
  assert.equal(nextRestock([atta, oil], {}, now)?.ingredientKey, "mustard oil");
  assert.equal(nextRestock([atta, oil], { "mustard oil": snoozeUntil(oil, now) }, now)?.ingredientKey, "whole wheat flour");
  assert.equal(nextRestock([atta], { "whole wheat flour": "2026-11-01T00:00:00Z" }, now)?.ingredientKey, "whole wheat flour");
  assert.equal(nextRestock([], {}, now), null);
});

test("Not yet waits half the usual gap, between 2 and 7 days", () => {
  assert.equal(snoozeDays(12), 6);
  assert.equal(snoozeDays(3), 2);
  assert.equal(snoozeDays(40), 7);
});

test("the rhythm in everyday words", () => {
  assert.deepEqual(rhythmKey(7.2), { key: "week", n: 1 });
  assert.deepEqual(rhythmKey(14), { key: "weeks", n: 2 });
  assert.deepEqual(rhythmKey(30), { key: "month", n: 1 });
  assert.deepEqual(rhythmKey(11.6), { key: "days", n: 12 });
});
