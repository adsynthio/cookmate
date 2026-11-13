import { test } from "node:test";
import assert from "node:assert/strict";

import { minutesOf, clockOf } from "./dinnerPlan.ts";
import { guestMenu, menuTimeline, tiffinFrom, type MenuDish } from "./guests.ts";

const d = (slug: string, course: string, diet: string, groups: string[], minutes: number[]): MenuDish => ({
  slug, course, diet, food_groups: groups, steps: minutes.map((m, i) => ({ text: `step ${i + 1}`, minutes: m, technique: i === 0 && m >= 15 ? "pressure_cook" : "bhuna" })),
});
const dishes = [
  d("matar-paneer", "main", "veg", ["sabzi", "dairy"], [10, 20, 10]),
  d("chicken-curry", "main", "nonveg", ["protein"], [10, 30, 20]),
  d("dal-tadka", "main", "veg", ["dal"], [25, 10, 5]),
  d("moong-dal-khichdi", "main", "veg", ["dal", "grain"], [20, 5]),
  d("plain-dal", "component", "veg", ["dal"], [15, 5]),
  d("boiled-chana", "component", "vegan", ["dal", "protein"], [480, 35]),
  d("jeera-aloo", "side", "vegan", ["sabzi"], [10, 10]),
];
const needs: Record<string, number> = { "matar-paneer": 1, "chicken-curry": 0, "dal-tadka": 0, "plain-dal": 0, "jeera-aloo": 0, "moong-dal-khichdi": 0, "boiled-chana": 0 };

test("a menu everyone can eat, fewest things to buy", () => {
  // A veg guest: chicken is out even though it needs nothing.
  const veg = guestMenu(dishes, ["veg", "nonveg"], 6, (s) => needs[s] ?? 9);
  assert.deepEqual(veg, { main: "matar-paneer", dal: "plain-dal", side: "jeera-aloo", rotis: 18 });
  // All non-veg: the curry needs nothing, so it wins.
  assert.equal(guestMenu(dishes, ["nonveg"], 4, (s) => needs[s] ?? 9)?.main, "chicken-curry");
  // Khichdi (dal + grain) is a one-pot meal, not the dal on the side; boiled chana is a batch, not a dish.
  assert.ok(!["moong-dal-khichdi", "boiled-chana"].includes(veg!.dal!));
  assert.equal(guestMenu([], ["veg"], 4, () => 0), null);
});

test("one timeline for the whole menu", () => {
  const menu = { main: "matar-paneer", dal: "plain-dal", side: "jeera-aloo", rotis: 12 };
  const plan = menuTimeline(menu, (s) => dishes.find((x) => x.slug === s), minutesOf("20:00"), 2);
  // No wait long enough for the roti dough, so it's kneaded before starting: 40 min of matar paneer + 8.
  assert.equal(clockOf(plan.start), "7:12");
  assert.equal(plan.items.filter((i) => i.kind === "serve").length, 1);
  assert.ok(plan.items.some((i) => i.kind === "rotis" && i.dish === "matar-paneer"));
  assert.deepEqual([...new Set(plan.items.map((i) => i.dish))].sort(), ["jeera-aloo", "matar-paneer", "plain-dal"]);
});

test("tomorrow's tiffin from tonight's dish", () => {
  assert.deepEqual(tiffinFrom("dal-tadka", 2), { idea: "dal_paratha", extra: 2 });
  assert.equal(tiffinFrom("roti", 2), null);
  assert.equal(tiffinFrom("rajma", 0), null);
});
