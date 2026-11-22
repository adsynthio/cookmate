import assert from "node:assert/strict";
import { test } from "node:test";

import { durationParts, overnightSoak } from "./duration.ts";

test("minutes under an hour stay minutes; longer reads as hours", () => {
  assert.deepEqual(durationParts(35), { kind: "min", n: 35 });
  assert.deepEqual(durationParts(60), { kind: "hr", n: 1 });
  assert.deepEqual(durationParts(90), { kind: "hrMin", h: 1, m: 30 });
  assert.deepEqual(durationParts(150), { kind: "hrMin", h: 2, m: 30 });
  assert.deepEqual(durationParts(515), { kind: "hrMin", h: 8, m: 35 });
  assert.deepEqual(durationParts(122), { kind: "hr", n: 2 }, "past 2 hours, rounded to 5 minutes");
});

test("an overnight soak is said apart from the hands-on time", () => {
  assert.deepEqual(overnightSoak({ prep_time_min: 480, cook_time_min: 35, steps: [{ technique: "soak" }, { technique: "boil" }] }), { activeMin: 35 });
  assert.equal(overnightSoak({ prep_time_min: 20, cook_time_min: 60, steps: [{ technique: "soak" }] }), null, "rajma counts only hands-on prep");
  assert.equal(overnightSoak({ prep_time_min: 480, cook_time_min: 35, steps: [{ technique: "boil" }] }), null);
});
