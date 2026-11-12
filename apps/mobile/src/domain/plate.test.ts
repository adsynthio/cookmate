import assert from "node:assert/strict";
import { test } from "node:test";

import { aimShare, balanceTip, plateWeeks, weekStart, weeklyTips, weeksBefore, weeksFromRows, type PlateWeek } from "./plate.ts";

test("weekStart is the Monday in India time", () => {
  assert.equal(weekStart("2026-11-12T10:00:00Z"), "2026-11-09"); // Thursday
  assert.equal(weekStart("2026-11-09T00:00:00+05:30"), "2026-11-09"); // Monday midnight IST
  assert.equal(weekStart("2026-11-08T20:00:00Z"), "2026-11-09"); // Sunday 20:00 UTC is Monday 01:30 IST
  assert.equal(weekStart("2026-11-15T18:00:00Z"), "2026-11-09"); // Sunday 23:30 IST
  assert.equal(weeksBefore("2026-11-12T10:00:00Z", 1), "2026-11-02");
  assert.equal(weeksBefore("2026-11-12T10:00:00Z", 0), "2026-11-09");
});

test("plateWeeks counts meals per group per week, newest first, with empty weeks", () => {
  const weeks = plateWeeks(
    [
      { completedAt: "2026-11-10T14:00:00Z", groups: ["dal"] },
      { completedAt: "2026-11-11T14:00:00Z", groups: ["sabzi", "dairy", "protein", "sabzi"] },
      { completedAt: "2026-11-03T14:00:00Z", groups: ["dal", "grain", "unknown"] },
      { completedAt: "2026-09-01T14:00:00Z", groups: ["dal"] },
    ],
    new Date("2026-11-12T12:00:00Z"),
    3,
  );
  assert.deepEqual(weeks.map((w) => w.weekStart), ["2026-11-09", "2026-11-02", "2026-10-26"]);
  assert.equal(weeks[0]!.meals, 2);
  assert.deepEqual(weeks[0]!.counts, { dal: 1, sabzi: 1, greens: 0, fruit: 0, dairy: 1, protein: 1, grain: 0 });
  assert.equal(weeks[1]!.counts.grain, 1);
  assert.equal(weeks[2]!.meals, 0);
});

const week = (meals: number, counts: Partial<PlateWeek["counts"]>): PlateWeek => ({
  weekStart: "2026-11-09",
  meals,
  counts: { dal: 0, sabzi: 0, greens: 0, fruit: 0, dairy: 0, protein: 0, grain: 0, ...counts },
});

test("weekly tips: none for a thin or balanced week, at most two, biggest gap first, scaled to meals", () => {
  assert.deepEqual(weeklyTips(week(2, {})), []);
  assert.deepEqual(weeklyTips(week(10, { dal: 5, sabzi: 5, dairy: 3 })), ["greens", "fruit"]);
  assert.deepEqual(weeklyTips(week(10, { greens: 2, fruit: 2, dairy: 3 })), ["sabzi", "dal"]);
  assert.deepEqual(weeklyTips(week(4, { dal: 2, sabzi: 2, greens: 1, dairy: 1, fruit: 1 })), []);
  assert.deepEqual(weeklyTips(week(10, { dal: 4, sabzi: 5, greens: 2, dairy: 3, fruit: 2 })), []);
});

test("bars fill toward the weekly aim", () => {
  assert.equal(aimShare(week(10, { dal: 2 }), "dal"), 0.5);
  assert.equal(aimShare(week(10, { dal: 9 }), "dal"), 1);
  assert.equal(aimShare(week(4, { grain: 2 }), "grain"), 0.5);
});

test("balance tip: one thing to add beside a dish, or nothing", () => {
  assert.equal(balanceTip(["grain"], { course: "breakfast", diet: "veg" }), "addProtein");
  assert.equal(balanceTip(["grain"], { course: "breakfast", diet: "vegan" }), "addProteinVegan");
  assert.equal(balanceTip(["dal"], { course: "main" }), "addVeg");
  assert.equal(balanceTip(["protein"], { course: "main" }), "addVeg");
  assert.equal(balanceTip(["sabzi", "dairy", "protein"], { course: "main" }), null);
  assert.equal(balanceTip(["sabzi"], { course: "side" }), null);
  assert.equal(balanceTip([], { course: "main" }), null);
  assert.equal(balanceTip(undefined), null);
});

test("database rows become weeks, empty weeks filled in", () => {
  const weeks = weeksFromRows([{ week_start: "2026-11-02", meals: 3, food_groups: { dal: 2, greens: 1, meals: 3 } }], new Date("2026-11-12T12:00:00Z"), 2);
  assert.deepEqual(weeks.map((w) => [w.weekStart, w.meals]), [["2026-11-09", 0], ["2026-11-02", 3]]);
  assert.equal(weeks[1]!.counts.dal, 2);
  assert.equal(weeks[1]!.counts.sabzi, 0);
});
