import assert from "node:assert/strict";
import { test } from "node:test";

import { clock, convertQty, countWhistle, deductionPreview, remaining, stepSeconds } from "./cooking.ts";

test("step times and clocks", () => {
  assert.equal(stepSeconds({ minutes: 5 }), 300);
  assert.equal(stepSeconds({ seconds: 30 }), 30);
  assert.equal(stepSeconds({}), null);
  assert.equal(clock(75), "1:15");
  assert.equal(clock(3725), "1:02:05");
  assert.equal(remaining({ endsAt: 10_500 }, 0), 11);
  assert.equal(remaining({ endsAt: 0 }, 5000), 0);
});

test("whistles count up to the target once", () => {
  assert.deepEqual(countWhistle(0, 3), { count: 1, reached: false });
  assert.deepEqual(countWhistle(2, 3), { count: 3, reached: true });
  assert.deepEqual(countWhistle(3, 3), { count: 3, reached: false });
});

test("units convert like the database does", () => {
  assert.equal(convertQty(250, "g", "kg", {}), 0.25);
  assert.equal(convertQty(280, "g", "katori", { katori: 140 }), 2);
  assert.equal(convertQty(2, "piece", "g", { piece: 150 }), 300);
  assert.equal(convertQty(1, "bunch", "g", {}), null);
  assert.equal(convertQty(3, "piece", "piece", undefined), 3);
});

test("deduction preview: scaled by servings, in the pantry's units, staples without a quantity", () => {
  const doc = {
    base_servings: 4,
    ingredients: [
      { ingredient: "potato", qty: 500, unit: "g", role: "base" },
      { ingredient: "cumin seeds", qty: 4, unit: "g", role: "spice" },
      { ingredient: "coriander leaves", qty: 10, unit: "g", role: "garnish", optional: true },
    ],
  };
  const lines = deductionPreview(doc, 2, [
    { id: "p1", ingredientKey: "potato", quantity: 2, unit: "kg", stapleLevel: null, expiryDate: "2026-12-01" },
    { id: "p0", ingredientKey: "potato", quantity: 1, unit: "kg", stapleLevel: null, expiryDate: "2026-11-12" },
    { id: "c", ingredientKey: "cumin seeds", quantity: null, unit: null, stapleLevel: "full", expiryDate: null },
    { id: "k", ingredientKey: "coriander leaves", quantity: 1, unit: "bunch", stapleLevel: null, expiryDate: null },
  ], () => ({}));
  assert.deepEqual(lines, [
    { itemId: "c", ingredient: "cumin seeds", quantity: null, unit: "g", currentQuantity: null, staple: true },
    { itemId: "p0", ingredient: "potato", quantity: 0.25, unit: "kg", currentQuantity: 1, staple: false },
  ]);
});
