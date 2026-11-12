import assert from "node:assert/strict";
import { test } from "node:test";

import { adjustmentFor, offersTimer, rememberedQty, readableLine, clock, convertQty, countWhistle, deductionPreview, remaining, stepSeconds, timerBoard, timerCue } from "./cooking.ts";

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

test("finish sheet: a reviewed line becomes the smallest adjustment", () => {
  const line = { itemId: "i1", ingredient: "paneer", quantity: 200, unit: "g", currentQuantity: 250, staple: false };
  const staple = { itemId: "i2", ingredient: "turmeric", quantity: null, unit: null, currentQuantity: null, staple: true };
  const unknown = { itemId: "i3", ingredient: "curd", quantity: null, unit: "katori", currentQuantity: 1, staple: false };

  // Left as suggested: nothing to send, the preview applies.
  assert.equal(adjustmentFor(line, { on: true, qty: "200", level: null }), null);
  assert.deepEqual(adjustmentFor(line, { on: true, qty: "150", level: null }), { itemId: "i1", quantity: 150 });
  assert.deepEqual(adjustmentFor(line, { on: true, qty: "1,5", level: null }), { itemId: "i1", quantity: 1.5 });
  assert.deepEqual(adjustmentFor(line, { on: false, qty: "200", level: null }), { itemId: "i1", skip: true });
  // A cleared or unreadable amount never falls back to the suggested amount.
  assert.deepEqual(adjustmentFor(line, { on: true, qty: "", level: null }), { itemId: "i1", skip: true });
  assert.deepEqual(adjustmentFor(line, { on: true, qty: "lots", level: null }), { itemId: "i1", skip: true });

  // Staples only change when the cook picks a level.
  assert.equal(adjustmentFor(staple, { on: true, qty: "", level: null }), null);
  assert.deepEqual(adjustmentFor(staple, { on: true, qty: "", level: "low" }), { itemId: "i2", stapleLevel: "low" });
  assert.deepEqual(adjustmentFor(staple, { on: false, qty: "", level: "low" }), { itemId: "i2", skip: true });

  // Units we couldn't compare: nothing is taken off unless the cook types an amount.
  assert.equal(adjustmentFor(unknown, { on: true, qty: "", level: null }), null);
  assert.deepEqual(adjustmentFor(unknown, { on: true, qty: "0.5", level: null }), { itemId: "i3", quantity: 0.5 });
});

test("small amounts of kg and litre items are reviewed in g and ml", () => {
  const onion = { itemId: "i6", ingredient: "onion", quantity: 0.055, unit: "kg", currentQuantity: 1, staple: false };
  const r = readableLine(onion);
  assert.equal(r.line.quantity, 55);
  assert.equal(r.line.unit, "g");
  assert.equal(r.factor, 1000);
  // Typed in grams, sent in the item's unit.
  const adj = adjustmentFor(r.line, { on: true, qty: "80", level: null });
  assert.equal(adj!.quantity! / r.factor, 0.08);
  assert.equal(readableLine({ ...onion, quantity: 1.5 }).factor, 1);
  assert.equal(readableLine({ ...onion, unit: "g", quantity: 0.5 }).factor, 1);
});

test("timers are offered for waits worth timing", () => {
  assert.equal(offersTimer({ minutes: 10 }), true);
  assert.equal(offersTimer({ minutes: 1 }), false);
  assert.equal(offersTimer({ minutes: 1, timer: true }), true);
  assert.equal(offersTimer({ minutes: 480 }), false);
  assert.equal(offersTimer({ minutes: 30, whistles: 3 }), false);
  assert.equal(offersTimer({}), false);
});

test("remembered amounts in the deduction", () => {
  assert.equal(rememberedQty(40, 1.25), 50);
  assert.equal(rememberedQty(3, 1.25), 3.8);
  assert.equal(rememberedQty(2, 0.75), 1.5);
  // The cook didn't touch it, but the remembered amount differs from the recipe's: it is sent as an adjustment.
  const line = { itemId: "g", ingredient: "garlic", quantity: 10, unit: "g", currentQuantity: 100, staple: false };
  assert.deepEqual(adjustmentFor(line, { on: true, qty: String(rememberedQty(10, 1.25)), level: null }), { itemId: "g", quantity: 13 });
});

test("a ringing timer says what to check, looking first", () => {
  assert.equal(timerCue({ cues: { smell: "Toasty.", look: "Golden." }, cue: "x" }), "Golden.");
  assert.equal(timerCue({ cues: { sound: "Quiet sizzle." } }), "Quiet sizzle.");
  assert.equal(timerCue({ cue: "Soft." }), "Soft.");
  assert.equal(timerCue({}), undefined);
});

test("timers screen: soonest first, and the timed steps without a timer can be started", () => {
  const b = timerBoard(
    [{ endsAt: 5000, stepNo: 3 }, { endsAt: 1000, stepNo: 1 }],
    [{ minutes: 2 }, {}, { minutes: 10 }, { seconds: 45 }],
  );
  assert.deepEqual(b.timers.map((x) => x.stepNo), [1, 3]);
  assert.deepEqual(b.startable, [{ stepNo: 4, seconds: 45 }]);
});
