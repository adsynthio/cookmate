import assert from "node:assert/strict";
import { test } from "node:test";

import { amountChoices, needsAmount } from "./amounts.ts";

const labels = (e: Parameters<typeof amountChoices>[0]) => amountChoices(e).map((a) => `${a.n} ${a.word}`);

test("amounts the way each thing is bought", () => {
  assert.deepEqual(labels({ name: "onion", category: "vegetable", unit: "g" }), ["250 g", "500 g", "1 kg", "2 kg"]);
  assert.deepEqual(labels({ name: "toor dal", category: "pulse", unit: "g" }), ["500 g", "1 kg", "2 kg", "5 kg"]);
  assert.deepEqual(labels({ name: "milk", category: "dairy", unit: "ml" }), ["500 ml", "1 l", "2 l"]);
  assert.deepEqual(labels({ name: "mustard oil", category: "oil_fat", unit: "ml" }), ["500 ml", "1 l", "5 l"]);
  assert.deepEqual(labels({ name: "egg", category: "egg", unit: "piece" }), ["6 piece", "12 piece", "30 piece"]);
  assert.deepEqual(labels({ name: "spinach", category: "vegetable", unit: "bunch" }), ["1 bunch", "2 bunch", "3 bunch"]);
  assert.deepEqual(labels({ name: "paneer", category: "dairy", unit: "g" }), ["200 g", "500 g", "1 kg"]);
  assert.deepEqual(labels({ name: "garam masala", category: "spice", unit: "g" }), ["50 g", "100 g", "200 g", "500 g"]);
  assert.deepEqual(labels(undefined), []);
});

test("amounts are stored in the item's own unit", () => {
  assert.deepEqual(amountChoices({ name: "onion", category: "vegetable", unit: "g" })[2], { quantity: 1000, unit: "g", n: 1, word: "kg" });
  assert.deepEqual(amountChoices({ name: "bread", category: "packaged", unit: "piece" })[0], { quantity: 20, unit: "piece", n: 1, word: "packet" });
});

test("ask only about things that have no amount and are not staples or leftovers", () => {
  assert.equal(needsAmount({ quantity: null, stapleLevel: null, state: "raw" }), true);
  assert.equal(needsAmount({ quantity: 2, stapleLevel: null, state: "raw" }), false);
  assert.equal(needsAmount({ quantity: null, stapleLevel: "full", state: "raw" }), false);
  assert.equal(needsAmount({ quantity: null, stapleLevel: null, state: "leftover" }), false);
});
