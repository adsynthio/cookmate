import assert from "node:assert/strict";
import { test } from "node:test";

import catalogJson from "../data/catalog.json" with { type: "json" };
import { dishEmoji, foodTint, ingredientEmoji } from "./foodEmoji.ts";

const catalog = catalogJson as { name: string; category: string }[];

test("every catalog ingredient gets a food emoji, never the empty plate", () => {
  const plain = catalog.filter((c) => ingredientEmoji(c.name, c.category) === "🍽️").map((c) => c.name);
  assert.deepEqual(plain, []);
});

test("ingredients: exact names first, then words, then the category", () => {
  assert.equal(ingredientEmoji("potato", "vegetable"), "🥔");
  assert.equal(ingredientEmoji("spinach", "vegetable"), "🥬");
  assert.equal(ingredientEmoji("Paneer", "dairy"), "🧀");
  assert.equal(ingredientEmoji("hari chutney", "homemade"), "🥣");
  assert.equal(ingredientEmoji("kal ki dal", "leftover"), "🍲");
  assert.equal(ingredientEmoji("toor dal", "pulse"), "🍲");
  assert.equal(ingredientEmoji("something new", "fruit"), "🧺");
  assert.equal(ingredientEmoji(null, null), "🍽️");
});

test("dishes: the most telling word wins, then the course", () => {
  assert.equal(dishEmoji("egg-bhurji"), "🍳");
  assert.equal(dishEmoji("chicken-curry"), "🍗");
  assert.equal(dishEmoji("Plain Paratha"), "🫓");
  assert.equal(dishEmoji("boiled-chana"), "🫘");
  assert.equal(dishEmoji("moong-dal-khichdi"), "🍚");
  assert.equal(dishEmoji("Motichoor Laddu"), "🍬");
  assert.equal(dishEmoji("onion-tomato-masala"), "🥘");
  assert.equal(dishEmoji("Mystery dish", "dessert"), "🍮");
  assert.equal(dishEmoji(null), "🍛");
});

test("tints group foods by colour family", () => {
  assert.equal(foodTint("vegetable"), "green");
  assert.equal(foodTint("chicken"), "cream");
  assert.equal(foodTint("meat"), "rose");
  assert.equal(foodTint("spice"), "spice");
  assert.equal(foodTint(undefined), "cream");
});
