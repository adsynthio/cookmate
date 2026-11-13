// Pure helpers for adapt-recipe (no network). Tested with `deno test`.
import { ingredientFitsDiet, type ValidationContext } from "../_shared/adapt.ts";
import catalogJson from "../_shared/catalog.json" with { type: "json" };
import type { Diet } from "../_shared/ranking.ts";
import type { RecipeDoc } from "../_shared/recipes.ts";
import { checkRecipe, problemLines } from "../_shared/recipeSafety.ts";

type CatalogRow = { name: string; category: string; flags?: string[]; allergens?: string[] };
const catalog = new Map((catalogJson as CatalogRow[]).map((c) => [c.name, c]));

export function validationContext(diet?: Diet): ValidationContext {
  return {
    known: (k) => catalog.has(k),
    allowed: (d, k) => ingredientFitsDiet(d, catalog.get(k)),
    diet,
  };
}

/** The shared safety gate (G1) on an adapted recipe, for the table's diet when one was asked for. */
export function safetyProblems(doc: RecipeDoc, diet?: Diet): string[] {
  return problemLines(checkRecipe(doc, { catalog, diet }));
}

/** Every catalog ingredient, for the model's allowed list. */
export function catalogNames(): string[] {
  return [...catalog.keys()];
}

export const DIETS: Diet[] = ["veg", "eggetarian", "nonveg", "jain", "vegan"];

/** Equipment the recipe needs that the household's kitchen list doesn't have (none when the list is empty). */
export function missingEquipment(needed: string[], kitchen: string[]): string[] {
  if (!kitchen.length) return [];
  return needed.filter((e) => !kitchen.includes(e));
}

/** Rows to save an adapted variant under the household, linked to its base recipe (KIT-051). */
export function variantRows(
  base: RecipeDoc,
  adapted: RecipeDoc,
  ids: { recipeId: string; householdId: string; memberId: string; ingredientIds: Map<string, string> },
  summary: string,
) {
  const recipe = {
    id: ids.recipeId,
    household_id: ids.householdId,
    parent_recipe_id: base.id,
    created_by_member_id: ids.memberId,
    slug: null,
    title: adapted.title,
    titles: adapted.titles ?? {},
    description: summary || adapted.description,
    cuisine_region: adapted.cuisine_region ?? null,
    course: adapted.course,
    diet: adapted.diet,
    base_servings: adapted.base_servings,
    prep_time_min: adapted.prep_time_min ?? null,
    cook_time_min: adapted.cook_time_min ?? null,
    difficulty: adapted.difficulty,
    spice_level: adapted.spice_level,
    equipment: adapted.equipment ?? [],
    tags: adapted.tags ?? [],
    flavor_profile: adapted.flavor_profile ?? {},
    food_groups: adapted.food_groups ?? [],
    source: "adapted",
    review_status: "draft",
    is_published: false,
  };
  const ingredients = adapted.ingredients.map((i, n) => ({
    recipe_id: ids.recipeId,
    ingredient_id: ids.ingredientIds.get(i.ingredient) ?? null,
    display_name: i.ingredient,
    quantity: i.qty,
    unit: i.unit,
    local_measure: i.local ?? null,
    is_optional: !!i.optional,
    group_name: i.group ?? null,
    role: i.role,
    substitutes: (i.substitutes ?? []).map((s) => ({
      ingredient_id: ids.ingredientIds.get(s.ingredient) ?? null,
      ingredient: s.ingredient,
      ratio: s.ratio,
      note: s.note ?? null,
    })),
    sort_order: n,
  }));
  const steps = adapted.steps.map((s, n) => ({
    recipe_id: ids.recipeId,
    step_no: n + 1,
    instruction: s.text,
    instructions: { en: s.text },
    duration_sec: s.seconds ?? (s.minutes ? s.minutes * 60 : null),
    timer_required: !!s.timer,
    whistles: s.whistles ?? null,
    sensory_cue: s.cue ?? null,
    sensory_cues: s.cue ? { en: s.cue } : {},
    member_branch: s.branch ?? null,
    safety_note: s.safety ?? null,
    technique_slug: s.technique ?? null,
  }));
  return { recipe, ingredients, steps };
}
