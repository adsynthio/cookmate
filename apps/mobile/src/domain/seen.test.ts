import assert from "node:assert/strict";
import { test } from "node:test";

import { addSeen, ideasLead, emptySeen, lately } from "./seen.ts";

const H = 3_600_000;

test("what Home showed lately: dishes for 2 days, ideas for 3, newest first", () => {
  const t0 = Date.UTC(2026, 10, 22, 12);
  let s = addSeen(emptySeen(), { recipeIds: ["jeera-aloo", "kadhi-pakora"], ideas: ["Pav Bhaji"] }, t0);
  s = addSeen(s, { recipeIds: ["dal-tadka"], ideas: ["Masala Dosa"] }, t0 + 2 * H);
  assert.deepEqual(lately(s, t0 + 3 * H), { recipes: ["dal-tadka", "jeera-aloo", "kadhi-pakora"], ideas: ["Masala Dosa", "Pav Bhaji"] });
  assert.deepEqual(lately(s, t0 + 49 * H).recipes, ["dal-tadka"], "two days later the first batch can come back");
  assert.deepEqual(lately(s, t0 + 49 * H).ideas, ["Masala Dosa", "Pav Bhaji"]);
  assert.deepEqual(lately(s, t0 + 75 * H).ideas, []);
  const pruned = addSeen(s, { recipeIds: [], ideas: [] }, t0 + 80 * H);
  assert.deepEqual(pruned, emptySeen(), "old entries are dropped when the record is saved");
});

test("new dishes lead when the library's top dish is a repeat, or nothing from the library fits", () => {
  assert.equal(ideasLead("jeera-aloo", 3, ["jeera-aloo", "dal-tadka"]), true);
  assert.equal(ideasLead("matar-paneer", 3, ["jeera-aloo"]), false);
  assert.equal(ideasLead(null, 2, []), true);
  assert.equal(ideasLead("jeera-aloo", 0, ["jeera-aloo"]), false);
});
