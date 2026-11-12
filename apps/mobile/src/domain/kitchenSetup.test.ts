import assert from "node:assert/strict";
import { test } from "node:test";

import { addSetupItem, dietAllows, dishesWithin, fitsDiet, isLeftoverText, removeSetupItem, suggestionsFor, type SetupEntry, type SetupItem } from "./kitchenSetup.ts";

const CATALOG: Record<string, SetupEntry> = {
  milk: { name: "milk", category: "dairy", allergens: ["milk"] },
  curd: { name: "curd", category: "dairy", allergens: ["milk"] },
  paneer: { name: "paneer", category: "dairy", allergens: ["milk"] },
  egg: { name: "egg", category: "egg" },
  tomato: { name: "tomato", category: "vegetable" },
  chicken: { name: "chicken", category: "meat" },
  onion: { name: "onion", category: "vegetable", flags: ["jain_avoid"] },
  "green peas": { name: "green peas", category: "vegetable" },
  salt: { name: "salt", category: "spice", staple: true },
};
const lookup = (n: string) => CATALOG[n];

test("veg homes aren't offered egg or chicken; jain homes aren't offered onion", () => {
  assert.equal(suggestionsFor("fridge", "veg", [], lookup).includes("egg"), false);
  assert.equal(suggestionsFor("fridge", "veg", [], lookup).includes("chicken"), false);
  assert.equal(suggestionsFor("fridge", "nonveg", [], lookup).includes("chicken"), true);
  assert.equal(suggestionsFor("pantry", "jain", [], lookup).includes("onion"), false);
  assert.equal(fitsDiet("vegan", CATALOG.milk), false);
  assert.equal(fitsDiet("veg", undefined), true, "the household's own food is allowed");
});

test("things already chosen aren't suggested again, and unknown names are skipped", () => {
  const s = suggestionsFor("fridge", "veg", [{ name: "milk" }], lookup);
  assert.equal(s.includes("milk"), false);
  assert.equal(s.includes("curd"), true);
  assert.equal(s.includes("lemon"), false, "not in this test catalog");
});

test("adding the same thing twice keeps one, in the latest place; removing works", () => {
  let items: SetupItem[] = [];
  items = addSetupItem(items, { name: "paneer", place: "fridge", known: true });
  items = addSetupItem(items, { name: "paneer", place: "freezer", known: true });
  items = addSetupItem(items, { name: "  ", place: "fridge", known: false });
  assert.deepEqual(items, [{ name: "paneer", place: "freezer", known: true }]);
  assert.deepEqual(removeSetupItem(items, "paneer"), []);
});

test("dishes within reach need most of their main ingredients; staples count as present", () => {
  const recipes = [
    { slug: "matar-paneer", title: "Matar Paneer", diet: "veg", ingredients: [{ ingredient: "paneer" }, { ingredient: "green peas" }, { ingredient: "tomato" }, { ingredient: "salt" }] },
    { slug: "egg-bhurji", title: "Egg Bhurji", diet: "eggetarian", ingredients: [{ ingredient: "egg" }, { ingredient: "tomato" }] },
    { slug: "kheer", title: "Kheer", diet: "veg", ingredients: [{ ingredient: "milk" }, { ingredient: "rice" }, { ingredient: "sugar" }] },
  ];
  const items: SetupItem[] = ["paneer", "green peas", "tomato", "egg"].map((name) => ({ name, place: "fridge", known: true }));
  const isStaple = (n: string) => !!CATALOG[n]?.staple;
  assert.deepEqual(dishesWithin(items, recipes, isStaple, "veg").map((d) => d.slug), ["matar-paneer"], "egg dish hidden for veg");
  assert.deepEqual(dishesWithin(items, recipes, isStaple, "eggetarian").map((d) => d.slug), ["egg-bhurji", "matar-paneer"]);
  assert.deepEqual(dishesWithin([], recipes, isStaple, "veg"), []);
});

test("diet labels: a veg home can cook vegan and jain dishes, a jain home only jain or vegan", () => {
  assert.equal(dietAllows("veg", "vegan"), true);
  assert.equal(dietAllows("veg", "eggetarian"), false);
  assert.equal(dietAllows("jain", "veg"), false);
  assert.equal(dietAllows("nonveg", "nonveg"), true);
});

test("typed leftovers are leftovers, not raw ingredients", () => {
  for (const t of ["leftover rice", "leftover kadhi", "bacha hua chawal", "बची हुई दाल", "kal ki sabzi", "Leftovers dal"]) assert.equal(isLeftoverText(t), true, t);
  for (const t of ["rice", "toor dal", "paneer", "black chickpeas"]) assert.equal(isLeftoverText(t), false, t);
});
