import { test } from "node:test";
import assert from "node:assert/strict";

import { bestBuys, stillNeeds } from "./buyFew.ts";
import type { PantryEntry, RankRecipe } from "./ranking.ts";

const dish = (slug: string, keys: string[], extra: Partial<RankRecipe> = {}): RankRecipe =>
  ({
    id: slug, slug, title: slug, course: "main", diet: "veg", timeMin: 30, spiceLevel: 2, equipment: [], tags: [], flavor: {},
    ingredients: keys.map((k) => ({ key: k, optional: false, role: "base", substitutes: k === "fresh cream" ? ["milk"] : [] })),
    equipmentFallbacks: [], ...extra,
  }) as RankRecipe;
const have = (...keys: string[]): PantryEntry[] => keys.map((k) => ({ itemId: k, key: k, confidence: 1, daysLeft: null, out: false }));

const recipes = [
  dish("matar-paneer", ["paneer", "green peas", "onion"]),
  dish("palak-paneer", ["paneer", "spinach"]),
  dish("paneer-bhurji", ["paneer", "onion", "tomato"]),
  dish("aloo-matar", ["potato", "green peas"]),
  dish("shahi-paneer", ["paneer", "fresh cream", "onion"]),
  dish("chicken-curry", ["chicken", "onion"], { diet: "nonveg" }),
  dish("roti", ["whole wheat flour"], { course: "component" }),
  dish("jeera-aloo", ["potato"]),
];

test("what a dish still needs: swaps and staples count as having it", () => {
  assert.deepEqual(stillNeeds(recipes[4]!, have("onion", "milk"), []), ["paneer"]);
  assert.deepEqual(stillNeeds(recipes[2]!, have("paneer"), ["onion", "tomato"]), []);
  assert.deepEqual(stillNeeds(recipes[2]!, [{ itemId: "t", key: "tomato", confidence: 1, daysLeft: null, out: true }, ...have("paneer")], ["onion", "tomato"]), ["tomato"]);
});

test("the pair that completes the most dishes wins", () => {
  const best = bestBuys(recipes, have("onion", "tomato", "potato", "milk", "spinach"), [], { diets: ["veg"] });
  // Paneer + peas: matar paneer, palak paneer, paneer bhurji, aloo matar, shahi paneer (cream → milk).
  assert.deepEqual(best?.buy, ["green peas", "paneer"]);
  assert.deepEqual(best?.unlocks.sort(), ["aloo-matar", "matar-paneer", "palak-paneer", "paneer-bhurji", "shahi-paneer"]);
});

test("one item is enough when a second adds nothing; diet, avoid and basics respected", () => {
  const one = bestBuys(recipes, have("onion", "tomato", "spinach", "milk", "green peas", "potato"), [], { diets: ["veg"] });
  assert.deepEqual(one?.buy, ["paneer"]);
  // Chicken is never suggested to a veg household; a non-veg one could get it.
  assert.ok(!bestBuys(recipes, have("onion"), [], { diets: ["veg"] })?.buy.includes("chicken"));
  // Paneer avoided: no paneer dishes, nothing worth two.
  const noPaneer = bestBuys(recipes, have("onion", "tomato", "potato", "spinach"), [], { diets: ["veg"], avoid: ["paneer"] });
  assert.equal(noPaneer, null);
  // Rotis need atta, but basics are not "dishes unlocked".
  assert.ok(!bestBuys(recipes, have(), [], { diets: ["veg"] })?.unlocks.includes("roti"));
});
