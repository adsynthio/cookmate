import { test } from "node:test";
import assert from "node:assert/strict";

import { learnable, recordStep, yourSeconds, yourTotalMinutes, type StepTimes } from "./stepTimes.ts";

const onions = { minutes: 8, technique: "saute_onion" };
const cooker = { minutes: 10, technique: "pressure_cook", whistles: 3 };
const rest = { minutes: 20, timer: true };

test("only hands-on steps are learned", () => {
  assert.equal(learnable(onions), true);
  assert.equal(learnable(cooker), false);
  assert.equal(learnable(rest), false);
  assert.equal(learnable({ minutes: 5, technique: "soak" }), false);
  assert.equal(learnable({ seconds: 30 }), false);
});

test("two cooks move the step part of the way, within limits", () => {
  let t: StepTimes = {};
  t = recordStep(t, "rajma", 3, onions, 12 * 60, 1);
  assert.equal(yourSeconds(t, "rajma", 3, onions), 480, "one cook is not enough");
  t = recordStep(t, "rajma", 3, onions, 12 * 60, 2);
  // 480 + 0.6 * (720 - 480) = 624 → 630
  assert.equal(yourSeconds(t, "rajma", 3, onions), 630);
  // A much slower cook is capped at 1.6x.
  let slow: StepTimes = {};
  for (let i = 0; i < 3; i++) slow = recordStep(slow, "rajma", 3, onions, 30 * 60, i);
  assert.equal(yourSeconds(slow, "rajma", 3, onions), 780);
  // Faster cooks come down, but never below 0.6x.
  let fast: StepTimes = {};
  for (let i = 0; i < 3; i++) fast = recordStep(fast, "rajma", 3, onions, 2.5 * 60, i);
  assert.equal(yourSeconds(fast, "rajma", 3, onions), 300);
});

test("skips and walk-aways are not measures; process steps never change", () => {
  let t: StepTimes = {};
  t = recordStep(t, "rajma", 3, onions, 20, 1);
  t = recordStep(t, "rajma", 3, onions, 50 * 60, 2);
  assert.deepEqual(t, {});
  t = recordStep(t, "rajma", 1, cooker, 25 * 60, 3);
  t = recordStep(t, "rajma", 1, cooker, 25 * 60, 4);
  assert.deepEqual(t, {});
  assert.equal(yourSeconds(t, "rajma", 1, cooker), 600);
  // Only the last five are kept.
  for (let i = 0; i < 8; i++) t = recordStep(t, "rajma", 3, onions, 600, i);
  assert.equal(t["rajma:3"]?.length, 5);
});

test("total time moves only when the steps moved by two minutes or more", () => {
  const steps = [cooker, onions, { minutes: 2, technique: "tadka" }];
  let t: StepTimes = {};
  assert.equal(yourTotalMinutes(t, "rajma", steps, 45), null);
  t = recordStep(t, "rajma", 2, onions, 14 * 60, 1);
  t = recordStep(t, "rajma", 2, onions, 14 * 60, 2);
  // onions: 480 → 480 + 0.6*360 = 696 → 690 (+210 s) → 45 min + 3.5 → 49
  assert.equal(yourTotalMinutes(t, "rajma", steps, 45), 49);
});
