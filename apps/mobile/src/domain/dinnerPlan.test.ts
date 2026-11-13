import { test } from "node:test";
import assert from "node:assert/strict";

import { clockOf, minutesOf, planDinner, rotiMinutes, startsIn, type PlanStep } from "./dinnerPlan.ts";

// Rajma-like: soak overnight is prep-ahead; here a cooker, onions, a simmer and a finish.
const steps: PlanStep[] = [
  { minutes: 25, technique: "pressure_cook", whistles: 6 },
  { minutes: 12, technique: "saute_onion" },
  { minutes: 20, technique: "simmer", timer: true },
  { minutes: 2 },
];
const secs = (n: number) => (steps[n - 1]?.minutes ?? 2) * 60;

test("clock helpers", () => {
  assert.equal(minutesOf("20:30"), 1230);
  assert.equal(clockOf(1230), "8:30");
  assert.equal(clockOf(minutesOf("12:05")), "12:05");
  assert.equal(rotiMinutes(8), 15);
});

test("works backwards from dinner, with meanwhile ideas during waits", () => {
  const plan = planDinner(steps, secs, minutesOf("20:30"), { stoves: 2 });
  assert.equal(clockOf(plan.start), "7:31");
  const kinds = plan.items.map((i) => `${clockOf(i.at)} ${i.kind}${"step" in i ? i.step : ""}`);
  assert.deepEqual(kinds, ["7:31 step1", "7:32 meanwhile1", "7:56 step2", "8:08 step3", "8:09 meanwhile3", "8:28 step4", "8:30 serve"]);
  const m1 = plan.items.find((i) => i.kind === "meanwhile" && i.step === 1);
  assert.deepEqual(m1 && "what" in m1 ? [m1.what, m1.next] : null, ["next", 2]);
  const m3 = plan.items.find((i) => i.kind === "meanwhile" && i.step === 3);
  assert.equal(m3 && "what" in m3 ? m3.what : null, "next");
});

test("rotis: dough in the first wait; made alongside with two stoves, after on one", () => {
  const two = planDinner(steps, secs, minutesOf("20:30"), { stoves: 2, rotis: 8 });
  assert.equal(clockOf(two.start), "7:31");
  const m1 = two.items.find((i) => i.kind === "meanwhile" && i.step === 1);
  assert.equal(m1 && "what" in m1 ? m1.what : null, "dough");
  const r = two.items.find((i) => i.kind === "rotis");
  assert.equal(clockOf(r!.at), "8:15");
  const one = planDinner(steps, secs, minutesOf("20:30"), { stoves: 1, rotis: 8 });
  // The dish ends 15 minutes earlier so the one stove is free for the tawa.
  assert.equal(clockOf(one.start), "7:16");
  assert.equal(startsIn(one, minutesOf("19:00")), 16);
});

test("no wait long enough: dough is kneaded before starting", () => {
  const quick: PlanStep[] = [{ minutes: 5, technique: "tadka" }, { minutes: 10, technique: "bhuna" }];
  const plan = planDinner(quick, (n) => (quick[n - 1]?.minutes ?? 2) * 60, minutesOf("20:00"), { stoves: 2, rotis: 4 });
  assert.equal(plan.items[0]?.kind, "dough");
  assert.equal(clockOf(plan.start), "7:37");
});

test("an overnight soak is done ahead: the evening starts after it, and no dough goes in it", () => {
  const rajma: PlanStep[] = [{ minutes: 480, technique: "soak" }, { minutes: 30, technique: "pressure_cook", whistles: 5 }, { minutes: 10, technique: "bhuna" }];
  const plan = planDinner(rajma, (n) => (rajma[n - 1]?.minutes ?? 2) * 60, minutesOf("20:00"), { stoves: 2, rotis: 6 });
  assert.equal(clockOf(plan.start), "7:20");
  assert.deepEqual(plan.items[0], { at: minutesOf("11:20"), kind: "ahead", step: 1, minutes: 480 });
  const m = plan.items.find((i) => i.kind === "meanwhile");
  assert.equal(m && "what" in m ? m.what : null, "dough");
  assert.equal(m && "step" in m ? m.step : null, 2);
});
