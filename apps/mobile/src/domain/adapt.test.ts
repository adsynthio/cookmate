// Recipe adaptation against the real bundled recipes: rules first, validator always (KIT-051, KIT-052).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { applyModelPlan, applyRules, ingredientFitsDiet, summarise, validateAdaptation, type ValidationContext } from "./adapt.ts";
import type { RecipeDoc } from "./recipes.ts";

const docs = JSON.parse(readFileSync(new URL("../data/recipes.json", import.meta.url), "utf8")) as RecipeDoc[];
const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as {
  name: string; category: string; flags?: string[]; allergens?: string[];
}[];
const byName = new Map(catalog.map((c) => [c.name, c]));
const doc = (slug: string) => docs.find((d) => d.slug === slug)!;
const ctx = (diet?: ValidationContext["diet"]): ValidationContext => ({
  known: (k) => byName.has(k),
  allowed: (d, k) => ingredientFitsDiet(d, byName.get(k)),
  diet,
});

test("diet fit per ingredient", () => {
  assert.equal(ingredientFitsDiet("veg", byName.get("paneer")), true);
  assert.equal(ingredientFitsDiet("vegan", byName.get("paneer")), false);
  assert.equal(ingredientFitsDiet("jain", byName.get("onion")), false);
  assert.equal(ingredientFitsDiet("eggetarian", byName.get("egg")), true);
  assert.equal(ingredientFitsDiet("veg", byName.get("egg")), false);
  assert.equal(ingredientFitsDiet("eggetarian", byName.get("chicken")), false);
});

test("missing curd in kadhi: the reviewed buttermilk rule", () => {
  const a = applyRules(doc("kadhi-pakora"), { missing: ["curd"] });
  assert.ok(a.doc.ingredients.some((i) => i.ingredient === "buttermilk"));
  assert.ok(!a.doc.ingredients.some((i) => i.ingredient === "curd"));
  assert.deepEqual(a.changedSteps, [1]);
  assert.ok(a.changes[0]!.reviewed);
  assert.deepEqual(validateAdaptation(doc("kadhi-pakora"), a, ctx()), []);
});

test("missing amchur in jeera aloo: the recipe's own substitute", () => {
  const a = applyRules(doc("jeera-aloo"), { missing: ["dry mango powder"] });
  assert.ok(a.doc.ingredients.some((i) => i.ingredient === "lemon"));
  assert.deepEqual(a.unresolved, []);
});

test("chilli, aromatics and garnish can simply be left out", () => {
  const a = applyRules(doc("kadhi-pakora"), { missing: ["green chilli", "ginger"] });
  assert.deepEqual(a.unresolved, []);
  assert.ok(!a.doc.ingredients.some((i) => i.ingredient === "green chilli" || i.ingredient === "ginger"));
  assert.match(summarise(a), /milder/);
  assert.deepEqual(validateAdaptation(doc("kadhi-pakora"), a, ctx()), []);
});

test("an essential with nothing to replace it stays unresolved and fails validation", () => {
  const a = applyRules(doc("jeera-aloo"), { missing: ["potato"] });
  assert.deepEqual(a.unresolved, ["potato"]);
  assert.match(validateAdaptation(doc("jeera-aloo"), a, ctx()).join(), /nothing replaces potato/);
});

test("no pressure cooker: the step becomes the reviewed boiling instruction", () => {
  const a = applyRules(doc("jeera-aloo"), { missingEquipment: ["pressure_cooker"] });
  const step = a.doc.steps[0]!;
  assert.match(step.text, /Boil in a covered pot/);
  assert.equal(step.whistles, undefined);
  assert.equal(step.minutes, 20);
  assert.ok(!a.doc.equipment!.includes("pressure_cooker"));
  assert.deepEqual(validateAdaptation(doc("jeera-aloo"), a, ctx()), []);
});

test("jain kadhi: onion and ginger out, and nothing jain-avoid remains", () => {
  const a = applyRules(doc("kadhi-pakora"), { diet: "jain" });
  assert.ok(!a.doc.ingredients.some((i) => i.ingredient === "onion" || i.ingredient === "ginger"));
  const problems = validateAdaptation(doc("kadhi-pakora"), a, ctx("jain"));
  assert.ok(problems.every((p) => !p.includes("onion")), problems.join());
});

