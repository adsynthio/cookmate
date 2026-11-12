import assert from "node:assert/strict";
import { test } from "node:test";

import { DRINKS } from "../data/drinks.ts";
import { drinkMatch, drinksFor, kitchenHas, say } from "./drinks.ts";

test("cocktails stay hidden until the cook confirms their age", () => {
  assert.equal(drinksFor(DRINKS, "all", false).some((d) => d.alcoholic), false);
  assert.equal(drinksFor(DRINKS, "cocktails", false).length, 0);
  assert.ok(drinksFor(DRINKS, "cocktails", true).every((d) => d.alcoholic));
  assert.ok(drinksFor(DRINKS, "everyday", true).every((d) => !d.alcoholic));
  assert.equal(drinksFor(DRINKS, "all", true).length, DRINKS.length);
});

test("kitchen match counts only tracked, non-optional ingredients", () => {
  const nimbu = DRINKS.find((d) => d.id === "nimbu-pani")!;
  const m = drinkMatch(nimbu, new Set(["lemon", "sugar"]));
  assert.equal(m.total, 4);
  assert.equal(m.have, 2);
  assert.deepEqual(m.missing.map((i) => i.key), ["black salt", "roasted cumin powder"]);
});

test("every drink is complete in all three languages", () => {
  for (const d of DRINKS) {
    for (const text of [d.title, d.about, ...d.steps, ...d.ingredients.map((i) => i.amount), ...d.ingredients.flatMap((i) => (i.name ? [i.name] : []))]) {
      for (const loc of ["en", "hi", "hinglish"] as const) assert.ok(text[loc]?.trim(), `${d.id}: missing ${loc}`);
    }
    assert.ok(d.ingredients.every((i) => i.key || i.name), `${d.id}: an ingredient has no name`);
  }
  assert.equal(say(DRINKS[0]!.title, "hi"), "मसाला नींबू पानी");
  assert.equal(say(DRINKS[0]!.title, "xx"), "Masala nimbu pani");
});

test("staples count as in the kitchen unless marked Out", () => {
  const have = kitchenHas([{ ingredientKey: "lemon", stapleLevel: null }, { ingredientKey: "sugar", stapleLevel: "out" }], ["sugar", "black salt"]);
  assert.deepEqual([...have].sort(), ["black salt", "lemon"]);
});
