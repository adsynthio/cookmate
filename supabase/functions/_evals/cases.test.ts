// Offline checks that run with every deno test (no model): the cases are well formed and the graders behave.
import { assert, assertEquals } from "jsr:@std/assert@1";

import { PROBLEMS } from "../_shared/rescue.ts";
import { contextFor } from "../rescue/logic.ts";
import { f1, itemScore, regressions, rescueProblems } from "./graders.ts";
import { catalog, hints, parseCases, recipes, rescueCases } from "./load.ts";

const names = new Set(catalog.map((c) => c.name));

Deno.test("every parse case names real catalog ingredients", () => {
  const cases = parseCases();
  assert(cases.length >= 20);
  for (const c of cases) for (const e of c.expect) assert(e.key === null ? !!e.said : names.has(e.key), `${c.text}: ${e.key}`);
  assert(hints().split("\n").length === catalog.length);
});

Deno.test("every rescue case points at a real recipe step, problem and pantry", () => {
  for (const c of rescueCases()) {
    const doc = recipes.get(c.recipe);
    assert(doc, c.recipe);
    assert(c.step >= 1 && c.step <= doc.steps.length, `${c.recipe} step ${c.step}`);
    assert((PROBLEMS as readonly string[]).includes(c.problem), c.problem);
    for (const p of c.pantry) assert(names.has(p), `${c.recipe}: ${p}`);
    for (const re of [...(c.expect.mentions_any ?? []), ...(c.expect.never ?? [])]) new RegExp(re, "i");
  }
});

Deno.test("item F1: exact items score 1, wrong amounts half, inventions and misses lower it", () => {
  const exp = [{ key: "potato", quantity: 2, unit: "kg" }, { key: "onion" }];
  const g = (key: string, quantity: number | null = null, unit: string | null = null) => ({ said: key, ingredient_key: key, quantity, unit });
  assertEquals(f1(itemScore(exp, [g("potato", 2, "kg"), g("onion")])), 1);
  assertEquals(itemScore(exp, [g("potato", 1, "kg"), g("onion")]).tp, 1.5);
  assertEquals(f1(itemScore(exp, [g("potato", 2, "kg"), g("onion"), g("garlic")])), 0.8);
  assertEquals(f1(itemScore(exp, [g("potato", 2, "kg")])), 2 / 3);
  assertEquals(itemScore([{ key: "ghee", quantity: 250, unit: "g" }], [g("ghee", 0.25, "kg")]).tp, 1, "same amount, other unit");
  assertEquals(itemScore([{ key: "ghee", quantity: 250, unit: "g" }], [g("ghee", 250, "kg")]).tp, 0.5, "different amount");
  assertEquals(itemScore([{ key: null, said: "chutney" }], [{ said: "hari chutney", ingredient_key: null, quantity: null, unit: null }]).tp, 1);
});

Deno.test("rescue grading uses the function's own validator plus the case's checks", () => {
  const doc = recipes.get("jeera-aloo")!;
  const ctx = contextFor(doc, ["potato", "onion"]);
  assertEquals(rescueProblems({ steps: ["Turn the flame down to low."], uses: [] }, ctx, { mentions_any: ["flame"] }), []);
  assert(rescueProblems({ steps: ["Add some chocolate."], uses: ["chocolate"] }, ctx, {}).length > 0, "not in the kitchen");
  assert(rescueProblems({ steps: ["Add salt."], uses: [] }, ctx, { mentions_any: ["flame"] }).length > 0, "missed the point");
  // A missing ingredient may be named ("skip the curry leaves"), but the fix must not rely on it.
  const poha = contextFor(recipes.get("kanda-poha")!, ["onion", "lemon"], "curry leaves");
  assertEquals(rescueProblems({ steps: ["Curry leaves are missing, so skip them."], uses: [] }, poha, { without: "curry leaves" }), []);
  assert(rescueProblems({ steps: ["Add curry leaves."], uses: ["curry leaves"] }, poha, { without: "curry leaves" }).length > 0);
});

Deno.test("a score under the floor, or well under the last accepted one, is a regression", () => {
  const b = { t: { min: 0.9, last: 0.97, tolerance: 0.03 } };
  assertEquals(regressions({ t: 0.95 }, b), []);
  assertEquals(regressions({ t: 0.93 }, b).length, 1);
  assertEquals(regressions({ t: 0.85 }, b).length, 1);
  assertEquals(regressions({ other: 0.1 }, b), []);
});
