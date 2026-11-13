// M6: the simpler version.
import assert from "node:assert/strict";
import { test } from "node:test";

import recipesJson from "../data/recipes.json" with { type: "json" };
import { setSimple, usualSkips } from "./habits.ts";
import type { RecipeDoc } from "./recipes.ts";
import { simplerLeaveOut } from "./simpler.ts";

const library = recipesJson as unknown as RecipeDoc[];

test("only optional extras and garnishes, never salt or the base", () => {
  for (const r of library) {
    for (const k of simplerLeaveOut(r)) {
      const ing = r.ingredients.find((i) => i.ingredient === k)!;
      assert.ok(ing.optional || ing.role === "garnish", `${r.slug}: ${k}`);
      assert.notEqual(k, "salt");
    }
  }
  assert.ok(library.some((r) => simplerLeaveOut(r).length > 0), "some dishes have extras to spare");
});

test("choosing the simpler version skips those extras; putting one back or going back to full works", () => {
  let h = setSimple({}, "dal", ["coriander leaves", "ghee"]);
  assert.deepEqual(usualSkips(h, "dal").sort(), ["coriander leaves", "ghee"]);
  h = { ...h, dal: { ...h.dal!, keep: ["ghee"] } };
  assert.deepEqual(usualSkips(h, "dal"), ["coriander leaves"]);
  h = setSimple(h, "dal", null);
  assert.deepEqual(usualSkips(h, "dal"), []);
});
