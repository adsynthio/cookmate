// Recipe helpers against the real bundled content (src/data/recipes.json, generated from content/recipes).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DEFAULT_WEIGHTS, NO_CRAVING, rankRecipes, type RankContext } from "./ranking.ts";
import { familyBranches, inLocalUnits, recipeTitle, scaleQty, searchRecipes, toRankRecipe, totalTime, type RecipeDoc } from "./recipes.ts";

const docs = JSON.parse(readFileSync(new URL("../data/recipes.json", import.meta.url), "utf8")) as RecipeDoc[];
const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as {
  name: string; hi: string; latn: string; aliases?: string[]; staple?: boolean;
}[];
const byName = new Map(catalog.map((c) => [c.name, c]));
const names = (key: string) => {
  const c = byName.get(key);
  return c ? [c.hi, c.latn, ...(c.aliases ?? [])] : [];
};
const doc = (slug: string) => docs.find((d) => d.slug === slug)!;

test("every bundled recipe converts to ranking input", () => {
  assert.equal(docs.length >= 10, true);
  for (const d of docs) {
    const r = toRankRecipe(d);
    assert.ok(r.timeMin > 0, d.slug);
    assert.ok(r.ingredients.length > 0, d.slug);
  }
  assert.deepEqual(toRankRecipe(doc("jeera-aloo")).equipmentFallbacks, ["pressure_cooker"]);
  assert.equal(totalTime(doc("jeera-aloo")), 25);
});

test("titles follow the language", () => {
  assert.equal(recipeTitle(doc("rajma"), "hi"), "राजमा");
  assert.equal(recipeTitle(doc("egg-bhurji"), "hinglish"), "Anda Bhurji");
  assert.equal(recipeTitle(doc("egg-bhurji"), "en"), "Egg Bhurji");
});

test("search finds rajma however it is written (REC-08)", () => {
  for (const q of ["rajma", "राजमा", "kidney bean curry", "Rajmah", "rajma recipe"]) {
    const hits = searchRecipes(docs, q, names);
    assert.equal(hits[0]?.slug, "rajma", `query ${q}: ${hits.map((h) => h.slug).join(", ")}`);
  }
  assert.equal(searchRecipes(docs, "pizza", names).length, 0);
  assert.ok(searchRecipes(docs, "aloo", names).some((d) => d.slug === "jeera-aloo"));
});

test("servings scale and round like a cook would measure", () => {
  assert.equal(scaleQty(500, 4, 2), 250);
  assert.equal(scaleQty(28, 4, 3), 21);
  assert.equal(scaleQty(1.5, 4, 3), 1.25);
  assert.equal(scaleQty(0.2, 4, 2), 0.1);
});

test("grams become katori or pieces when the catalog knows the measure", () => {
  assert.deepEqual(inLocalUnits(280, "g", { katori: 140 }), { qty: 2, unit: "katori" });
  assert.deepEqual(inLocalUnits(300, "g", { piece: 150 }), { qty: 2, unit: "piece" });
  assert.deepEqual(inLocalUnits(37, "g", { katori: 140 }), { qty: 37, unit: "g" });
  assert.deepEqual(inLocalUnits(2, "piece", { katori: 140 }), { qty: 2, unit: "piece" });
});

test("family plates name the child at the right step", () => {
  const eaters = [
    { name: "Sunita", ageGroup: "adult" as const },
    { name: "Aarav", ageGroup: "child" as const },
  ];
  const b = familyBranches(doc("dal-tadka"), eaters);
  assert.equal(b.length, 1);
  assert.deepEqual(b[0]!.members, ["Aarav"]);
  assert.match(b[0]!.action, /before adding the chilli/);
  assert.equal(familyBranches(doc("dal-tadka"), [eaters[0]!]).length, 0);
});

test("ranking over the real recipes: dinner picks for a veg family use what's there", () => {
  const ctx: RankContext = {
    slot: "dinner",
    eaters: [
      { id: "m1", name: "Sunita", ageGroup: "adult", diet: "veg", spice: 3 },
      { id: "c1", name: "Aarav", ageGroup: "child", diet: "veg", spice: 1 },
    ],
    pantry: [
      { itemId: "1", key: "potato", confidence: 0.9, daysLeft: 1, out: false },
      { itemId: "2", key: "onion", confidence: 0.9, daysLeft: 20, out: false },
      { itemId: "3", key: "toor dal", confidence: 0.9, daysLeft: null, out: false },
    ],
    staples: catalog.filter((c) => c.staple).map((c) => c.name),
    equipment: null,
    avoid: [],
    like: [],
    prefer: [],
    recent: [],
    craving: NO_CRAVING,
    timeBudgetMin: 45,
    weights: DEFAULT_WEIGHTS,
  };
  const ranked = rankRecipes(docs.map(toRankRecipe), ctx);
  assert.ok(ranked.length >= 3);
  assert.ok(ranked.every((r) => r.recipe.diet !== "nonveg" && r.recipe.diet !== "eggetarian"));
  assert.equal(ranked[0]!.recipe.slug, "jeera-aloo");
});
