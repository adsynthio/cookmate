// M5: the cook's own tricks.
import assert from "node:assert/strict";
import { test } from "node:test";

import { trickIn } from "./learning.ts";
import { trickFor, tricksFrom } from "./tricks.ts";

const find = (text: string) => ["baking soda", "eno", "fresh cream", "milk"].filter((k) => text.toLowerCase().includes(k.split(" ").pop()!) || (k === "baking soda" && /soda|सोडा/i.test(text)) || (k === "eno" && /eno|ईनो/i.test(text)));

test("a trick is read in English, Hinglish and Hindi, but not when it failed", () => {
  assert.deepEqual(trickIn("Used Eno instead of baking soda, came out great", find), { use: "eno", from: "baking soda" });
  assert.deepEqual(trickIn("soda ki jagah eno daala", find), { use: "eno", from: "baking soda" });
  assert.deepEqual(trickIn("सोडा की जगह ईनो", find), { use: "eno", from: "baking soda" });
  assert.equal(trickIn("Eno instead of soda but it didn't work", find), null);
  assert.equal(trickIn("added more salt", find), null);
});

test("tricks come from memories and are offered only when the kitchen has the stand-in", () => {
  const tricks = tricksFrom([
    { about: "trick:baking soda", ingredientKey: "eno", polarity: 1 },
    { about: "preference", ingredientKey: "garlic", polarity: -1 },
  ]);
  assert.deepEqual(tricks, [{ from: "baking soda", use: "eno" }]);
  assert.deepEqual(trickFor("baking soda", tricks, (k) => k === "eno"), { from: "baking soda", use: "eno" });
  assert.equal(trickFor("baking soda", tricks, () => false), null);
  assert.equal(trickFor("baking soda", tricks, () => true, ["eno"]), null);
});
