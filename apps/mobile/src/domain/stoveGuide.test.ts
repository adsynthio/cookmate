import assert from "node:assert/strict";
import { test } from "node:test";

import { calibrate, planFor, stoveSetting } from "./stoveGuide.ts";
import { heatOf, setHeat, type Tool } from "./tools.ts";

const L8 = { style: "levels", max: 8 } as const;

test("medium heat in each stove's own words", () => {
  assert.deepEqual(stoveSetting({ heat: "medium" }, "gas", L8, "en")?.line, "Medium flame");
  assert.equal(stoveSetting({ heat: "medium" }, "induction", L8, "en")?.line, "Level 5 of 8 (about 1200 W)");
  assert.equal(stoveSetting({ heat: "medium" }, "induction", { style: "levels", max: 10 }, "en")?.line, "Level 6 of 10 (about 1200 W)");
  assert.equal(stoveSetting({ heat: "medium" }, "induction", { style: "watts" }, "en")?.line, "About 1200 W");
  assert.equal(stoveSetting({ heat: "low" }, "induction", L8, "hinglish")?.line, "8 mein se level 3 (lagbhag 800 watt)");
});

test("technique decides: pressure cooker, frying, tadka, simmer", () => {
  assert.equal(stoveSetting({ technique: "pressure_cook", heat: "high" }, "gas", L8, "en")?.line, "High flame until the first whistle, then low to medium flame");
  const pc = stoveSetting({ technique: "pressure_cook" }, "induction", L8, "en")!;
  assert.equal(pc.line, "Level 7 of 8 (about 1800 W) until the first whistle, then level 4");
  assert.match(pc.note!, /induction-base cooker/);
  assert.equal(stoveSetting({ technique: "deep_fry" }, "gas", L8, "en")?.line, "Medium-high flame · oil at 170–180°C");
  assert.match(stoveSetting({ technique: "tadka" }, "induction", L8, "en")!.note!, /30 seconds/);
  assert.equal(stoveSetting({ technique: "tadka" }, "gas", L8, "en")!.note, null);
  assert.match(stoveSetting({ technique: "simmer" }, "induction", L8, "en")!.note!, /click on and off/);
});

test("the recipe's own heat wins; the technique adds the rest", () => {
  // Kadhi: "simmer" but the recipe says medium until the first boil.
  const kadhi = stoveSetting({ technique: "simmer", heat: "medium" }, "induction", L8, "en")!;
  assert.equal(kadhi.line, "Level 5 of 8 (about 1200 W)");
  assert.equal(kadhi.note, null);
  assert.match(stoveSetting({ technique: "simmer", heat: "low" }, "induction", L8, "en")!.note!, /click on and off/);
  assert.equal(stoveSetting({ technique: "deep_fry", heat: "medium" }, "gas", L8, "en")?.line, "Medium flame · oil at 170–180°C");
});

test("no stove for soaking or batter; pan notes only once", () => {
  assert.equal(planFor({ technique: "soak" }), null);
  assert.equal(stoveSetting({ technique: "batter", heat: null }, "gas", L8, "en"), null);
  assert.equal(stoveSetting({}, "gas", L8, "en"), null);
  const first = stoveSetting({ technique: "saute_onion" }, "induction", L8, "en")!;
  assert.equal(first.noteKey, "kadaiFlat");
  assert.equal(stoveSetting({ technique: "bhuna" }, "induction", L8, "en", new Set(["kadaiFlat"]))!.note, null);
});

test("S1: a stove that runs hot gets a level lower, a slow one a level higher", () => {
  assert.equal(stoveSetting({ heat: "medium" }, "gas", L8, "en", new Set(), -1)?.line, "Low to medium flame");
  assert.equal(stoveSetting({ heat: "medium" }, "induction", L8, "en", new Set(), 1)?.line, "Level 6 of 8 (about 1600 W)");
  // Clamped at the ends.
  assert.equal(stoveSetting({ heat: "low" }, "gas", L8, "en", new Set(), -2)?.line, "Low flame");
  // The cooker's "then" moves too.
  assert.equal(stoveSetting({ technique: "pressure_cook" }, "gas", L8, "en", new Set(), -1)?.line, "Medium-high flame until the first whistle, then low flame");
});

test("S1: two taps the same way move the stove one level; the other way starts again", () => {
  const one = calibrate(undefined, "hot");
  assert.deepEqual(one, { next: { shift: 0, pending: { vote: "hot", n: 1 } }, changed: false });
  const two = calibrate(one.next, "hot");
  assert.deepEqual(two, { next: { shift: -1 }, changed: true });
  const other = calibrate({ shift: -1, pending: { vote: "hot", n: 1 } }, "slow");
  assert.deepEqual(other, { next: { shift: -1, pending: { vote: "slow", n: 1 } }, changed: false });
  // Never past two levels.
  assert.deepEqual(calibrate({ shift: -2, pending: { vote: "hot", n: 1 } }, "hot"), { next: { shift: -2 }, changed: false });
});

test("S1: what was learned lives on the household's stove", () => {
  const tools: Tool[] = [{ type: "gas_stove", details: { burners: 3 } }, { type: "induction" }];
  const next = setHeat(tools, "gas", { shift: -1 });
  assert.deepEqual(heatOf(next, "gas"), { shift: -1 });
  assert.equal(next[0]?.details?.burners, 3);
  assert.equal(heatOf(next, "induction"), undefined);
  assert.equal(heatOf(setHeat(next, "gas", undefined), "gas"), undefined);
});
