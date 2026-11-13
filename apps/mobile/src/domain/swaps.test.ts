import { test } from "node:test";
import assert from "node:assert/strict";

import catalog from "../data/catalog.json" with { type: "json" };
import { pantryMatch, type PantryEntry, type RankRecipe } from "./ranking.ts";
import { cheaperSwaps, SKIPPABLE, SWAPS, swapBetween, swapsFor, swapsPrompt, twistsFor, withKitchenSwaps } from "./swaps.ts";

const known = new Set((catalog as { name: string; category: string }[]).map((c) => c.name));
const category = new Map((catalog as { name: string; category: string }[]).map((c) => [c.name, c.category]));

test("every swap uses catalog keys and stays plain veg", () => {
  for (const x of SWAPS) {
    assert.ok(known.has(x.from), `unknown from: ${x.from}`);
    assert.ok(known.has(x.to), `unknown to: ${x.to}`);
    assert.ok(!["meat", "seafood", "egg"].includes(category.get(x.to) ?? ""), `non-veg swap: ${x.id}`);
    assert.ok(x.ratio > 0);
  }
  for (const k of SKIPPABLE) assert.ok(known.has(k), `unknown skippable: ${k}`);
  assert.equal(new Set(SWAPS.map((x) => x.id)).size, SWAPS.length);
});

test("recipe substitutes come first, kitchen swaps after, no repeats", () => {
  assert.deepEqual(withKitchenSwaps("fresh cream", ["cashews"]), ["cashews", "milk", "curd"]);
  assert.deepEqual(withKitchenSwaps("salt", []), []);
  assert.equal(swapBetween("paneer", "tofu")?.taste, "lighter");
  assert.equal(swapBetween("paneer", "chicken"), null);
  assert.ok(swapsFor("paneer").length >= 2);
});

const entry = (key: string): PantryEntry => ({ itemId: key, key, confidence: 1, daysLeft: null, out: false });
const shahi: RankRecipe = {
  id: "x", slug: "x", title: { en: "x" } as never, course: "main", diet: "veg", timeMin: 30, spiceLevel: 2,
  equipment: [], tags: [], flavor: {},
  ingredients: [
    { key: "paneer", optional: false, role: "main", substitutes: withKitchenSwaps("paneer", []) },
    { key: "fresh cream", optional: false, role: "rich", substitutes: withKitchenSwaps("fresh cream", ["cashews"]) },
  ],
  equipmentFallbacks: [],
} as RankRecipe;

test("a kitchen swap unlocks a dish, but never into something avoided", () => {
  const m = pantryMatch(shahi, [entry("tofu"), entry("cashews")], []);
  assert.deepEqual(m.items.map((i) => [i.status, i.substitute]), [["substitute", "tofu"], ["substitute", "cashews"]]);
  const nuts = pantryMatch(shahi, [entry("tofu"), entry("cashews"), entry("milk")], [], ["cashews"]);
  assert.equal(nuts.items[1]?.substitute, "milk");
  const none = pantryMatch(shahi, [], [], ["tofu"]);
  assert.equal(none.items[0]?.status, "missing");
  assert.equal(none.items[0]?.substitute, "soya chunks");
});

test("cheaper swaps only from what the cook has, minus avoided", () => {
  const has = (k: string) => ["milk", "ghee", "peanuts"].includes(k);
  assert.deepEqual(cheaperSwaps(["fresh cream", "butter", "cashews"], has).map((x) => x.id), ["cream_milk", "butter_ghee", "cashew_peanut"]);
  assert.deepEqual(cheaperSwaps(["cashews"], has, ["peanuts"]), []);
  // Only costly things: tomato → curd is a swap, not a saving.
  assert.deepEqual(cheaperSwaps(["tomato"], () => true), []);
});

test("twists fit the dish and come from the kitchen", () => {
  const aloo = { course: "main", diet: "veg", tags: [], ingredients: ["potato", "onion", "tomato", "cumin seeds"] };
  const has = (k: string) => ["milk", "cashews", "gram flour", "curd"].includes(k);
  const offers = twistsFor(aloo, has);
  assert.deepEqual(offers.map((o) => o.twist), ["shahi", "kofta"]);
  assert.deepEqual(offers[0]?.uses, ["milk", "cashews"]);
  // Without nuts (allergy) shahi drops out.
  assert.ok(!twistsFor(aloo, has, ["cashews"]).some((o) => o.twist === "shahi"));
  // Kofta uses the dish's own paneer, not potato from the kitchen.
  const paneer = { course: "main", diet: "veg", tags: [], ingredients: ["paneer", "green peas", "onion", "tomato"] };
  assert.deepEqual(twistsFor(paneer, (k) => ["potato", "gram flour"].includes(k)).find((o) => o.twist === "kofta")?.uses, ["gram flour", "paneer"]);
  // A dry snack gets no curry twists.
  const snack = { course: "snack", diet: "veg", tags: [], ingredients: ["paneer", "capsicum"] };
  assert.deepEqual(twistsFor(snack, has).map((o) => o.twist), ["tikka"]);
  // Nothing in the kitchen, nothing offered.
  assert.deepEqual(twistsFor(aloo, () => false), []);
});

test("prompt line lists cheap swaps with how-to", () => {
  const line = swapsPrompt(["fresh cream", "salt"]);
  assert.match(line, /fresh cream → milk/);
  assert.doesNotMatch(line, /salt/);
});
