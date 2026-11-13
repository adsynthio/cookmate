// F6: rough meal cost.
import assert from "node:assert/strict";
import { test } from "node:test";

import catalogJson from "../data/catalog.json" with { type: "json" };
import recipesJson from "../data/recipes.json" with { type: "json" };
import { mealCost, PRICE_PER_KG, swapSaving } from "./cost.ts";
import type { RecipeDoc } from "./recipes.ts";
import { swapBetween } from "./swaps.ts";

const library = recipesJson as unknown as RecipeDoc[];
const catalog = new Map((catalogJson as { name: string; category: string }[]).map((c) => [c.name, c]));
const get = (slug: string) => library.find((r) => r.slug === slug)!;

test("every price is for a catalog ingredient", () => {
  for (const k of Object.keys(PRICE_PER_KG)) assert.ok(catalog.has(k), k);
});

test("a plate of everyday dal costs tens of rupees; chicken curry costs more; rounded to ₹5", () => {
  const dal = mealCost(get("dal-tadka"), 4, (k) => catalog.get(k));
  const chicken = mealCost(get("chicken-curry"), 4, (k) => catalog.get(k));
  assert.ok(dal.perPlate >= 5 && dal.perPlate <= 60, `dal ${dal.perPlate}`);
  assert.ok(chicken.perPlate > dal.perPlate, `chicken ${chicken.perPlate} vs dal ${dal.perPlate}`);
  assert.equal(dal.perPlate % 5, 0);
});

test("frying oil counts a quarter, so puri isn't priced like a litre of oil", () => {
  const puri = mealCost(get("puri"), 4, (k) => catalog.get(k));
  assert.ok(puri.perPlate <= 40, `puri ${puri.perPlate}`);
});

test("a cheaper swap shows what it saves", () => {
  const doc = { base_servings: 4, ingredients: [{ ingredient: "fresh cream", qty: 200, unit: "ml", role: "rich" }] } as RecipeDoc;
  assert.ok(swapSaving(doc, 4, swapBetween("fresh cream", "milk")!) > 0);
  assert.equal(swapSaving(doc, 4, swapBetween("paneer", "tofu")!), 0, "not in this dish");
});
