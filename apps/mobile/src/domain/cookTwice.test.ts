// F4: cook once, eat twice.
import assert from "node:assert/strict";
import { test } from "node:test";

import recipesJson from "../data/recipes.json" with { type: "json" };
import { cookTwicePlan } from "./cookTwice.ts";
import type { RecipeDoc } from "./recipes.ts";

const library = recipesJson as unknown as RecipeDoc[];
const get = (slug: string) => library.find((r) => r.slug === slug)!;

test("dal keeps two days; rice and khichdi one day, in the fridge within an hour", () => {
  const dal = cookTwicePlan(get("dal-tadka"))!;
  assert.deepEqual(dal.keep, { fridgeWithinHours: 2, eatWithinDays: 2 });
  assert.equal(dal.ideas.length, 2);
  const khichdi = cookTwicePlan(get("moong-dal-khichdi"))!;
  assert.equal(khichdi.riceCare, true);
  assert.deepEqual(khichdi.keep, { fridgeWithinHours: 1, eatWithinDays: 1 });
});

test("meat, egg or paneer dishes keep one day; fried things and bases aren't for keeping", () => {
  assert.equal(cookTwicePlan(get("chicken-curry"))!.keep.eatWithinDays, 1);
  assert.equal(cookTwicePlan(get("matar-paneer"))!.keep.eatWithinDays, 1);
  assert.equal(cookTwicePlan(get("puri")), null);
  assert.equal(cookTwicePlan(get("onion-tomato-masala")), null);
});
