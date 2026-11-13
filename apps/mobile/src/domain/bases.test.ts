import { test } from "node:test";
import assert from "node:assert/strict";

import { minutesSaved, readyBases, shortcuts } from "./bases.ts";

const item = (name: string, extra: Record<string, unknown> = {}) => ({ ingredientKey: null, name, state: "homemade", confidence: 0.9, ...extra });

test("what's ready: a homemade masala, ginger-garlic paste, boiled chana", () => {
  const r = readyBases([
    item("Onion-tomato masala"),
    item("ginger garlic paste", { ingredientKey: "ginger garlic paste", state: "raw" }),
    item("Boiled chana", { ingredientKey: "chickpeas", state: "cooked" }),
    item("chickpeas", { ingredientKey: "kidney beans", state: "raw" }),
    item("pyaz tamatar masala", { confidence: 0.3 }),
  ]);
  assert.deepEqual([...r.bases].sort(), ["boiled_pulse", "gg_paste", "masala"]);
  assert.deepEqual([...r.pulses], ["chickpeas"]);
  // A batch saved after cooking, by name.
  const batch = readyBases([item("Leftover Boiled Rajma", { state: "leftover" }), item("Leftover Ginger-Garlic Paste", { state: "leftover" })]);
  assert.deepEqual([...batch.pulses], ["kidney beans"]);
  assert.ok(batch.bases.has("gg_paste"));
  assert.equal(readyBases([item("Leftover Chole", { state: "leftover" })]).pulses.size, 0);
  // Raw rajma is not boiled rajma.
  assert.equal(readyBases([item("rajma", { ingredientKey: "kidney beans", state: "raw" })]).bases.size, 0);
});

const chole = {
  ingredients: ["chickpeas", "onion", "tomato", "ginger", "garlic", "refined oil"].map((ingredient) => ({ ingredient })),
  steps: [
    { text: "Soak the chickpeas overnight.", technique: "soak", minutes: 480 },
    { text: "Pressure-cook the soaked chickpeas with tea bags.", technique: "pressure_cook", minutes: 25 },
    { text: "Fry the onion until golden, then add grated ginger and garlic.", technique: "saute_onion", minutes: 12 },
    { text: "Add tomato and cook until the oil separates.", technique: "bhuna", minutes: 8 },
    { text: "Add the chickpeas and simmer.", technique: "simmer", minutes: 15 },
  ],
};

test("a ready masala and boiled chana replace their steps", () => {
  const cuts = shortcuts(chole, readyBases([item("onion tomato masala"), item("boiled chana", { ingredientKey: "chickpeas", state: "cooked" })]));
  assert.deepEqual(cuts.map((c) => [c.base, c.steps, c.savesMin]), [["masala", [3, 4], 16], ["boiled_pulse", [1, 2], 505]]);
  assert.equal(minutesSaved(cuts), 521);
});

test("ginger-garlic paste stands in for grating, at the first step that uses them", () => {
  const cuts = shortcuts(chole, readyBases([item("ginger garlic paste", { ingredientKey: "ginger garlic paste", state: "raw" })]));
  assert.deepEqual(cuts, [{ base: "gg_paste", steps: [3], savesMin: 3 }]);
  // A dish without tomato doesn't use the masala.
  const noTomato = { ...chole, ingredients: chole.ingredients.filter((i) => i.ingredient !== "tomato") };
  assert.deepEqual(shortcuts(noTomato, readyBases([item("onion tomato masala")])), []);
});
