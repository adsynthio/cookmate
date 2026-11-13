import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { stepIngredients, TIPS, tipFor } from "./tips.ts";

const catalog = new Set((JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { name: string }[]).map((c) => c.name));

test("every tip names real ingredients and has all three languages", () => {
  for (const t of TIPS) {
    for (const k of t.ingredients ?? []) assert.ok(catalog.has(k), `${t.id}: ${k}`);
    for (const l of ["en", "hi", "hinglish"] as const) assert.ok(t.text[l].length > 10 && t.text[l].length < 160, `${t.id} ${l}`);
  }
});

test("the dish's own tip first, changing by day", () => {
  const rajma = { ingredients: [{ ingredient: "kidney beans" }, { ingredient: "onion" }] };
  const ids = new Set([0, 1, 2, 3, 4].map((d) => tipFor(rajma, d, "en").id));
  assert.ok(ids.has("rajma-salt") && ids.has("onion-salt"));
  assert.equal(tipFor({ ingredients: [], tags: ["one_pot"] }, 0, "en").id, "one-pot");
  assert.equal(tipFor({ ingredients: [] }, 5, "hi").id, "taste-end");
});

test("a tip about what the first step uses, found by any of its names", () => {
  const chilla = { ingredients: [{ ingredient: "gram flour" }, { ingredient: "onion" }, { ingredient: "tomato" }] };
  const step = "Whisk the besan with turmeric, chilli powder, ajwain, salt and about 250 ml water into a smooth batter.";
  const names = (k: string) => (k === "gram flour" ? ["besan"] : []);
  const focus = stepIngredients(step, chilla.ingredients.map((i) => i.ingredient), names);
  assert.deepEqual(focus, ["gram flour"]);
  for (const d of [0, 1, 2, 3]) assert.equal(tipFor(chilla, d, "en", focus).id, "besan-roast");
  // Nothing in the step that has a tip: the dish's other tips still rotate.
  assert.ok(["onion-salt", "masala-oil", "besan-roast"].includes(tipFor(chilla, 1, "en", []).id));
});
