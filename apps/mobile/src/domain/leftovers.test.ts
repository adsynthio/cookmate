import assert from "node:assert/strict";
import { test } from "node:test";

import { ideasFor, leftoverKind, needsRiceCare } from "./leftovers.ts";

test("the kind of leftover is read from its name in any language", () => {
  const cases: [string, string][] = [
    ["Dal Tadka leftovers", "dal"],
    ["leftover dal", "dal"],
    ["बची हुई दाल", "dal"],
    ["Moong Dal Khichdi leftovers", "khichdi"],
    ["Rajma leftovers", "rajma"],
    ["rajma chawal", "rajma"],
    ["बचा हुआ राजमा", "rajma"],
    ["Matar Paneer leftovers", "curry"],
    ["Chicken Curry leftovers", "curry"],
    ["Jeera Aloo leftovers", "sabzi"],
    ["bachi hui sabzi", "sabzi"],
    ["4 roti", "roti"],
    ["बचे हुए चावल", "rice"],
    ["plain rice", "rice"],
    ["Kadhi Pakora leftovers", "kadhi"],
    ["Kanda Poha leftovers", "poha"],
    ["Besan Chilla leftovers", "poha"],
    ["green chutney", "other"],
  ];
  for (const [name, kind] of cases) assert.equal(leftoverKind(name), kind, name);
});

test("only cooked food gets ideas, and every kind has at least one", () => {
  assert.equal(ideasFor({ name: "tomato", state: "raw" }), null);
  assert.deepEqual(ideasFor({ name: "leftover dal", state: "leftover" })?.ideas, ["dalParatha", "dalChilla", "dalTadka"]);
  assert.deepEqual(ideasFor({ name: "chutney", state: "cooked" })?.ideas, ["anyWrap"]);
});

test("rice and khichdi carry the rice safety line", () => {
  assert.equal(needsRiceCare("rice"), true);
  assert.equal(needsRiceCare("khichdi"), true);
  assert.equal(needsRiceCare("dal"), false);
});
