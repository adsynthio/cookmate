import { test } from "node:test";
import assert from "node:assert/strict";

import { heatStep, isFamiliar, keepIngredient, mildShare, recordCook, setFull, shortStep, usualSkips, type Habits } from "./habits.ts";

test("an ingredient left out twice in a row is left out by default, until it's put back", () => {
  let h: Habits = {};
  h = recordCook(h, "aloo-methi", ["fenugreek leaves"]);
  assert.deepEqual(usualSkips(h, "aloo-methi"), [], "once is not a habit");
  h = recordCook(h, "aloo-methi", ["fenugreek leaves", "garlic"]);
  assert.deepEqual(usualSkips(h, "aloo-methi"), ["fenugreek leaves"]);
  h = recordCook(h, "aloo-methi", ["garlic"]);
  assert.deepEqual(usualSkips(h, "aloo-methi"), ["garlic"]);
  h = keepIngredient(h, "aloo-methi", "garlic");
  h = recordCook(h, "aloo-methi", ["garlic"]);
  assert.deepEqual(usualSkips(h, "aloo-methi"), []);
  assert.equal(h["aloo-methi"]?.skipped.length, 3);
});

test("familiar after three cooks; full steps sticks", () => {
  let h: Habits = {};
  for (let i = 0; i < 2; i++) h = recordCook(h, "rajma", []);
  assert.equal(isFamiliar(h, "rajma"), false);
  h = recordCook(h, "rajma", []);
  assert.equal(isFamiliar(h, "rajma"), true);
  h = setFull(h, "rajma", true);
  assert.equal(isFamiliar(h, "rajma"), false);
  assert.equal(shortStep("Heat the oil. Add cumin and wait."), "Heat the oil.");
  assert.equal(shortStep("तेल गरम करें। जीरा डालें।"), "तेल गरम करें।");
  // Never drop a sentence about food safety.
  const marinate = "Mix the chicken with the curd. Cover and keep in the fridge.";
  assert.equal(shortStep(marinate), marinate);
});

test("a mild share for whoever finds it too spicy", () => {
  const steps = [{ text: "Soak the rajma." }, { text: "Add ginger, garlic and green chilli." }];
  assert.equal(heatStep(steps), 2);
  assert.equal(heatStep([{ text: "Boil rice." }]), null);
  const eaters = [
    { id: "a", displayName: "Papa", spice: 3, ageGroup: "adult" },
    { id: "b", displayName: "Dadi", spice: 1, ageGroup: "elder" },
    { id: "c", displayName: "Aarav", spice: 0, ageGroup: "child" },
  ];
  // Dadi likes it mild and the dish is hot; Aarav already has a child branch.
  assert.deepEqual(mildShare(3, ["rajma"], eaters, []), ["Dadi"]);
  // Papa said this dish was too spicy.
  assert.deepEqual(mildShare(2, ["rajma"], eaters, [{ memberId: "a", recipeId: "rajma", about: "spice", polarity: -1 }]), ["Papa"]);
  // About another dish: not this one.
  assert.deepEqual(mildShare(2, ["rajma"], eaters, [{ memberId: "a", recipeId: "kadhi", about: "spice", polarity: -1 }]), []);
  assert.deepEqual(mildShare(1, ["rajma"], eaters, [{ memberId: "a", recipeId: null, about: "spice", polarity: -1 }]), []);
});
