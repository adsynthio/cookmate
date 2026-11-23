import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { fitsToday, leadHours, nextDay, planMoment, prepNeeds } from "./prepAhead.ts";
import { aheadHours } from "./recipes.ts";

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

test("a batter soaked, ground and fermented overnight is all done ahead; a long simmer once cooking is not", () => {
  const ings = [{ ingredient: "rice", qty: 300, unit: "g", role: "base" }];
  const dosa = {
    ingredients: ings,
    steps: [
      { text: "Soak the rice and urad dal for 6 hours.", technique: "soak", minutes: 360 },
      { text: "Grind into a smooth batter.", technique: "batter", minutes: 15 },
      { text: "Cover and leave overnight to ferment.", technique: "batter", minutes: 540 },
      { text: "Stir the batter." },
      { text: "Heat the tawa.", technique: "tawa_cook", minutes: 3, heat: "medium" as const },
    ],
  };
  // 6 h soak + 15 min grind + 9 h ferment: about 16 hours, not just the 6-hour soak.
  assert.equal(aheadHours(dosa), 16);
  assert.deepEqual(prepNeeds(dosa as never, []), [{ kind: "soak", hours: 16, item: "rice", step: 1 }]);
  // A short knead before a 2-hour rest doesn't add an hour: the span starts at the first long step.
  const bhatura = {
    ingredients: [{ ingredient: "maida", qty: 250, unit: "g", role: "base" }],
    steps: [
      { text: "Knead a soft dough.", technique: "knead", minutes: 8 },
      { text: "Cover and leave it to rest for 2 hours.", minutes: 120 },
      { text: "Fry.", technique: "deep_fry", minutes: 5, heat: "high" as const },
    ],
  };
  assert.deepEqual(prepNeeds(bhatura as never, []), [{ kind: "rest", hours: 2, item: "maida", step: 2 }]);
  // Cooking has started (heat, a pressure cooker): a 3-hour slow simmer after that is not prep.
  const slow = {
    ingredients: ings,
    steps: [
      { text: "Pressure cook.", technique: "pressure_cook", minutes: 30, whistles: 3 },
      { text: "Simmer on low.", minutes: 180 },
    ],
  };
  assert.equal(aheadHours(slow), 0);
  assert.deepEqual(prepNeeds(slow as never, []), []);
});