test("milder for the table: the reviewed spice rule, or less chilli", () => {
  const a = applyRules(doc("egg-bhurji"), { spice: 1 });
  assert.ok(!a.doc.ingredients.some((i) => i.ingredient === "green chilli"));
  assert.equal(a.doc.spice_level, 1);
  const hotter = applyRules(doc("dal-tadka"), { spice: 5 });
  const before = doc("dal-tadka").ingredients.filter((i) => i.role === "heat").reduce((s, i) => s + i.qty, 0);
  const after = hotter.doc.ingredients.filter((i) => i.role === "heat").reduce((s, i) => s + i.qty, 0);
  assert.ok(after > before);
});

test("in 30 minutes: the reviewed rule makes plain kadhi without the pakora steps", () => {
  const base = doc("kadhi-pakora");
  const a = applyRules(base, { maxTimeMin: 30 });
  assert.deepEqual(a.skipped, [4, 5]);
  assert.equal(a.doc.steps.length, base.steps.length - 2);
  // The frying step and its hot-oil safety note go together; every remaining safety note is unchanged.
  assert.deepEqual(validateAdaptation(base, a, ctx()), []);
});

test("the model can't drop steps: only reviewed rules skip", () => {
  const base = doc("kadhi-pakora");
  const a = applyRules(base, {});
  const dropped = { ...a, doc: { ...a.doc, steps: a.doc.steps.slice(1) } };
  assert.match(validateAdaptation(base, dropped, ctx()).join(), /added or removed/);
});

test("servings scale every quantity", () => {
  const a = applyRules(doc("rajma"), { servings: 2 });
  assert.equal(a.doc.base_servings, 2);
  const kidney = a.doc.ingredients.find((i) => i.ingredient === "kidney beans")!;
  const baseKidney = doc("rajma").ingredients.find((i) => i.ingredient === "kidney beans")!;
  assert.ok(Math.abs(kidney.qty - baseKidney.qty / 2) <= 1);
});

test("the validator rejects model plans that drop safety, cut chicken cooking time or invent ingredients", () => {
  const base = doc("chicken-curry");
  const a = applyRules(base, {});
  const safetyIdx = base.steps.findIndex((s) => s.safety);
  assert.ok(safetyIdx >= 0);

  const shorter = structuredClone(a);
  const s = shorter.doc.steps[safetyIdx]!;
  if (s.minutes) s.minutes = Math.max(1, s.minutes - 5);
  else s.seconds = Math.max(1, (s.seconds ?? 600) - 300);
  assert.match(validateAdaptation(base, shorter, ctx()).join(), /less cooking time/);

  const noSafety = structuredClone(a);
  delete noSafety.doc.steps[safetyIdx]!.safety;
  assert.match(validateAdaptation(base, noSafety, ctx()).join(), /safety note changed/);

  const invented = applyModelPlan({ ...a, unresolved: ["chicken"] }, {
    replacements: [{ missing: "chicken", use: "unicorn meat", ratio: 1, note: "x" }],
    stepEdits: [{ step: 1, text: "Marinate the chicken; it's fine slightly pink." }],
    summary: "",
  });
  const problems = validateAdaptation(base, invented, ctx()).join();
  assert.match(problems, /unknown ingredient unicorn meat/);
  assert.match(problems, /unsafe instruction/);
});

test("no chilli means no heat ingredients at all", () => {
  const a = applyRules(doc("kadhi-pakora"), { spice: 1 });
  assert.equal(a.doc.ingredients.filter((i) => i.role === "heat").length, 0);
  assert.deepEqual(validateAdaptation(doc("kadhi-pakora"), a, ctx()), []);
});

test("summary leads with reviewed notes", () => {
  const a = applyRules(doc("jeera-aloo"), { missingEquipment: ["pressure_cooker"], spice: 1 });
  assert.match(summarise(a), /^Boil in a covered pot/);
});
