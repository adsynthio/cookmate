import { assertEquals, assertMatch } from "jsr:@std/assert@1";

import { applyModelPlan, applyRules, validateAdaptation } from "../_shared/adapt.ts";
import type { RecipeDoc } from "../_shared/recipes.ts";
import { missingEquipment, validationContext, variantRows } from "./logic.ts";

const base: RecipeDoc = {
  id: "base-1",
  slug: "jeera-aloo",
  title: "Jeera Aloo",
  description: "x",
  course: "side",
  diet: "vegan",
  base_servings: 4,
  difficulty: 1,
  spice_level: 2,
  equipment: ["pressure_cooker", "kadai"],
  review_status: "draft",
  ingredients: [
    { ingredient: "potato", qty: 500, unit: "g", role: "base" },
    { ingredient: "dry mango powder", qty: 1.25, unit: "g", role: "acid", substitutes: [{ ingredient: "lemon", ratio: 1 }] },
    { ingredient: "green chilli", qty: 6, unit: "g", role: "heat" },
  ],
  steps: [
    { text: "Pressure-cook the potatoes.", technique: "pressure_cook", whistles: 2, minutes: 10 },
    { text: "Toss with cumin and amchur.", minutes: 6, safety: "Hot oil: keep children away." },
  ],
  variation_rules: [
    { type: "equipment", condition: { missing_equipment: "pressure_cooker" }, action: { method: "boil", minutes: 20, at_step: 1 }, note: "Boil covered for 20 minutes." },
  ],
};

Deno.test("missing equipment only when the household listed its kitchen", () => {
  assertEquals(missingEquipment(["pressure_cooker", "kadai"], []), []);
  assertEquals(missingEquipment(["pressure_cooker", "kadai"], ["kadai", "tawa"]), ["pressure_cooker"]);
});

Deno.test("catalog-backed validation: diets and unknown ingredients", () => {
  const a = applyRules(base, { missing: ["dry mango powder"], missingEquipment: ["pressure_cooker"] });
  assertEquals(validateAdaptation(base, a, validationContext("vegan")), []);
  const bad = applyModelPlan({ ...a, unresolved: ["potato"] }, {
    replacements: [{ missing: "potato", use: "paneer", ratio: 1, note: "use paneer" }],
    stepEdits: [],
    summary: "",
  });
  assertMatch(validateAdaptation(base, bad, validationContext("vegan")).join(), /paneer doesn't fit a vegan diet/);
});

Deno.test("variant rows link back to the base and keep safety notes", () => {
  const a = applyRules(base, { missingEquipment: ["pressure_cooker"] });
  const rows = variantRows(base, a.doc, {
    recipeId: "new-1",
    householdId: "hh",
    memberId: "m1",
    ingredientIds: new Map([["potato", "ing-potato"]]),
  }, "Boil covered for 20 minutes.");
  assertEquals(rows.recipe.parent_recipe_id, "base-1");
  assertEquals(rows.recipe.household_id, "hh");
  assertEquals(rows.recipe.source, "adapted");
  assertEquals(rows.recipe.equipment, ["kadai"]);
  assertEquals(rows.ingredients[0]!.ingredient_id, "ing-potato");
  assertEquals(rows.steps[0]!.duration_sec, 1200);
  assertEquals(rows.steps[0]!.whistles, null);
  assertEquals(rows.steps[1]!.safety_note, "Hot oil: keep children away.");
});
