import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { fitsToday, leadHours, nextDay, planMoment, prepNeeds } from "./prepAhead.ts";

const recipes = JSON.parse(readFileSync(new URL("../data/recipes.json", import.meta.url), "utf8")) as { slug: string; steps: { text: string; minutes?: number }[]; ingredients: { ingredient: string; role: string; optional?: boolean }[] }[];
const doc = (slug: string) => recipes.find((r) => r.slug === slug)! as never;

test("rajma needs an overnight soak; quick dishes need nothing", () => {
  const n = prepNeeds(doc("rajma"), []);
  assert.deepEqual(n, [{ kind: "soak", hours: 8, item: "kidney beans", step: 1 }]);
  assert.equal(leadHours(n), 8);
  assert.deepEqual(prepNeeds(doc("kanda-poha"), []), []);
  assert.equal(fitsToday(n, 10, 20), true);
  assert.equal(fitsToday(n, 17, 20), false);
});

test("curd to set from milk, and frozen things to thaw", () => {
  const kitchen = [{ key: "milk" }, { key: "chicken", location: "freezer" }];
  const kinds = prepNeeds(doc("chicken-curry"), kitchen).map((x) => [x.kind, x.item]);
  assert.deepEqual(kinds, [["set_curd", "curd"], ["defrost", "chicken"]]);
  // Curd in the kitchen: nothing to set.
  assert.deepEqual(prepNeeds(doc("chicken-curry"), [{ key: "curd" }]), []);
});

test("evenings offer tomorrow, days show the plan, nights stay quiet", () => {
  assert.equal(planMoment(20), "evening");
  assert.equal(planMoment(9), "day");
  assert.equal(planMoment(2), "none");
  assert.equal(nextDay("2026-12-31"), "2027-01-01");
});
